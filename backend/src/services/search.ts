import { query } from '../database/connection';
import { SearchResult, SearchQuery, ImageWithTags } from '../types';

/**
 * Token types for search query parsing
 */
enum TokenType {
  TAG = 'TAG',
  NOT = 'NOT',      // - prefix
  OR = 'OR',        // ~ prefix
  LBRACE = 'LBRACE', // {
  RBRACE = 'RBRACE', // }
  EOF = 'EOF'
}

interface Token {
  type: TokenType;
  value: string;
}

/**
 * AST node types for the parsed query
 */
interface ASTNode {
  type: 'AND' | 'OR' | 'NOT' | 'TAG' | 'METATAG';
  value?: string;
  metatag?: {
    key: string;
    value: string;
    operator?: string;  // >, <, >=, <= for comparison metatags
  };
  children?: ASTNode[];
}

/**
 * Sort directive for ORDER BY
 */
interface SortDirective {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * Result of parsing a search query
 */
interface ParseResult {
  filterAST: ASTNode;
  sortDirectives: SortDirective[];
}

// Constants for sorting
const DEFAULT_SORT_FIELD = 'date';
const DEFAULT_SORT_DIRECTION: 'asc' | 'desc' = 'desc';

const VALID_SORT_FIELDS = ['random', 'id', 'date', 'rating', 'height', 'width', 'size', 'updated', 'file'];
const FILTER_METATAGS = ['rating', 'artist', 'date', 'id', 'file'];

const SORT_FIELD_MAP: Record<string, string> = {
  'random': 'RAND()',
  'id': 'images.id',
  'date': 'images.created_at',
  'rating': 'images.rating',
  'height': 'images.height',
  'width': 'images.width',
  'size': 'images.file_size',
  'updated': 'images.updated_at',
  'file': 'images.filename'
};

export const RATING_MAP: Record<string, number> = {
  'safe': 1, 's': 1,
  'questionable': 2, 'q': 2,
  'explicit': 3, 'e': 3,
  'none': 0, 'undefined': 0, 'unrated': 0, 'u': 0
};

