import { exiftool, Tags } from 'exiftool-vendored';
import path from 'path';

export interface ExifMetadata {
  tags: string[];
  artist?: string;
  rating?: number;
  width?: number;
  height?: number;
  source?: string;
}

/**
 * Extract metadata from image/video files
 * JPEG: Tags from XPKeywords field
 * MP4: Tags from Genre field
 */
export async function extractMetadata(filePath: string): Promise<ExifMetadata> {
  try {
    const metadata: Tags = await exiftool.read(filePath);
    const ext = path.extname(filePath).toLowerCase();

    let tags: string[] = [];
    let artist: string | undefined;
    let rating: number | undefined;
    let width: number | undefined;
    let height: number | undefined;
    let source: string | undefined;

    // Extract tags based on file type
    if (ext === '.jpg' || ext === '.jpeg') {
      // JPEG: Read from XPKeywords (UTF-16LE, semicolon-separated)
      const xpKeywords = metadata.XPKeywords;
      if (xpKeywords && typeof xpKeywords === 'string') {
        tags = xpKeywords.split(';').map(t => t.trim()).filter(t => t.length > 0);
      }

      artist = metadata.Artist as string | undefined;
      width = metadata.ImageWidth as number | undefined;
      height = metadata.ImageHeight as number | undefined;
    } else if (ext === '.mp4' || ext === '.webm' || ext === '.mkv') {
      // Video: Read from Genre field (semicolon-separated)
      const genre = metadata.Genre;
      if (genre && typeof genre === 'string') {
        tags = genre.split(';').map(t => t.trim()).filter(t => t.length > 0);
      }

      artist = metadata.Artist as string | undefined;
      width = metadata.ImageWidth as number | undefined;
      height = metadata.ImageHeight as number | undefined;
    }

    // Extract rating from XMP if available
    if (metadata.Rating) {
      rating = parseInt(String(metadata.Rating));
    }

    // Extract source/comment if available
    if (metadata.Comment) {
      source = metadata.Comment as string;
    } else if (metadata.Description) {
      source = metadata.Description as string;
    }

    return {
      tags,
      artist,
      rating: rating && !isNaN(rating) ? rating : undefined,
      width,
      height,
      source
    };
  } catch (error) {
    console.error(`Failed to extract metadata from ${filePath}:`, error);
    return { tags: [] };
  }
}

/**
 * Cleanup ExifTool process on shutdown
 */
export async function cleanup() {
  await exiftool.end();
}
