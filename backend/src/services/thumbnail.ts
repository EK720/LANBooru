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
 * Generate a thumbnail for an image or video
 * For videos: tries first frame, then 1/3, then 2/3 to avoid black frames
 * Resizes so the largest dimension is THUMBNAIL_SIZE, preserving aspect ratio
 */
export async function generateThumbnail(
  filePath: string,
  fileHash: string
): Promise<void> {
  try {
    const ext = path.extname(filePath).toLowerCase();

    // Ensure thumbnail directory exists
    await fs.mkdir(THUMBNAIL_DIR, { recursive: true });

    const outputPath = path.join(THUMBNAIL_DIR, `${fileHash}.jpg`);

    // Check if thumbnail already exists
    try {
      await fs.access(outputPath);
      return; // Skip if exists
    } catch {
      // Doesn't exist, create it
    }

    let imageBuffer: Buffer;

    // Handle videos
    if (['.mp4', '.webm', '.mkv'].includes(ext)) {
      const duration = await getVideoDuration(filePath);

      if (duration <= 0) {
        console.error(`Invalid video duration for ${filePath}`);
        return;
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

    // Resize so largest dimension becomes THUMBNAIL_SIZE, preserving aspect ratio
    await sharp(imageBuffer)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: 'inside',  // Fit within box, preserving aspect ratio
        withoutEnlargement: true  // Don't upscale small images
      })
      .jpeg({ quality: 85 })
      .toFile(outputPath);
  } catch (error) {
    console.error(`Failed to generate thumbnail for ${filePath}:`, error);
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