 /**
 * Tokenize search query
 * Examples:
 *   "blue_sky red_eyes" -> [TAG(blue_sky), TAG(red_eyes)] -> blue_sky AND red_eyes
 *   "-beach" -> [NOT, TAG(beach)] -> NOT beach
 *   "~sunset ~sunrise" -> [OR, TAG(sunset), OR, TAG(sunrise)] -> sunset OR sunrise
 *   "~{tag1 tag2} ~tag3" -> [OR, LBRACE, TAG(tag1), TAG(tag2), RBRACE, OR, TAG(tag3)]
 *                         -> (tag1 AND tag2) OR tag3
 *   "-{tag1 tag2}" -> [NOT, LBRACE, TAG(tag1), TAG(tag2), RBRACE] -> NOT (tag1 AND tag2)
 */
function tokenize(queryString: string): Token[] {
  const tokens: Token[] = [];
  const chars = queryString.trim();
  let i = 0;

  while (i < chars.length) {
    const char = chars[i];

    // Skip whitespace
    if (char === ' ' || char === '\t') {
      i++;
      continue;
    }

    // Left brace
    if (char === '{') {
      tokens.push({ type: TokenType.LBRACE, value: '{' });
      i++;
      continue;
    }

    // Right brace
    if (char === '}') {
      tokens.push({ type: TokenType.RBRACE, value: '}' });
      i++;
      continue;
    }

    // NOT operator (-)
    if (char === '-') {
      tokens.push({ type: TokenType.NOT, value: '-' });
      i++;
      continue;
    }

    // OR operator (~)
    if (char === '~') {
      tokens.push({ type: TokenType.OR, value: '~' });
      i++;
      continue;
    }

    // Tag (read until whitespace or brace)
    let tag = '';
    while (i < chars.length && !' \t{}'.includes(chars[i])) {
      tag += chars[i];
      i++;
    }

    if (tag.length > 0) {
      tokens.push({ type: TokenType.TAG, value: tag });
    }
  }

  tokens.push({ type: TokenType.EOF, value: '' });
  return tokens;
}

/**
 * Parse a metatag value to extract comparison operators
 */
function parseMetatagValue(value: string): { operator?: string; cleanValue: string } {
  const match = value.match(/^(>=|<=|>|<)(.+)$/);
  if (match) {
    return { operator: match[1], cleanValue: match[2] };
  }
  return { cleanValue: value };
}

/**
 * Parse a sort: metatag value
 */
function parseSortValue(value: string): SortDirective | null {
  let field = value.toLowerCase();
  let direction: 'asc' | 'desc' = 'desc';

  if (field.endsWith('_asc')) {
    field = field.slice(0, -4);
    direction = 'asc';
  } else if (field.endsWith('_desc')) {
    field = field.slice(0, -5);
  }

  if (!VALID_SORT_FIELDS.includes(field)) {
    return null; // Invalid - silently ignore
  }

  return { field, direction };
}

/**
 * Parser for search queries with boolean logic and metatags
 *
 * Grammar:
 * expression := term+
 * term := NOT? OR? (TAG | group)
 * group := LBRACE expression RBRACE
 *
 * Logic:
 * - Multiple terms without operators are ANDed together
 * - Terms with ~ prefix are collected into OR groups
 * - Terms with - prefix are NOTed
 * - {} groups terms together
 * - * does a like/fuzzy search
 */
class QueryParser {
  private tokens: Token[];
  private current = 0;
  private sortDirectives: SortDirective[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  /**
   * Parse the entire query, separating filters from sort directives
   */
  parse(): ParseResult {
    const terms = this.parseTerms();

    // Filter out sort metatags (they're collected in sortDirectives)
    const filterTerms = this.filterOutSortMetatags(terms);

    if (filterTerms.length === 0) {
      return {
        filterAST: { type: 'AND', children: [] },
        sortDirectives: this.sortDirectives
      };
    }

    // Separate OR terms from AND terms
    const orTerms: ASTNode[] = [];
    const andTerms: ASTNode[] = [];

    for (const term of filterTerms) {
      // Only spread single-child OR nodes (from ~ prefix)
      // Multi-child OR nodes (from groups like {~a ~b}) stay as atomic units
      if (term.type === 'OR' && term.children && term.children.length === 1) {
        orTerms.push(...term.children);
      } else {
        andTerms.push(term);
      }
    }

    // Build final tree
    let filterAST: ASTNode;
    if (orTerms.length > 0 && andTerms.length > 0) {
      const orNode: ASTNode = { type: 'OR', children: orTerms };
      filterAST = { type: 'AND', children: [...andTerms, orNode] };
    } else if (orTerms.length > 0) {
      filterAST = { type: 'OR', children: orTerms };
    } else {
      if (andTerms.length === 1) {
        filterAST = andTerms[0];
      } else {
        filterAST = { type: 'AND', children: andTerms };
      }
    }

    return { filterAST, sortDirectives: this.sortDirectives };
  }

  /**
   * Recursively filter out sort metatags and collect them
   */
  private filterOutSortMetatags(nodes: ASTNode[]): ASTNode[] {
    const result: ASTNode[] = [];

    for (const node of nodes) {
      if (node.type === 'METATAG' && node.metatag?.key === 'sort') {
        // Already collected during parsing
        continue;
      }

      if (node.type === 'OR' && node.children) {
        const filtered = this.filterOutSortMetatags(node.children);
        if (filtered.length > 0) {
          result.push({ ...node, children: filtered });
        }
      } else if (node.type === 'AND' && node.children) {
        const filtered = this.filterOutSortMetatags(node.children);
        if (filtered.length > 0) {
          result.push({ ...node, children: filtered });
        }
      } else if (node.type === 'NOT' && node.children) {
        const filtered = this.filterOutSortMetatags(node.children);
        if (filtered.length > 0) {
          result.push({ ...node, children: filtered });
        }
      } else {
        result.push(node);
      }
    }

    return result;
  }

  /**
   * Parse multiple terms
   */
  private parseTerms(): ASTNode[] {
    const terms: ASTNode[] = [];

    while (this.peek().type !== TokenType.EOF && this.peek().type !== TokenType.RBRACE) {
      terms.push(this.parseTerm());
    }

    return terms;
  }

  /**
   * Parse a single term: [NOT] [OR] (TAG | METATAG | group)
   */
  private parseTerm(): ASTNode {
    let hasNot = false;
    let hasOr = false;

    // Check for NOT prefix
    if (this.peek().type === TokenType.NOT) {
      this.advance();
      hasNot = true;
    }

    // Check for OR prefix
    if (this.peek().type === TokenType.OR) {
      this.advance();
      hasOr = true;
    }

    // Parse the actual term (TAG, METATAG, or group)
    let term: ASTNode;

    if (this.peek().type === TokenType.LBRACE) {
      // Group: {...}
      this.advance(); // consume {
      const groupTerms = this.parseTerms();

      if (this.peek().type === TokenType.RBRACE) {
        this.advance(); // consume }
      }

      // Group terms are ANDed together by default
      if (groupTerms.length === 1) {
        term = groupTerms[0];
      } else {
        const orTerms: ASTNode[] = [];
        const andTerms: ASTNode[] = [];

        for (const t of groupTerms) {
          // Only spread single-child OR nodes (from ~ prefix)
          // Multi-child OR nodes (from nested groups) stay as atomic units
          if (t.type === 'OR' && t.children && t.children.length === 1) {
            orTerms.push(...t.children);
          } else {
            andTerms.push(t);
          }
        }

        if (orTerms.length > 0 && andTerms.length > 0) {
          const orNode: ASTNode = { type: 'OR', children: orTerms };
          term = { type: 'AND', children: [...andTerms, orNode] };
        } else if (orTerms.length > 0) {
          term = { type: 'OR', children: orTerms };
        } else {
          term = { type: 'AND', children: andTerms };
        }
      }
    } else if (this.peek().type === TokenType.TAG) {
      const token = this.advance();
      const tagValue = token.value;

      // Check if this is a metatag (contains :)
      if (tagValue.includes(':')) {
        const colonIndex = tagValue.indexOf(':');
        const key = tagValue.substring(0, colonIndex).toLowerCase();
        const rawValue = tagValue.substring(colonIndex + 1);

        if (key === 'sort') {
          // Handle sort metatag
          const sortDirective = parseSortValue(rawValue);
          if (sortDirective) {
            this.sortDirectives.push(sortDirective);
          }
          // Return a placeholder that will be filtered out
          term = { type: 'METATAG', metatag: { key: 'sort', value: rawValue } };
        } else if (FILTER_METATAGS.includes(key)) {
          // Handle filter metatags
          const { operator, cleanValue } = parseMetatagValue(rawValue);
          term = { type: 'METATAG', metatag: { key, value: cleanValue, operator } };
        } else {
          // Unknown metatag - treat as regular tag for forward compatibility
          term = { type: 'TAG', value: tagValue };
        }
      } else {
        // Regular tag
        term = { type: 'TAG', value: tagValue };
      }
    } else {
      throw new Error(`Unexpected token: ${this.peek().type}`);
    }

    // Apply NOT if present
    if (hasNot) {
      term = { type: 'NOT', children: [term] };
    }

    // Wrap in OR marker if present (will be collected later)
    if (hasOr) {
      term = { type: 'OR', children: [term] };
    }

    return term;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private advance(): Token {
    return this.tokens[this.current++];
  }
}

/**
 * Build SQL for rating metatag
 */
function buildRatingSQL(value: string): { sql: string; params: any[] } {
  const numericRating = RATING_MAP[value.toLowerCase()];

  if (numericRating === undefined) {
    return { sql: '1=0', params: [] }; // Invalid rating matches nothing
  }

  // 0 means unrated - match NULL or 0
  if (numericRating === 0) {
    return {
      sql: '(images.rating IS NULL OR images.rating = 0)',
      params: []
    };
  }

  return {
    sql: 'images.rating = ?',
    params: [numericRating]
  };
}

/**
 * Build SQL for artist metatag
 */
function buildArtistSQL(value: string): { sql: string; params: any[] } {
  if (value.includes('*')) {
    // Wildcard support
    const likePattern = value
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_')
      .replace(/\*/g, '%');

    return {
      sql: "images.artist LIKE ? ESCAPE '\\\\'",
      params: [likePattern]
    };
  }

  return {
    sql: 'images.artist = ?',
    params: [value]
  };
}

/**
 * Build SQL for file metatag (searches by filename)
 */
function buildFileSQL(value: string): { sql: string; params: any[] } {
  if (value.includes('*')) {
    // Wildcard support
    const likePattern = value
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_')
      .replace(/\*/g, '%');

    return {
      sql: "images.filename LIKE ? ESCAPE '\\\\'",
      params: [likePattern]
    };
  }

  return {
    sql: 'images.filename = ?',
    params: [value]
  };
}

/**
 * Build SQL for date metatag
 */
function buildDateSQL(value: string, operator?: string): { sql: string; params: any[] } {
  // Year-only format: "2023" means full year range
  if (/^\d{4}$/.test(value)) {
    const year = parseInt(value);
    return {
      sql: 'images.created_at >= ? AND images.created_at < ?',
      params: [`${year}-01-01 00:00:00`, `${year + 1}-01-01 00:00:00`]
    };
  }

  // Year-month format: "2023-06" means full month range
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-').map(Number);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return {
      sql: 'images.created_at >= ? AND images.created_at < ?',
      params: [
        `${year}-${String(month).padStart(2, '0')}-01 00:00:00`,
        `${nextYear}-${String(nextMonth).padStart(2, '0')}-01 00:00:00`
      ]
    };
  }

