import { Router } from 'express';
import { execute, query, queryOne } from '../database/connection';
import { localhostOnly } from '../middleware/security';
import { Folder } from '../types';
import {
  scanFolder,
  deleteImage,
  cleanupDeletedFiles,
  isFolderBeingDeleted,
  markFolderDeleting,
  unmarkFolderDeleting,
  waitForFolderScanComplete,
} from '../services/scanner';

const router = Router();

// All folder management routes require localhost access
router.use(localhostOnly);

/**
 * GET /api/folders
 * Get all configured folders
 */
router.get('/', async (req, res) => {
  try {
    const folders = await query<Folder>('SELECT * FROM folders ORDER BY created_at DESC');
    res.json(folders);
  } catch (error) {
    console.error('Failed to fetch folders:', error);
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

/**
 * POST /api/folders
 * Add a new folder to scan
 * Body: { "path": "/host/path/to/images", "recursive": true }
 */
router.post('/', async (req, res) => {
  try {
    const { path, do_recurse = true } = req.body;

    if (!path || typeof path !== 'string') {
      console.log('Path validation failed - path:', path, 'type:', typeof path);
      return res.status(400).json({
        error: 'Path is required',
        received: { path, type: typeof path, body: req.body }
      });
    }

    // Verify folder exists on filesystem
    const fs = await import('fs/promises');
    try {
      const stats = await fs.stat(path);
      if (!stats.isDirectory()) {
        return res.status(400).json({ error: 'Path is not a directory' });
      }
    } catch (error) {
      return res.status(400).json({ error: 'Folder does not exist or is not accessible' });
    }

    // Check if folder is currently being deleted
    if (isFolderBeingDeleted(path)) {
      return res.status(400).json({ error: 'This folder is currently being deleted. Please wait and try again.' });
    }

    // Check if folder already exists in database
    const existing = await queryOne<Folder>(
      'SELECT id FROM folders WHERE path = ?',
      [path]
    );

    if (existing) {
      return res.status(400).json({ error: 'Folder already exists' });
    }

    // Insert folder
    const result = await execute(
      'INSERT INTO folders (path, do_recurse, enabled) VALUES (?, ?, TRUE)',
      [path, do_recurse]
    );

    const folder: Folder = {
      id: result.insertId,
      path,
      do_recurse,
      enabled: true,
      created_at: new Date()
    };

    // Trigger initial scan in background
    scanFolder(folder).catch(error => {
      console.error(`Background scan failed for ${path}:`, error);
    });

    res.status(201).json(folder);
  } catch (error) {
    console.error('Failed to add folder:', error);
    res.status(500).json({ error: 'Failed to add folder' });
  }
});

/**
 * DELETE /api/folders/:id
 * Remove a folder and clean up its images from database
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const folderId = parseInt(id);

    // Get folder path before deleting
    const folder = await queryOne<Folder>(
      'SELECT path FROM folders WHERE id = ?',
      [folderId]
    );

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
	
	// If folder is already being deleted, don't double-dip
	if (isFolderBeingDeleted(folder.path)) {
		return res.status(400).json({ error: 'This folder cannot be deleted because it is already being deleted. Please wait for the deletion to finish.' });
	}

    // Mark folder as being deleted to prevent new scans and block re-adding
    markFolderDeleting(folder.path);

    try {
      // Wait for any ongoing scan of this folder to complete
      await waitForFolderScanComplete(folder.path);

      // Clean up images before deleting folder record
      // This way if cleanup fails, folder record still exists for retry
      const delImages = await query<{ id: number }>(
        'SELECT id FROM images WHERE file_path LIKE ?',
        [folder.path + '/%']
      );

      // Delete each image properly (handles thumbnails, tags, duplicate groups)
      for (const delImage of delImages) {
        await deleteImage(delImage.id);
      }

      // Delete folder from database
      const result = await execute('DELETE FROM folders WHERE id = ?', [folderId]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Folder not found' });
      }

      console.log(`Deleted folder ${folder.path} and cleaned up ${delImages.length} images`);

      res.status(204).send();
    } finally {
      // Always unmark the folder when done (success or failure)
      unmarkFolderDeleting(folder.path);
    }
  } catch (error) {
    console.error('Failed to delete folder:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

/**
 * PATCH /api/folders/:id
 * Update folder settings
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { do_recurse, enabled } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (typeof do_recurse === 'boolean') {
      updates.push('do_recurse = ?');
      params.push(do_recurse);
    }

    if (typeof enabled === 'boolean') {
      updates.push('enabled = ?');
      params.push(enabled);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' });
    }

    params.push(parseInt(id));

    await execute(
      `UPDATE folders SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const folder = await queryOne<Folder>('SELECT * FROM folders WHERE id = ?', [parseInt(id)]);

    res.json(folder);
  } catch (error) {
    console.error('Failed to update folder:', error);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

/**
 * POST /api/folders/:id/scan
 * Trigger a manual scan of a folder
 */
router.post('/:id/scan', async (req, res) => {
  try {
    const { id } = req.params;

    const folder = await queryOne<Folder>('SELECT * FROM folders WHERE id = ?', [parseInt(id)]);

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // Trigger scan and cleanup in background
    (async () => {
      try {
        await scanFolder(folder);
        await cleanupDeletedFiles(folder.path);
      } catch (error) {
        console.error(`Manual scan failed for ${folder.path}:`, error);
      }
    })();

    res.json({ message: 'Scan started' });
  } catch (error) {
    console.error('Failed to trigger scan:', error);
    res.status(500).json({ error: 'Failed to trigger scan' });
  }
});

export default router;
