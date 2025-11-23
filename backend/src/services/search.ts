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
  type: 'AND' | 'OR' | 'NOT' | 'TAG';
  value?: string;
  children?: ASTNode[];
}

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
    // Tags can contain parentheses, hyphens, tildes, etc.
    // Operators - and ~ are only recognized at the START of a token, not within
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
 * Parser for search queries with boolean logic
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
 */
class QueryParser {
  private tokens: Token[];
  private current = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  /**
   * Parse the entire query
   */
  parse(): ASTNode {
    const terms = this.parseTerms();

    if (terms.length === 0) {
      return { type: 'AND', children: [] };
    }

    // Separate OR terms from AND terms
    const orTerms: ASTNode[] = [];
    const andTerms: ASTNode[] = [];

    for (const term of terms) {
      if (term.type === 'OR' && term.children) {
        orTerms.push(...term.children);
      } else {
        andTerms.push(term);
      }
    }

    // Build final tree
    if (orTerms.length > 0 && andTerms.length > 0) {
      // Mix of AND and OR: (AND terms) AND (OR terms)
      const orNode: ASTNode = { type: 'OR', children: orTerms };
      return { type: 'AND', children: [...andTerms, orNode] };
    } else if (orTerms.length > 0) {
      // Only OR terms
      return { type: 'OR', children: orTerms };
    } else {
      // Only AND terms
      if (andTerms.length === 1) {
        return andTerms[0];
      }
      return { type: 'AND', children: andTerms };
    }
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
   * Parse a single term: [NOT] [OR] (TAG | group)
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

    // Parse the actual term (TAG or group)
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
        // Separate OR and AND terms within the group
        const orTerms: ASTNode[] = [];
        const andTerms: ASTNode[] = [];

        for (const t of groupTerms) {
          if (t.type === 'OR' && t.children) {
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
      // Single tag
      const token = this.advance();
      term = { type: 'TAG', value: token.value };
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
 * Build SQL WHERE clause from AST
 */
function buildSQLFromAST(node: ASTNode): { sql: string; params: string[] } {
  switch (node.type) {
    case 'TAG': {
      return {
        sql: `EXISTS (
          SELECT 1 FROM image_tags it
          JOIN tags t ON it.tag_id = t.id
          WHERE it.image_id = images.id AND t.name = ?
        )`,
        params: [node.value!]
      };
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
      throw new Error(`Unknown node type: ${node.type}`);
  }
}

/**
 * Search for images based on query
 */
export async function searchImages(searchQuery: SearchQuery): Promise<SearchResult> {
  const { query: queryString, page = 1, limit = 50, sort = 'date_desc' } = searchQuery;

  // Parse query
  let whereClause = '1=1';
  let params: any[] = [];

  if (queryString && queryString.trim().length > 0) {
    try {
      const tokens = tokenize(queryString);
      const parser = new QueryParser(tokens);
      const ast = parser.parse();
      const { sql, params: queryParams } = buildSQLFromAST(ast);
      whereClause = sql;
      params = queryParams;
    } catch (error) {
      console.error('Failed to parse search query:', error);
      throw new Error('Invalid search query syntax');
    }
  }

  // Build ORDER BY clause
  let orderBy = 'images.created_at DESC';
  if (sort === 'date_asc') {
    orderBy = 'images.created_at ASC';
  } else if (sort === 'random') {
    orderBy = 'RAND()';
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
    SELECT DISTINCT images.*
    FROM images
    WHERE ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;

  const images = await query<any>(imagesSql, [...params, limit, offset]);

  // Load tags for each image
  const imagesWithTags: ImageWithTags[] = await Promise.all(
    images.map(async (image) => {
      const tags = await query<{ name: string }>(
        `SELECT t.name
         FROM tags t
         JOIN image_tags it ON t.id = it.tag_id
         WHERE it.image_id = ?
         ORDER BY t.name`,
        [image.id]
      );

      return {
        ...image,
        tags: tags.map(t => t.name)
      };
    })
  );

  return {
    images: imagesWithTags,
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit)
  };
}

/**
 * Get tag suggestions for autocomplete
 */
export async function suggestTags(prefix: string, limit: number = 20): Promise<string[]> {
  const tags = await query<{ name: string }>(
    'SELECT name FROM tags WHERE name LIKE ? ORDER BY count DESC, name ASC LIMIT ?',
    [`${prefix}%`, limit]
  );

  return tags.map(t => t.name);
}
