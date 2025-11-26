import { Router } from 'express';
import { query, queryOne } from '../database/connection';
import { getThumbnailPath, resizeThumbnail } from '../services/thumbnail';
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

    const imageWithTags: ImageWithTags = {
      ...image,
      tags: tags.map(t => t.name)
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

export default router;
