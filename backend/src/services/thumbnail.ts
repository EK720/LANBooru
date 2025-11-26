import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import ffmpeg from 'fluent-ffmpeg';

// Single thumbnail size - largest dimension will be this size, aspect ratio preserved
export const THUMBNAIL_SIZE = parseInt(process.env.THUMBNAIL_SIZE || '300');

const THUMBNAIL_DIR = process.env.THUMBNAIL_DIR || '/app/thumbnails';

/**
 * Get video duration in seconds
 */
async function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
}

/**
 * Extract a single frame from video at specified timestamp
 */
async function extractVideoFrame(filePath: string, timestamp: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    ffmpeg(filePath)
      .seekInput(timestamp)
      .frames(1)
      .outputFormat('image2pipe')
      .videoCodec('mjpeg')
      .on('error', reject)
      .pipe()
      .on('data', (chunk: Buffer) => chunks.push(chunk))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', reject);
  });
}

/**
 * Check if an image is mostly black (average brightness below threshold)
 */
async function isFrameBlack(frameBuffer: Buffer, threshold: number = 30): Promise<boolean> {
  try {
    const { channels } = await sharp(frameBuffer).stats();

    // Calculate average brightness across all channels
    const avgBrightness = channels.reduce((sum, ch) => sum + ch.mean, 0) / channels.length;

    return avgBrightness < threshold;
  } catch (error) {
    console.error('Failed to analyze frame brightness:', error);
    return false; // If we can't determine, assume it's not black
  }
}

/**
 * Compute 2D Discrete Cosine Transform for an NxN matrix
 * Simplified implementation for pHash
 */
function computeDCT(matrix: number[][], N: number): number[][] {
  const dct: number[][] = Array(N).fill(0).map(() => Array(N).fill(0));

  for (let u = 0; u < N; u++) {
    for (let v = 0; v < N; v++) {
      let sum = 0;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          sum += matrix[i][j] *
            Math.cos(((2 * i + 1) * u * Math.PI) / (2 * N)) *
            Math.cos(((2 * j + 1) * v * Math.PI) / (2 * N));
        }
      }

      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      dct[u][v] = 0.25 * cu * cv * sum;
    }
  }

  return dct;
}

/**
 * Generate pHash (DCT-based perceptual hash) for duplicate detection
 * More resilient to resizing, compression, and minor edits than dHash
 * Returns 64-bit hash as 16-character hex string
 */
export async function generatePHash(imageBuffer: Buffer): Promise<string> {
  try {
    // Resize to 32x32 for DCT computation
    const { data } = await sharp(imageBuffer)
      .resize(32, 32, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Convert flat array to 2D matrix
    const matrix: number[][] = [];
    for (let i = 0; i < 32; i++) {
      matrix[i] = [];
      for (let j = 0; j < 32; j++) {
        matrix[i][j] = data[i * 32 + j];
      }
    }

    // Compute DCT
    const dct = computeDCT(matrix, 32);

    // Extract top-left 8x8 (low frequencies), skipping DC component at [0][0]
    const lowFreq: number[] = [];
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        if (i !== 0 || j !== 0) { // Skip DC component
          lowFreq.push(dct[i][j]);
        }
      }
    }

    // Calculate median of low frequency values
    const sorted = [...lowFreq].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    // Generate hash: 1 if above median, 0 if below
    let hash = '';
    for (const value of lowFreq) {
      hash += value > median ? '1' : '0';
    }

    // Convert 63-bit binary string to hex (pad to 64 bits)
    hash += '0'; // Pad to 64 bits
    let hexHash = '';
    for (let i = 0; i < 64; i += 4) {
      const nibble = hash.substring(i, i + 4);
      hexHash += parseInt(nibble, 2).toString(16);
    }

    return hexHash;
  } catch (error) {
    console.error('Failed to generate pHash:', error);
    return '0000000000000000'; // Return zero hash on error
  }
}