  // Full date format: "2023-06-15"
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (!operator) {
      // Exact date match
      return {
        sql: 'DATE(images.created_at) = ?',
        params: [value]
      };
    }

    // Comparison operators
    const timestamp = operator.includes('>') ? `${value} 00:00:00` : `${value} 23:59:59`;
    return {
      sql: `images.created_at ${operator} ?`,
      params: [timestamp]
    };
  }

  // Invalid format
  return { sql: '1=0', params: [] };
}

/**
 * Build SQL for id metatag
 */
function buildIdSQL(value: string, operator?: string): { sql: string; params: any[] } {
  const idValue = parseInt(value);

  if (isNaN(idValue)) {
    return { sql: '1=0', params: [] };
  }

  const sqlOp = operator || '=';

  return {
    sql: `images.id ${sqlOp} ?`,
    params: [idValue]
  };
}

/**
 * Build SQL WHERE clause from AST
 */
function buildSQLFromAST(node: ASTNode): { sql: string; params: any[] } {
  switch (node.type) {
    case 'TAG': {
      const tagValue = node.value!;

      // Check if this is a wildcard search
      if (tagValue.includes('*')) {
        const likePattern = tagValue
          .replace(/%/g, '\\%')
          .replace(/_/g, '\\_')
          .replace(/\*/g, '%');

        return {
          sql: `EXISTS (
            SELECT 1 FROM image_tags it
            JOIN tags t ON it.tag_id = t.id
            WHERE it.image_id = images.id AND t.name LIKE ? ESCAPE '\\\\'
          )`,
          params: [likePattern]
        };
      }

      // Exact match (faster)
      return {
        sql: `EXISTS (
          SELECT 1 FROM image_tags it
          JOIN tags t ON it.tag_id = t.id
          WHERE it.image_id = images.id AND t.name = ?
        )`,
        params: [tagValue]
      };
    }

    case 'METATAG': {
      const { key, value, operator } = node.metatag!;

      switch (key) {
        case 'rating':
          return buildRatingSQL(value);
        case 'artist':
          return buildArtistSQL(value);
        case 'file':
          return buildFileSQL(value);
        case 'date':
          return buildDateSQL(value, operator);
        case 'id':
          return buildIdSQL(value, operator);
        case 'sort': // Sort metatags should have been arleady extracted - this is a no-op filter
        default:
          return { sql: '1=1', params: [] };
      }
    }

    case 'NOT': {
      const child = buildSQLFromAST(node.children![0]);
      return {
        sql: `NOT (${child.sql})`,
        params: child.params
      };
    }

    case 'AND': {
      if (!node.children || node.children.length === 0) {
        return { sql: '1=1', params: [] };
      }

      const parts = node.children.map(buildSQLFromAST);
      const sql = parts.map(p => `(${p.sql})`).join(' AND ');
      const params = parts.flatMap(p => p.params);
      return { sql, params };
    }

    case 'OR': {
      if (!node.children || node.children.length === 0) {
        return { sql: '1=0', params: [] };
      }

      const parts = node.children.map(buildSQLFromAST);
      const sql = parts.map(p => `(${p.sql})`).join(' OR ');
      const params = parts.flatMap(p => p.params);
      return { sql, params };
    }

    default:
      throw new Error(`Unknown node type: ${(node as ASTNode).type}`);
  }
}

