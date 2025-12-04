import { Router } from 'express';
import { query, queryOne, execute, transaction } from '../database/connection';
import { getThumbnailPath, resizeThumbnail, calculateFileHash, deleteThumbnail, generateThumbnail } from '../services/thumbnail';
import { deleteImage } from '../services/scanner';
import { writeTagsToFile } from '../services/exif';
import { requireEditPassword } from '../middleware/security';
import { ImageWithTags } from '../types';
import fs from 'fs/promises';

const router = Router();

/**
 * GET /api/images/:id
 * Get image details by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const image = await queryOne<any>(
      'SELECT * FROM images WHERE id = ?',
      [parseInt(id)]
    );

    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Get tags
    const tags = await query<{ name: string }>(
      `SELECT t.name
       FROM tags t
       JOIN image_tags it ON t.id = it.tag_id
       WHERE it.image_id = ?
       ORDER BY t.name`,
      [parseInt(id)]
    );

    // Get duplicate info if this image is part of a duplicate group
    const dupInfo = await queryOne<{ prime_id: number }>(
      'SELECT prime_id FROM duplicate_groups WHERE image_id = ?',
      [parseInt(id)]
    );

    let duplicates: ImageWithTags['duplicates'];
    if (dupInfo) {
      // Get all images in this duplicate group
      const dupImages = await query<{ image_id: number }>(
        'SELECT image_id FROM duplicate_groups WHERE prime_id = ? ORDER BY image_id',
        [dupInfo.prime_id]
      );
      duplicates = {
        prime_id: dupInfo.prime_id,
        is_prime: dupInfo.prime_id === parseInt(id),
        group: dupImages.map(d => d.image_id)
      };
    }

    const imageWithTags: ImageWithTags = {
      ...image,
      tags: tags.map(t => t.name),
      duplicates
    };

    res.json(imageWithTags);
  } catch (error) {
    console.error('Failed to fetch image:', error);
    res.status(500).json({ error: 'Failed to fetch image' });
  }
});

/**
 * GET /api/images/:id/file
 * Serve the original image/video file with proper filename
 */
