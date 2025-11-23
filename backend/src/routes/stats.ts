import { Router } from 'express';
import { queryOne } from '../database/connection';
import { ScanStats } from '../types';

const router = Router();

/**
 * GET /api/stats
 * Get database statistics
 */
router.get('/', async (req, res) => {
  try {
    const imageCount = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM images'
    );

    const tagCount = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM tags'
    );

    const folderCount = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM folders'
    );

    const lastScan = await queryOne<{ last_scanned_at: Date }>(
      'SELECT last_scanned_at FROM folders ORDER BY last_scanned_at DESC LIMIT 1'
    );

    const stats: ScanStats = {
      total_images: imageCount?.count || 0,
      total_tags: tagCount?.count || 0,
      total_folders: folderCount?.count || 0,
      last_scan: lastScan?.last_scanned_at
    };

    res.json(stats);
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
