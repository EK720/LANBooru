import fs from 'fs/promises';
import path from 'path';
import { execute, query, queryOne, transaction } from '../database/connection';
import { extractMetadata } from './exif';
import { generateThumbnail, calculateFileHash, deleteThumbnail } from './thumbnail';
import { Folder, Image } from '../types';

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.mp4', '.webm', '.mkv', '.webp'];

// Global scan lock to prevent concurrent scans
let isScanningInProgress = false;
let scanLockResolve: (() => void) | null = null;

// Acquire scan lock, waiting if necessary
async function acquireScanLock(wait: boolean = true): Promise<boolean> {
  if (!isScanningInProgress) {
    isScanningInProgress = true;
    return true;
  }

  if (!wait) {
    return false; // Don't wait, just skip
  }

  // Wait for lock to be released
  console.log('Waiting for ongoing scan to complete...');
  await new Promise<void>(resolve => {
    scanLockResolve = resolve;
  });

  isScanningInProgress = true;
  return true;
}

/**
 * Release scan lock
 */
function releaseScanLock(): void {
  isScanningInProgress = false;
  if (scanLockResolve) {
    const resolve = scanLockResolve;
    scanLockResolve = null;
    resolve();
  }
}

/**
 * Scan a folder for images and add them to the database
 * @param folder - Folder to scan
 * @param waitForLock - If true, waits for ongoing scans. If false, skips if scan in progress
 */
export async function scanFolder(folder: Folder, waitForLock: boolean = true): Promise<number> {
  // Acquire lock
  const acquired = await acquireScanLock(waitForLock);
  if (!acquired) {
    console.log(`Skipping scan of ${folder.path} - another scan in progress`);
    return 0;
  }

  try {
    console.log(`Scanning folder: ${folder.path} (recursive: ${folder.recursive ? "true" : "false"})`);

    let addedCount = 0;
    const files = await findImageFiles(folder.path, folder.recursive);

    for (const filePath of files) {
      try {
        const added = await processFile(filePath);
        if (added) addedCount++;
      } catch (error) {
        console.error(`Error processing ${filePath}:`, error);
      }
    }

    // Update last scanned timestamp
    await execute(
      'UPDATE folders SET last_scanned_at = NOW() WHERE id = ?',
      [folder.id]
    );

    console.log(`Scan complete: ${addedCount} new images added from ${folder.path}`);
    return addedCount;
  } finally {
    releaseScanLock();
  }
}

// Find all image files in a directory
async function findImageFiles(dirPath: string, recursive: boolean | string): Promise<string[]> {
  const files: string[] = [];
  // i hate javascript, apparently those param types aren't enforced at all
  recursive = recursive === true || recursive === 'true' || Number(recursive) === 1;
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory() && recursive) {
        // Recursively scan subdirectories
        const subFiles = await findImageFiles(fullPath, recursive);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
  }

  return files;
}

