import { Router } from 'express';
import { searchImages } from '../services/search';
import { query, queryOne } from '../database/connection';

const router = Router();
const PAGE_SIZE = 24; // Smaller for old browsers

/**
 * GET /lite/
 * Server-rendered gallery for old browsers
 */
router.get('/', async (req, res) => {
  try {
    const { q = '', page = '1' } = req.query;
    const pageNum = Math.max(1, parseInt(String(page)) || 1);

    const result = await searchImages({
      query: String(q),
      page: pageNum,
      limit: PAGE_SIZE
    });

    res.render('gallery', {
      images: result.images,
      query: q,
      page: pageNum,
      totalPages: result.total_pages,
      total: result.total
    });
  } catch (error) {
    console.error('Lite gallery error:', error);
    res.status(500).render('error', { message: 'Failed to load gallery' });
  }
});

/**
 * GET /lite/image/:id
 * Server-rendered single image view
 * Supports ?q=query&page=N&pos=M for context-aware prev/next navigation
 */
router.get('/image/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { q = '', page = '1', pos = '0' } = req.query;
    const imageId = parseInt(id);
    const queryStr = String(q);
    const pageNum = Math.max(1, parseInt(String(page)) || 1);
    const position = Math.max(0, parseInt(String(pos)) || 0);

    // Get image details
    const image = await queryOne<any>(
      'SELECT * FROM images WHERE id = ?',
      [imageId]
    );

    if (!image) {
      return res.status(404).render('error', { message: 'Image not found' });
    }

    // Get tags
    const tags = await query<{ name: string }>(
      `SELECT t.name
       FROM tags t
       JOIN image_tags it ON t.id = it.tag_id
       WHERE it.image_id = ?
       ORDER BY t.name`,
      [imageId]
    );

    // Find prev/next within search context
    let prevId: number | null = null;
    let nextId: number | null = null;
    let prevPage = pageNum;
    let nextPage = pageNum;
    let prevPos = position - 1;
    let nextPos = position + 1;

    if (queryStr) {
      // Fetch current page to find neighbors
      const searchResult = await searchImages({
        query: queryStr,
        page: pageNum,
        limit: PAGE_SIZE
      });

      const ids = searchResult.images.map(img => img.id);

      // Previous image
      if (position > 0 && position <= ids.length) {
        prevId = ids[position - 1];
        prevPos = position - 1;
      } else if (pageNum > 1) {
        // Need to fetch previous page
        const prevPageResult = await searchImages({
          query: queryStr,
          page: pageNum - 1,
          limit: PAGE_SIZE
        });
        if (prevPageResult.images.length > 0) {
          prevId = prevPageResult.images[prevPageResult.images.length - 1].id;
          prevPage = pageNum - 1;
          prevPos = prevPageResult.images.length - 1;
        }
      }

      // Next image
      if (position < ids.length - 1) {
        nextId = ids[position + 1];
        nextPos = position + 1;
      } else if (pageNum < searchResult.total_pages) {
        // Need to fetch next page
        const nextPageResult = await searchImages({
          query: queryStr,
          page: pageNum + 1,
          limit: PAGE_SIZE
        });
        if (nextPageResult.images.length > 0) {
          nextId = nextPageResult.images[0].id;
          nextPage = pageNum + 1;
          nextPos = 0;
        }
      }
    } else {
      // No query - just navigate by ID
      const prev = await queryOne<{ id: number }>(
        'SELECT id FROM images WHERE id < ? ORDER BY id DESC LIMIT 1',
        [imageId]
      );
      const next = await queryOne<{ id: number }>(
        'SELECT id FROM images WHERE id > ? ORDER BY id ASC LIMIT 1',
        [imageId]
      );
      prevId = prev?.id ?? null;
      nextId = next?.id ?? null;
    }

    res.render('image', {
      image: {
        ...image,
        tags: tags.map(t => t.name)
      },
      query: queryStr,
      page: pageNum,
      prevId,
      nextId,
      prevPage,
      nextPage,
      prevPos,
      nextPos
    });
  } catch (error) {
    console.error('Lite image error:', error);
    res.status(500).render('error', { message: 'Failed to load image' });
  }
});

export default router;