/**
 * Build ORDER BY clause from sort directives
 */
function buildOrderByClause(sortDirectives: SortDirective[]): string {
  const parts: string[] = [];
  const usedFields = new Set<string>();

  for (const { field, direction } of sortDirectives) {
    if (field === 'random') {
      parts.push('RAND()');
    } else {
      parts.push(`${SORT_FIELD_MAP[field]} ${direction.toUpperCase()}`);
    }
    usedFields.add(field);
  }

  // Add default sort as tiebreaker if not already present
  if (!usedFields.has(DEFAULT_SORT_FIELD) && !usedFields.has('random')) {
    parts.push(`${SORT_FIELD_MAP[DEFAULT_SORT_FIELD]} ${DEFAULT_SORT_DIRECTION.toUpperCase()}`);
  }

  // Always add ID as final tiebreaker for consistent pagination (unless random)
  if (!usedFields.has('id') && !usedFields.has('random')) {
    const lastDir = sortDirectives.length > 0
      ? sortDirectives[sortDirectives.length - 1].direction
      : DEFAULT_SORT_DIRECTION;
    parts.push(`images.id ${lastDir.toUpperCase()}`);
  }

  return parts.length > 0 ? parts.join(', ') : `${SORT_FIELD_MAP[DEFAULT_SORT_FIELD]} ${DEFAULT_SORT_DIRECTION.toUpperCase()}, images.id DESC`;
}

