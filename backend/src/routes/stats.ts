import { Router } from 'express';
import { queryOne } from '../database/connection';
import { ScanStats } from '../types';
import { isEditPasswordRequired } from '../middleware/security';

const router = Router();

/**
 * GET /api/stats
 * Get database statistics and config info
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

    const stats: ScanStats & { require_edit_password: boolean } = {
      total_images: imageCount?.count || 0,
      total_tags: tagCount?.count || 0,
      total_folders: folderCount?.count || 0,
      last_scan: lastScan?.last_scanned_at,
      require_edit_password: isEditPasswordRequired()
    };

    res.json(stats);
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