router.get('/:id/file', async (req, res) => {
  try {
    const { id } = req.params;

    const image = await queryOne<any>(
      'SELECT file_path, file_type, file_hash FROM images WHERE id = ?',
      [parseInt(id)]
    );

    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Check if file exists
    try {
      await fs.access(image.file_path);
    } catch {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Set filename as {hash}.{ext} for uniqueness
    const filename = `${image.file_hash}.${image.file_type}`;
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    // Send file
    res.sendFile(image.file_path);
  } catch (error) {
    console.error('Failed to serve image file:', error);
    res.status(500).json({ error: 'Failed to serve image file' });
  }
});

/**
 * GET /api/images/:id/thumbnail?size=150
 * Serve image thumbnail (optionally resized on-the-fly)
 */
router.get('/:id/thumbnail', async (req, res) => {
  try {
    const { id } = req.params;
    const { size } = req.query;

    const image = await queryOne<any>(
      'SELECT file_hash, file_type FROM images WHERE id = ?',
      [parseInt(id)]
    );

    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const thumbnailPath = getThumbnailPath(image.file_hash);

    // Check if thumbnail exists
    try {
      await fs.access(thumbnailPath);
    } catch {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }

    // If size parameter provided, resize on-the-fly
    if (size && !isNaN(parseInt(String(size)))) {
      const targetSize = Math.min(parseInt(String(size)), 1000); // Max 1000px
      const resizedBuffer = await resizeThumbnail(thumbnailPath, targetSize);

      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
      res.send(resizedBuffer);
    } else {
      // Serve original thumbnail
      res.set('Cache-Control', 'public, max-age=86400');
      res.sendFile(thumbnailPath);
    }
  } catch (error) {
    console.error('Failed to serve thumbnail:', error);
    res.status(500).json({ error: 'Failed to serve thumbnail' });
  }
});

/**
 * PATCH /api/images/:id/tags
 * Update tags for an image (requires edit password)
 * Body: { tags: string[] }
 * Efficiently updates only changed tags in DB, then writes to file
 */
router.patch('/:id/tags', requireEditPassword, async (req, res) => {
  try {
    const { id } = req.params;
    const { tags } = req.body;

    if (!Array.isArray(tags)) {
      return res.status(400).json({ success: false, error: 'Tags must be an array' });
    }

    const imageId = parseInt(id);
    const image = await queryOne<{ file_path: string, file_hash: string }>('SELECT file_path, file_hash FROM images WHERE id = ?', [imageId]);

    if (!image) {
      return res.status(404).json({ success: false, error: 'Image not found' });
    }

    // Normalize tags: trim, lowercase, remove empty
    const newTags = new Set(
      tags.map(t => String(t).trim().toLowerCase()).filter(t => t.length > 0)
    );

    // Get existing tags
    const existingTagRows = await query<{ name: string }>(
      `SELECT t.name FROM tags t
       JOIN image_tags it ON t.id = it.tag_id
       WHERE it.image_id = ?`,
      [imageId]
    );
    const existingTags = new Set(existingTagRows.map(t => t.name));

    // Calculate diff
    const tagsToAdd = [...newTags].filter(t => !existingTags.has(t));
    const tagsToRemove = [...existingTags].filter(t => !newTags.has(t));

    // Only run transaction if there are changes
    if (tagsToAdd.length > 0 || tagsToRemove.length > 0) {
      await transaction(async (conn) => {
        // Remove tags that were deleted
        for (const tagName of tagsToRemove) {
          const [tagRows] = await conn.query<any[]>('SELECT id FROM tags WHERE name = ?', [tagName]);
          if (tagRows.length > 0) {
            const tagId = tagRows[0].id;
            await conn.query('DELETE FROM image_tags WHERE image_id = ? AND tag_id = ?', [imageId, tagId]);
            await conn.query('UPDATE tags SET count = count - 1 WHERE id = ?', [tagId]);
            await conn.query('DELETE FROM tags WHERE id = ? AND count <= 0', [tagId]);
          }
        }

        // Add new tags
        for (const tagName of tagsToAdd) {
          await conn.query('INSERT IGNORE INTO tags (name, count) VALUES (?, 0)', [tagName]);
          const [tagRows] = await conn.query<any[]>('SELECT id FROM tags WHERE name = ?', [tagName]);
          if (tagRows.length > 0) {
            const tagId = tagRows[0].id;
            await conn.query('INSERT INTO image_tags (image_id, tag_id) VALUES (?, ?)', [imageId, tagId]);
            await conn.query('UPDATE tags SET count = count + 1 WHERE id = ?', [tagId]);
          }
        }
      });
    }

    // Write tags to file (filters out internal tags like duplicate_image)
    const finalTags = [...newTags];
    try {
      await writeTagsToFile(image.file_path, finalTags);

      // Rehash the file and update DB so scanner doesn't see it as changed
      const [newHash, stats] = await Promise.all([
        calculateFileHash(image.file_path),
        fs.stat(image.file_path)
      ]);
      await execute(
        'UPDATE images SET file_hash = ?, file_size = ?, updated_at = NOW() WHERE id = ?',
        [newHash, stats.size, imageId]
      );
	  
	  // Rename old thumbnail to new path
	  const oldThumbLoc = getThumbnailPath(image.file_hash);
	  try {
		await fs.rename(oldThumbLoc, oldThumbLoc.slice(0, oldThumbLoc.lastIndexOf('/')) + `/${newHash}.jpg` );
	  } catch (thumbErr) {
		// If the rename fails for some reason, just delete the old thumb and generate a new one
		await deleteThumbnail(image.file_hash);
	    generateThumbnail(image.file_path, newHash);
	  }
	  
    } catch (fileError) {
      console.error('Failed to write tags to file:', fileError);
      // Don't fail the request, DB is already updated
    }

    res.json({ success: true, tags: finalTags });
  } catch (error) {
    console.error('Failed to update tags:', error);
    res.status(500).json({ success: false, error: 'Failed to update tags' });
  }
});

/**
 * DELETE /api/images/:id
 * Delete an image (requires edit password)
 * Query params: deleteFile=true to also delete the file from disk (default: true)
 */
router.delete('/:id', requireEditPassword, async (req, res) => {
  try {
    const { id } = req.params;
    const shouldDeleteFile = req.query.deleteFile !== 'false';

    const imageId = parseInt(id);
    const image = await queryOne<{ file_path: string }>(
      'SELECT file_path FROM images WHERE id = ?',
      [imageId]
    );

    if (!image) {
      return res.status(404).json({ success: false, error: 'Image not found' });
    }

    // Use existing deleteImage function for clean DB removal
    await deleteImage(imageId);

    // Optionally delete the actual file
    if (shouldDeleteFile) {
      try {
        await fs.unlink(image.file_path);
        console.log(`Deleted file: ${image.file_path}`);
      } catch (unlinkError) {
        console.error(`Failed to delete file ${image.file_path}:`, unlinkError);
        // Don't fail the request, DB entry is already deleted
      }
    }

    res.json({ success: true, fileDeleted: shouldDeleteFile });
  } catch (error) {
    console.error('Failed to delete image:', error);
    res.status(500).json({ success: false, error: 'Failed to delete image' });
  }
});

export default router;