/**
 * Search for images based on query
 */
export async function searchImages(searchQuery: SearchQuery): Promise<SearchResult> {
  const { query: queryString, page = 1, limit = 50 } = searchQuery;

  // Parse query
  let whereClause = '1=1';
  let params: any[] = [];
  let orderBy = buildOrderByClause([]);

  if (queryString && queryString.trim().length > 0) {
    try {
      const tokens = tokenize(queryString);
      const parser = new QueryParser(tokens);
      const { filterAST, sortDirectives } = parser.parse();
      const { sql, params: queryParams } = buildSQLFromAST(filterAST);
      whereClause = sql;
      params = queryParams;
      orderBy = buildOrderByClause(sortDirectives);
    } catch (error) {
      console.error('Failed to parse search query:', error);
      throw new Error('Invalid search query syntax');
    }
  }

  // Count total results
  const countSql = `
    SELECT COUNT(DISTINCT images.id) as total
    FROM images
    WHERE ${whereClause}
  `;

  const countResult = await query<{ total: number }>(countSql, params);
  const total = countResult[0]?.total || 0;

  // Get paginated results
  const offset = (page - 1) * limit;
  const imagesSql = `
    SELECT images.*
    FROM images
    WHERE ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;

  const images = await query<any>(imagesSql, [...params, limit, offset]);

  // Early return if no results
  if (images.length === 0) {
    return {
      images: [],
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit)
    };
  }

  // Get all tags for these images in a single query, grouped by image
  const imageIds = images.map((img: any) => img.id);
  const placeholders = imageIds.map(() => '?').join(',');
  const tagsSql = `
    SELECT it.image_id, GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR '||') as tag_list
    FROM image_tags it
    JOIN tags t ON it.tag_id = t.id
    WHERE it.image_id IN (${placeholders})
    GROUP BY it.image_id
  `;
  const tagRows = await query<{ image_id: number; tag_list: string | null }>(tagsSql, imageIds);

  // Build lookup map (one row per image, split combined tag string)
  const tagsByImage = new Map(
    tagRows.map(row => [row.image_id, row.tag_list ? row.tag_list.split('||') : []])
  );

  // Combine images with their tags
  const imagesWithTags: ImageWithTags[] = images.map((image: any) => ({
    ...image,
    tags: tagsByImage.get(image.id) || []
  }));

  return {
    images: imagesWithTags,
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit)
  };
}

export interface TagsResult {
  tags: { name: string; count: number }[];
  total: number;
  page: number;
  totalPages: number;
}

export async function getTags(options: {
  query?: string;
  page?: number;
  limit?: number;
}): Promise<TagsResult> {
  const { query: q = '', page = 1, limit = 50 } = options;
  const offset = (page - 1) * limit;

  // Build WHERE clause
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (q) {
    conditions.push('name LIKE ?');
    params.push(`${q}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const [countResult] = await query<{ total: number }>(
    `SELECT COUNT(*) as total FROM tags ${whereClause}`,
    params
  );
  const total = countResult?.total || 0;

  // Get tags page
  const tags = await query<{ name: string; count: number }>(
    `SELECT name, count FROM tags ${whereClause} ORDER BY count DESC, name ASC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    tags,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  };
}
