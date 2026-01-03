import { Router } from 'express';
import { query, queryOne, execute } from '../database/connection';
import { getThumbnailPath, resizeThumbnail, calculateFileHash, deleteThumbnail, generateThumbnail } from '../services/thumbnail';
import { deleteImage, addTagsToImage, removeTagsFromImage } from '../services/scanner';
import { writeFileMetadata } from '../services/exif';
import { requireEditPassword } from '../middleware/security';
import { ImageWithTags } from '../types';
import { pluginRegistry } from '../index';
import { RATING_MAP } from '../services/search';
import fs from 'fs/promises';

const router = Router();

/**
 * GET /api/image/:id
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
    return res.status(500).json({ error: 'Failed to fetch image' });
  }
});

/**
 * GET /api/image/:id/file
 * Serve the original image/video file with proper filename
 * Query params: download=1 to force download
 */
router.get('/:id/file', async (req, res) => {
  try {
    const { id } = req.params;
    const isDownload = req.query.download === '1';

    const image = await queryOne<any>(
      'SELECT file_path, file_type, file_hash, filename FROM images WHERE id = ?',
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

    // Set content-disposition based on download mode
    if (isDownload) {
      // Use generated filename {hash}.{ext} for downloads
      res.setHeader('Content-Disposition', `attachment; filename="${image.file_hash}.${image.file_type}"`);
    } else {
      // Use hash-based filename for inline viewing
      const filename = `${image.file_hash}.${image.file_type}`;
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    }

    // Send file
    res.sendFile(image.file_path);
  } catch (error) {
    console.error('Failed to serve image file:', error);
    return res.status(500).json({ error: 'Failed to serve image file' });
  }
});

/**
 * GET /api/image/:id/thumbnail?size=150
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
    return res.status(500).json({ error: 'Failed to serve thumbnail' });
  }
});

/**
 * PATCH /api/image/:id
 * Update image metadata (tags and/or rating) - requires edit password
 * Body: { tags?: string[], rating?: number | null }
 *   - tags: Array of tag strings (rating:xxx metatags are extracted and applied)
 *   - rating: 1=Safe, 2=Questionable, 3=Explicit, null=Undefined
 *   - Rating in the 'rating' field overrides any rating:xxx metatag
 */
router.patch('/:id', requireEditPassword, async (req, res) => {
  try {
    const { id } = req.params;
    const { tags: rawTags, rating: rawRating } = req.body;

    // At least one field must be provided
    if (rawTags === undefined && rawRating === undefined) {
      return res.status(400).json({ success: false, error: 'Must provide tags and/or rating' });
    }

    const imageId = parseInt(id);
    const image = await queryOne<{ file_path: string, file_hash: string }>('SELECT file_path, file_hash FROM images WHERE id = ?', [imageId]);

    if (!image) {
      return res.status(404).json({ success: false, error: 'Image not found' });
    }

    let finalTags: string[] | undefined;
    let finalRating: number | null | undefined;

    // Validate and process tags if provided
    if (rawTags !== undefined) {
      if (!Array.isArray(rawTags)) {
        return res.status(400).json({ success: false, error: 'Tags must be an array' });
      }

      // Normalize tags: trim, lowercase, remove empty
      let normalizedTags = rawTags.map(t => String(t).trim().toLowerCase()).filter(t => t.length > 0);

      // Extract rating:xxx metatags
      let ratingFromTag: number | null | undefined;
      normalizedTags = normalizedTags.filter(tag => {
        if (tag.startsWith('rating:')) {
          const ratingValue = tag.slice(7);
          const mappedRating = RATING_MAP[ratingValue];
          if (mappedRating !== undefined) {
            ratingFromTag = [1, 2, 3].includes(mappedRating) ? mappedRating : null;
          }
          return false; // Remove rating tags from the list
        }
        return true;
      });

      // Apply rating from metatag (rating field will override below)
      if (ratingFromTag !== undefined) {
        finalRating = ratingFromTag;
      }

      // Allow plugins to transform tags before saving
      normalizedTags = await pluginRegistry.runTransformHook('onBeforeTagUpdate', normalizedTags, imageId);

      const newTags = new Set(normalizedTags);

      // Get existing tags and calculate diff
      const existingTagRows = await query<{ name: string }>(
        `SELECT t.name FROM tags t
         JOIN image_tags it ON t.id = it.tag_id
         WHERE it.image_id = ?`,
        [imageId]
      );
      const existingTags = new Set(existingTagRows.map(t => t.name));

      const tagsToAdd = [...newTags].filter(t => !existingTags.has(t));
      const tagsToRemove = [...existingTags].filter(t => !newTags.has(t));

      if (tagsToRemove.length > 0) {
        await removeTagsFromImage(imageId, tagsToRemove);
      }
      if (tagsToAdd.length > 0) {
        await addTagsToImage(imageId, tagsToAdd);
      }

      finalTags = [...newTags];
    }

    // Validate and process rating if provided (overrides any rating:xxx metatag)
    if (rawRating !== undefined) {
      if (rawRating !== null && (typeof rawRating !== 'number' || ![1, 2, 3].includes(rawRating))) {
        return res.status(400).json({ success: false, error: 'Rating must be 1, 2, 3, or null' });
      }
      finalRating = rawRating;
    }

    // Update rating in DB if changed
    if (finalRating !== undefined) {
      await execute('UPDATE images SET rating = ?, updated_at = NOW() WHERE id = ?', [finalRating, imageId]);
    }

    // Write metadata to file
    try {
      const metadataUpdate: { tags?: string[]; rating?: number | null } = {};
      if (finalTags !== undefined) metadataUpdate.tags = finalTags;
      if (finalRating !== undefined) metadataUpdate.rating = finalRating;

      if (Object.keys(metadataUpdate).length > 0) {
        await writeFileMetadata(image.file_path, metadataUpdate);

        // Rehash the file and update DB so scanner doesn't see it as changed
        const [newHash, stats] = await Promise.all([
          calculateFileHash(image.file_path),
          fs.stat(image.file_path)
        ]);
        await execute(
          'UPDATE images SET file_hash = ?, file_size = ?, updated_at = NOW() WHERE id = ?',
          [newHash, stats.size, imageId]
        );

        // Rename thumbnail if hash changed
        if (newHash !== image.file_hash) {
          const oldThumbLoc = getThumbnailPath(image.file_hash);
          try {
            await fs.rename(oldThumbLoc, oldThumbLoc.slice(0, oldThumbLoc.lastIndexOf('/')) + `/${newHash}.jpg`);
          } catch {
            await deleteThumbnail(image.file_hash);
            generateThumbnail(image.file_path, newHash);
          }
        }
      }
    } catch (fileError) {
      console.error('Failed to write metadata to file:', fileError);
      // Don't fail the request, DB is already updated
    }

    // Fire plugin hook after tags are saved
    if (finalTags !== undefined) {
      pluginRegistry.runHook('onAfterTagUpdate', imageId, finalTags);
    }

    res.json({
      success: true,
      ...(finalTags !== undefined && { tags: finalTags }),
      ...(finalRating !== undefined && { rating: finalRating }),
    });
  } catch (error) {
    console.error('Failed to update image:', error);
    return res.status(500).json({ success: false, error: 'Failed to update image' });
  }
});

/**
 * DELETE /api/image/:id
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
    return res.status(500).json({ success: false, error: 'Failed to delete image' });
  }
});

export default router;
