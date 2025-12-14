import mysql from 'mysql2/promise';
import fs from 'fs/promises';
import path from 'path';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'booru',
  password: process.env.DB_PASSWORD || 'boorupass',
  database: process.env.DB_NAME || 'booru',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

export async function initializeDatabase() {
  console.log('Initializing database...');

  try {
    // Test connection
    const connection = await pool.getConnection();
    console.log('Database connection established');

    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf-8');

    // Split by statements and execute each
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      await connection.query(statement);
    }

    console.log('Database schema initialized');
    connection.release();
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const results = await query<T>(sql, params);
  return results.length > 0 ? results[0] : null;
}

export async function execute(sql: string, params?: any[]): Promise<mysql.ResultSetHeader> {
  const [result] = await pool.execute(sql, params);
  return result as mysql.ResultSetHeader;
}

export async function transaction<T>(
  callback: (connection: mysql.PoolConnection) => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  const connection = await pool.getConnection();

  try {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      await connection.beginTransaction();

      try {
        const result = await callback(connection);
        await connection.commit();
        return result;
      } catch (error: any) {
        await connection.rollback();

        // Check if it's a deadlock error
        const isDeadlock = error.code === 'ER_LOCK_DEADLOCK' ||
                           (error.message && error.message.includes('Deadlock'));

        if (isDeadlock && attempt < maxRetries) {
          // Exponential backoff: 100ms, 200ms, 400ms...
          const delay = 100 * Math.pow(2, attempt - 1);
          console.log(`Database deadlock, retry ${attempt}/${maxRetries} after ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        throw error;
      }
    }

    // Should never reach here, but TypeScript needs it
    throw new Error('Transaction failed after max retries');
  } finally {
    connection.release();
  }
}

export default pool;
