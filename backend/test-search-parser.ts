/**
 * Test script for search query parser
 * Run with: npx ts-node test-search-parser.ts "your search query"
 * Or run interactively: npx ts-node test-search-parser.ts
 */

// Copy the search parser code here for standalone testing
// Skip anything after the buildSQLFromAST() function
// ======================================COPY-PASTE SERVICES/SEARCH.TS IN THIS SECTION======================================
enum TokenType {
  TAG = 'TAG',
  NOT = 'NOT',
  OR = 'OR',
  LBRACE = 'LBRACE',
  RBRACE = 'RBRACE',
  EOF = 'EOF'
}

interface Token {
  type: TokenType;
  value: string;
}

interface ASTNode {
  type: 'AND' | 'OR' | 'NOT' | 'TAG';
  value?: string;
  children?: ASTNode[];
}

function tokenize(queryString: string): Token[] {
  const tokens: Token[] = [];
  const chars = queryString.trim();
  let i = 0;

  while (i < chars.length) {
    const char = chars[i];

    if (char === ' ' || char === '\t') {
      i++;
      continue;
    }

    if (char === '{') {
      tokens.push({ type: TokenType.LBRACE, value: '{' });
      i++;
      continue;
    }

    if (char === '}') {
      tokens.push({ type: TokenType.RBRACE, value: '}' });
      i++;
      continue;
    }

    if (char === '-') {
      tokens.push({ type: TokenType.NOT, value: '-' });
      i++;
      continue;
    }

    if (char === '~') {
      tokens.push({ type: TokenType.OR, value: '~' });
      i++;
      continue;
    }

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

class QueryParser {
  private tokens: Token[];
  private current = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): ASTNode {
    const terms = this.parseTerms();

    if (terms.length === 0) {
      return { type: 'AND', children: [] };
    }

    const orTerms: ASTNode[] = [];
    const andTerms: ASTNode[] = [];

    for (const term of terms) {
      if (term.type === 'OR' && term.children) {
        // Push all children of OR nodes, not just the first
        orTerms.push(...term.children);
      } else {
        andTerms.push(term);
      }
    }

    if (orTerms.length > 0 && andTerms.length > 0) {
      const orNode: ASTNode = { type: 'OR', children: orTerms };
      return { type: 'AND', children: [...andTerms, orNode] };
    } else if (orTerms.length > 0) {
      return { type: 'OR', children: orTerms };
    } else {
      if (andTerms.length === 1) {
        return andTerms[0];
      }
      return { type: 'AND', children: andTerms };
    }
  }

  private parseTerms(): ASTNode[] {
    const terms: ASTNode[] = [];

    while (this.peek().type !== TokenType.EOF && this.peek().type !== TokenType.RBRACE) {
      terms.push(this.parseTerm());
    }

    return terms;
  }

  private parseTerm(): ASTNode {
    let hasNot = false;
    let hasOr = false;

    if (this.peek().type === TokenType.NOT) {
      this.advance();
      hasNot = true;
    }

    if (this.peek().type === TokenType.OR) {
      this.advance();
      hasOr = true;
    }

    let term: ASTNode;

    if (this.peek().type === TokenType.LBRACE) {
      this.advance();
      const groupTerms = this.parseTerms();

      if (this.peek().type === TokenType.RBRACE) {
        this.advance();
      }

      if (groupTerms.length === 1) {
        term = groupTerms[0];
      } else {
        const orTerms: ASTNode[] = [];
        const andTerms: ASTNode[] = [];

        for (const t of groupTerms) {
          if (t.type === 'OR' && t.children) {
            // Push all children of OR nodes, not just the first
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
      term = { type: 'TAG', value: token.value };
    } else {
      throw new Error(`Unexpected token: ${this.peek().type}`);
    }

    if (hasNot) {
      term = { type: 'NOT', children: [term] };
    }

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

function buildSQLFromAST(node: ASTNode): { sql: string; params: string[] } {
  switch (node.type) {
    case 'TAG': {
      return {
        sql: `EXISTS (SELECT 1 FROM image_tags it JOIN tags t ON it.tag_id = t.id WHERE it.image_id = images.id AND t.name = ?)`,
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

// ======================================END OF COPY-PASTE SECTION======================================

function prettyPrintAST(node: ASTNode, indent = 0): string {
  const spaces = '  '.repeat(indent);
  let result = `${spaces}${node.type}`;

  if (node.value) {
    result += ` "${node.value}"`;
  }

  if (node.children && node.children.length > 0) {
    result += '\n' + node.children.map(child => prettyPrintAST(child, indent + 1)).join('\n');
  }

  return result;
}

function testQuery(queryString: string) {
  console.log('='.repeat(80));
  console.log('INPUT:', queryString);
  console.log('='.repeat(80));

  try {
    // Step 1: Tokenize
    console.log('\n[STEP 1] TOKENIZATION:');
    const tokens = tokenize(queryString);
    tokens.forEach((token, i) => {
      if (token.type !== TokenType.EOF) {
        console.log(`  ${i}. ${token.type.padEnd(10)} "${token.value}"`);
      }
    });

    // Step 2: Parse into AST
    console.log('\n[STEP 2] ABSTRACT SYNTAX TREE:');
    const parser = new QueryParser(tokens);
    const ast = parser.parse();
    console.log(prettyPrintAST(ast));

    // Step 3: Build SQL
    console.log('\n[STEP 3] SQL QUERY:');
    const { sql, params } = buildSQLFromAST(ast);
    console.log('WHERE clause:');
    console.log(sql);
    console.log('\nParameters:');
    console.log(params);

    // Step 4: Human-readable interpretation
    console.log('\n[STEP 4] INTERPRETATION:');
    console.log(interpretAST(ast));

    console.log('\n' + '='.repeat(80));
    console.log('✓ Query is VALID');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.log('\n' + '='.repeat(80));
    console.log('✗ Query is INVALID');
    console.log('Error:', (error as Error).message);
    console.log('='.repeat(80) + '\n');
  }
}

function interpretAST(node: ASTNode): string {
  switch (node.type) {
    case 'TAG':
      return `has tag "${node.value}"`;

    case 'NOT':
      return `NOT (${interpretAST(node.children![0])})`;

    case 'AND':
      if (!node.children || node.children.length === 0) {
        return 'all images';
      }
      return node.children.map(interpretAST).join(' AND ');

    case 'OR':
      if (!node.children || node.children.length === 0) {
        return 'no images';
      }
      return `(${node.children.map(interpretAST).join(' OR ')})`;

    default:
      return 'unknown';
  }
}

// Main execution
const args = process.argv.slice(2);

if (args.length > 0) {
  // Test query from command line argument
  testQuery(args.join(' '));
} else {
  // Interactive mode
  console.log('Search Query Parser Test');
  console.log('Enter queries to test (Ctrl+C to exit)\n');

  // Example queries
  const examples = [
    'blue_sky red_eyes',
    '-beach',
    '~sunset ~sunrise',
    '~{tag1 tag2} ~tag3',
    '-{tag1 tag2}',
    'aqua_(konosuba) blue_hair',
    '{blue_sky red_eyes} -beach',
    '~tag1 ~tag2',
    'tag1 ~tag2'
  ];

  console.log('Example queries:');
  examples.forEach((ex, i) => {
    console.log(`  ${i + 1}. ${ex}`);
  });
  console.log('');

  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  function prompt() {
    rl.question('Enter query (or number for example): ', (input: string) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      // Check if it's a number (example selection)
      const num = parseInt(trimmed);
      if (!isNaN(num) && num >= 1 && num <= examples.length) {
        testQuery(examples[num - 1]);
      } else {
        testQuery(trimmed);
      }

      prompt();
    });
  }

  prompt();
}