/**
 * Generate a thumbnail for an image or video
 * For videos: tries first frame, then 1/3, then 2/3 to avoid black frames
 * Resizes so the largest dimension is THUMBNAIL_SIZE, preserving aspect ratio
 * Returns the dHash for duplicate detection
 */
export async function generateThumbnail(
  filePath: string,
  fileHash: string
): Promise<string> {
  try {
    const ext = path.extname(filePath).toLowerCase();

    // Ensure thumbnail directory exists
    await fs.mkdir(THUMBNAIL_DIR, { recursive: true });

    const outputPath = path.join(THUMBNAIL_DIR, `${fileHash}.jpg`);

    // Check if thumbnail already exists
    try {
      await fs.access(outputPath);
      // Thumbnail exists, generate pHash from it
      const thumbnailBuffer = await fs.readFile(outputPath);
      return await generatePHash(thumbnailBuffer);
    } catch {
      // Doesn't exist, create it
    }

    let imageBuffer: Buffer;

    // Handle videos
    if (['.mp4', '.webm', '.mkv'].includes(ext)) {
      const duration = await getVideoDuration(filePath);

      if (duration <= 0) {
        console.error(`Invalid video duration for ${filePath}`);
        return '0000000000000000'; // Return zero hash on error
      }

      // Try frames at 0s, 1/3, and 2/3 through the video
      const timestamps = [0, duration / 3, (duration * 2) / 3];

      for (const timestamp of timestamps) {
        const frameBuffer = await extractVideoFrame(filePath, timestamp);
        const isBlack = await isFrameBlack(frameBuffer);

        if (!isBlack) {
          imageBuffer = frameBuffer;
          break;
        }

        console.log(`Frame at ${timestamp.toFixed(1)}s is black, trying next timestamp...`);
      }

      // If all frames are black, use the last one anyway
      if (!imageBuffer!) {
        imageBuffer = await extractVideoFrame(filePath, timestamps[timestamps.length - 1]);
      }

      console.log(`Generated video thumbnail for: ${path.basename(filePath)}`);
    }
    // Handle images
    else {
      // Convert WEBP to JPEG first if needed, or read the file
      if (ext === '.webp') {
        imageBuffer = await sharp(filePath).jpeg({ quality: 90 }).toBuffer();
      } else {
        imageBuffer = await fs.readFile(filePath);
      }

      console.log(`Generated image thumbnail for: ${path.basename(filePath)}`);
    }

    // Generate pHash before resizing (for duplicate detection)
    const pHash = await generatePHash(imageBuffer);

    // Resize so largest dimension becomes THUMBNAIL_SIZE, preserving aspect ratio
    await sharp(imageBuffer)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: 'inside',  // Fit within box, preserving aspect ratio
        withoutEnlargement: true  // Don't upscale small images
      })
      .jpeg({ quality: 85 })
      .toFile(outputPath);

    return pHash;
  } catch (error) {
    console.error(`Failed to generate thumbnail for ${filePath}:`, error);
    return '0000000000000000'; // Return zero hash on error
  }
}

/**
 * Get thumbnail path for an image
 */
export function getThumbnailPath(fileHash: string): string {
  return path.join(THUMBNAIL_DIR, `${fileHash}.jpg`);
}

/**
 * Delete thumbnail for an image
 */
export async function deleteThumbnail(fileHash: string): Promise<void> {
  const thumbnailPath = path.join(THUMBNAIL_DIR, `${fileHash}.jpg`);
  try {
    await fs.unlink(thumbnailPath);
  } catch {
    // Ignore if doesn't exist
  }
}

/**
 * Calculate file hash (SHA256)
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Resize an existing thumbnail to a specific size on-the-fly
 * Used for serving different sizes without storing multiple copies
 */
export async function resizeThumbnail(
  thumbnailPath: string,
  targetSize: number
): Promise<Buffer> {
  return sharp(thumbnailPath)
    .resize(targetSize, targetSize, {
      fit: 'inside'
      // Allow upscaling for flexibility
    })
    .jpeg({ quality: 85 })
    .toBuffer();
}
