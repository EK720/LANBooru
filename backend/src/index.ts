import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { initializeDatabase } from './database/connection';
import { scanAllFolders, cleanupDeletedFiles } from './services/scanner';
import { cleanup as cleanupExif } from './services/exif';
import { addSecurityContext } from './middleware/security';

// Routes
import foldersRouter from './routes/folders';
import searchRouter from './routes/search';
import imagesRouter from './routes/images';
import statsRouter from './routes/stats';
import liteRouter from './routes/lite';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '4000');
const SCAN_INTERVAL_MINUTES = parseInt(process.env.SCAN_INTERVAL_MINUTES || '15');

// Trust proxy to get real client IP through Docker
app.set('trust proxy', 'loopback');

// EJS templating for lite mode
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'));

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded bodies
app.use(addSecurityContext);

// Rate limiting for API endpoints
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '120');

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: RATE_LIMIT_MAX,
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => {
    // Skip rate limiting for thumbnails and tag suggestions
    // These get hit frequently during normal browsing
    // Note: req.path doesn't include /api since middleware is mounted there
    return (
      req.path.match(/^\/images\/\d+\/thumbnail/) !== null ||
      req.path === '/search/tags/suggest'
    );
  }
});

app.use('/api', apiLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'LANBooru Backend' });
});

// Routes
app.use('/api/folders', foldersRouter);
app.use('/api/search', searchRouter);
app.use('/api/images', imagesRouter);
app.use('/api/stats', statsRouter);
app.use('/lite', liteRouter);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Periodic scanning
let scanInterval: NodeJS.Timeout | null = null;

async function performPeriodicScan() {
  console.log('Starting periodic scan...');
  try {
    await scanAllFolders();
    await cleanupDeletedFiles();
    console.log('Periodic scan completed successfully');
  } catch (error) {
    console.error('Periodic scan failed:', error);
  }
}

// Startup
async function start() {
  try {
    console.log('LANBooru Backend starting...');

    // Initialize database
    await initializeDatabase();
    console.log('Database initialized');

    // Run initial scan
    console.log('Running initial scan...');
    await performPeriodicScan();

    // Setup periodic scanning
    if (SCAN_INTERVAL_MINUTES > 0) {
      scanInterval = setInterval(
        performPeriodicScan,
        SCAN_INTERVAL_MINUTES * 60 * 1000
      );
      console.log(`Periodic scanning enabled: every ${SCAN_INTERVAL_MINUTES} minutes`);
    } else {
      console.log('Periodic scanning disabled');
    }

    // Start server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`LANBooru Backend listening on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');

  if (scanInterval) {
    clearInterval(scanInterval);
  }

  await cleanupExif();

  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');

  if (scanInterval) {
    clearInterval(scanInterval);
  }

  await cleanupExif();

  process.exit(0);
});

// Start the server
start();
