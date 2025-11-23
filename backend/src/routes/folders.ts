import { Router } from 'express';
import { execute, query, queryOne } from '../database/connection';
import { localhostOnly } from '../middleware/security';
import { Folder } from '../types';
import { scanFolder } from '../services/scanner';

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
 */
router.post('/', async (req, res) => {
  try {
    const { path, recursive = true } = req.body;

    if (!path || typeof path !== 'string') {
      return res.status(400).json({ error: 'Path is required' });
    }

    // Check if folder already exists
    const existing = await queryOne<Folder>(
      'SELECT id FROM folders WHERE path = ?',
      [path]
    );

    if (existing) {
      return res.status(400).json({ error: 'Folder already exists' });
    }

    // Insert folder
    const result = await execute(
      'INSERT INTO folders (path, recursive, enabled) VALUES (?, ?, TRUE)',
      [path, recursive]
    );

    const folder: Folder = {
      id: result.insertId,
      path,
      recursive,
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
 * Remove a folder (does not delete images from database)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await execute('DELETE FROM folders WHERE id = ?', [parseInt(id)]);

    res.status(204).send();
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
    const { recursive, enabled } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (typeof recursive === 'boolean') {
      updates.push('recursive = ?');
      params.push(recursive);
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

    // Trigger scan in background
    scanFolder(folder).catch(error => {
      console.error(`Manual scan failed for ${folder.path}:`, error);
    });

    res.json({ message: 'Scan started' });
  } catch (error) {
    console.error('Failed to trigger scan:', error);
    res.status(500).json({ error: 'Failed to trigger scan' });
  }
});

export default router;
