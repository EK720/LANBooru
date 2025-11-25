import { Router } from 'express';
import { searchImages, suggestTags } from '../services/search';

const MAX_POSTS_PER_QUERY = parseInt(process.env.MAX_RESULTS_PER_PAGE || '100');
const router = Router();

/**
 * GET /api/search?q=query&page=1&limit=50&sort=date_desc
 * Search for images by tags
 */
router.get('/', async (req, res) => {
  try {
    const { q = '', page = '1', limit = '50', sort = 'date_desc' } = req.query;

    const result = await searchImages({
      query: String(q),
      page: parseInt(String(page)),
      limit: Math.min(parseInt(String(limit)), MAX_POSTS_PER_QUERY),
      sort: String(sort) as any
    });

    res.json(result);
  } catch (error) {
    console.error('Search failed:', error);
    res.status(400).json({
      error: 'Search failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/tags/suggest?q=prefix
 * Get tag suggestions for autocomplete
 */
router.get('/tags/suggest', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      return res.json([]);
    }

    const suggestions = await suggestTags(q, 20);
    res.json(suggestions);
  } catch (error) {
    console.error('Tag suggestion failed:', error);
    res.status(500).json({ error: 'Failed to get tag suggestions' });
  }
});

export default router;