// Process a single file and add it to the database
async function processFile(filePath: string): Promise<boolean> {
  try {
    // Check if file exists and get stats
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) return false;

    // Calculate file hash
    const fileHash = await calculateFileHash(filePath);

    // Check if image already exists in database
    const existing = await queryOne<Image>(
      'SELECT id, file_hash, updated_at FROM images WHERE file_path = ?',
      [filePath]
    );

    // If exists and hash matches, skip
    if (existing && existing.file_hash === fileHash) {
      return false; // Not added (already exists)
    }

    // Extract metadata
    const metadata = await extractMetadata(filePath);

    // If file exists but hash changed, delete old entry
    if (existing) {
      await deleteImage(existing.id);
    }

    // Generate thumbnail and get multi-resolution dHashes
    const contentHashes = await generateThumbnail(filePath, fileHash);

    // Insert image first (we need the ID to compare with duplicates)
    const result = await execute(
      `INSERT INTO images
        (file_path, filename, file_type, file_size, file_hash, content_hash_800, content_hash_600, content_hash_1400, width, height, artist, rating, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        filePath,
        path.basename(filePath),
        path.extname(filePath).toLowerCase().substring(1), // Remove leading dot
        stats.size,
        fileHash,
        contentHashes.hash800,
        contentHashes.hash600,
        contentHashes.hash1400,
        metadata.width || 0,
        metadata.height || 0,
        metadata.artist || null,
        metadata.rating || null,
        metadata.source || null,
        metadata.date || new Date()
      ]
    );

    const imageId = result.insertId;

    // Add initial tags
    if (metadata.tags.length > 0) {
      await addTagsToImage(imageId, metadata.tags);
    }

    // Check for duplicates by matching ANY of the 3 content hashes
    const duplicates = await query<Image>(
      `SELECT id, width, height, file_path FROM images
       WHERE (content_hash_800 = ? OR content_hash_600 = ? OR content_hash_1400 = ?)`,
      [contentHashes.hash800, contentHashes.hash600, contentHashes.hash1400]
    );

    if (duplicates.length > 1) {
      console.log(`Duplicate detected: ${duplicates.length} images with same content`);

      // Find highest quality version (by resolution)
      let bestImage = duplicates[0];
      let bestResolution = bestImage.width * bestImage.height;

      for (const img of duplicates.slice(1)) {
        const resolution = img.width * img.height;
        if (resolution > bestResolution) {
          bestImage = img;
          bestResolution = resolution;
        }
      }

      console.log(`Best quality version: ID ${bestImage.id} (${bestImage.width}x${bestImage.height})`);

      // Collect all tags from all duplicates
      const allTags = new Set<string>();
      for (const img of duplicates) {
        const tags = await query<{ name: string }>(
          `SELECT t.name FROM tags t
           JOIN image_tags it ON t.id = it.tag_id
           WHERE it.image_id = ?`,
          [img.id]
        );
        tags.forEach(t => allTags.add(t.name));
      }

      // Add duplicate_image tag
      allTags.add('duplicate_image');

      // Apply merged tags to the best quality version
      await addTagsToImage(bestImage.id, Array.from(allTags));

      // For all other versions, just add duplicate_image tag
      for (const img of duplicates) {
        if (img.id !== bestImage.id) {
          await addTagsToImage(img.id, ['duplicate_image']);
        }
      }
    }

    console.log(`Added: ${path.basename(filePath)} (${metadata.tags.length} tags) as ID ${imageId}`);
    return true;
  } catch (error) {
    console.error(`Failed to process ${filePath}:`, error);
    return false;
  }
}

// Add tags to an image
async function addTagsToImage(imageId: number, tagNames: string[]): Promise<void> {
  await transaction(async (conn) => {
    for (const tagName of tagNames) {
      // Insert tag if it doesn't exist
      await conn.query(
        'INSERT INTO tags (name, count) VALUES (?, 1) ON DUPLICATE KEY UPDATE count = count + 1',
        [tagName]
      );

      // Get tag ID
      const [tagRows] = await conn.query<any[]>(
        'SELECT id FROM tags WHERE name = ?',
        [tagName]
      );

      if (tagRows.length > 0) {
        const tagId = tagRows[0].id;

        // Link image to tag
        await conn.query(
          'INSERT IGNORE INTO image_tags (image_id, tag_id) VALUES (?, ?)',
          [imageId, tagId]
        );
      }
    }
  });
}

/**
 * Delete an image and its associations
 */
async function deleteImage(imageId: number): Promise<void> {
  const image = await queryOne<Image>(
    'SELECT file_hash FROM images WHERE id = ?',
    [imageId]
  );

  if (!image) return;

  await transaction(async (conn) => {
    // Get tags associated with this image
    const [tagIds] = await conn.query<any[]>(
      'SELECT tag_id FROM image_tags WHERE image_id = ?',
      [imageId]
    );

    // Delete image-tag associations
    await conn.query('DELETE FROM image_tags WHERE image_id = ?', [imageId]);

    // Decrement tag counts and remove tags with 0 count
    for (const row of tagIds) {
      await conn.query(
        'UPDATE tags SET count = count - 1 WHERE id = ?',
        [row.tag_id]
      );
      await conn.query('DELETE FROM tags WHERE id = ? AND count <= 0', [row.tag_id]);
    }

    // Delete image
    await conn.query('DELETE FROM images WHERE id = ?', [imageId]);
  });

  // Delete thumbnail
  await deleteThumbnail(image.file_hash);
}

/**
 * Scan all enabled folders (periodic scan - skips if manual scan running)
 */
export async function scanAllFolders(): Promise<void> {
  console.log('Starting full scan of all folders...');

  const folders = await query<Folder>(
    'SELECT * FROM folders WHERE enabled = TRUE'
  );

  if (folders.length === 0) {
    console.log('No folders configured for scanning');
    return;
  }

  let totalAdded = 0;
  for (const folder of folders) {
    // waitForLock=false means periodic scans skip if manual scan is running
    const added = await scanFolder(folder, false);
    totalAdded += added;
  }

  console.log(`Full scan complete: ${totalAdded} total new images added`);
}

/**
 * Clean up database entries for files that no longer exist
 */
export async function cleanupDeletedFiles(): Promise<number> {
  const images = await query<Image>('SELECT id, file_path, file_hash FROM images');
  let deletedCount = 0;

  for (const image of images) {
    try {
      await fs.access(image.file_path);
      // File exists, continue
    } catch {
      // File doesn't exist, delete from database
      console.log(`Removing deleted file: ${image.file_path}`);
      await deleteImage(image.id);
      deletedCount++;
    }
  }

  console.log(`Cleanup complete: ${deletedCount} deleted files removed from database`);
  return deletedCount;
}
