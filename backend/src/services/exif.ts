import fs from 'fs';
import { exiftool } from 'exiftool-vendored';
import path from 'path';

export interface ExifMetadata {
  tags: string[];
  artist?: string;
  rating?: number;
  width?: number;
  height?: number;
  source?: string;
  date?: Date;
}

/**
 * Extract metadata from image/video files
 * JPEG: Tags from XPKeywords field
 * MP4: Tags from Genre field
 */
export async function extractMetadata(filePath: string): Promise<ExifMetadata> {
  try {
    // Use any type since different file types have different fields
    const metadata: any = await exiftool.read(filePath);
    const ext = path.extname(filePath).toLowerCase();

    let tags: string[] = [];
    let artist: string | undefined;
    let rating: number | undefined;
    let width: number | undefined;
    let height: number | undefined;
    let source: string | undefined;
	let date: Date | undefined;

    // Extract tags based on file type
    if (ext === '.jpg' || ext === '.jpeg') {
      // JPEG: Read from XPKeywords (UTF-16LE, semicolon-separated)
      const xpKeywords = metadata.XPKeywords;
      if (xpKeywords && typeof xpKeywords === 'string') {
        tags = xpKeywords.split(';').map(t => t.trim()).filter(t => t.length > 0);
      }

      artist = metadata.Artist;
      width = metadata.ImageWidth;
      height = metadata.ImageHeight;
    } else if (ext === '.mp4' || ext === '.webm' || ext === '.mkv') {
      // Video: Read from Genre field (semicolon-separated)
      const genre = metadata.Genre;
      if (genre && typeof genre === 'string') {
        tags = genre.split(';').map(t => t.trim()).filter(t => t.length > 0);
      }

      artist = metadata.Artist;
      width = metadata.ImageWidth;
      height = metadata.ImageHeight;
    }

    // Extract rating from XMP if available
    if (metadata.Rating) {
      rating = parseInt(String(metadata.Rating));
    }

    // Extract source/comment if available
    if (metadata.Comment) {
      source = metadata.Comment;
    } else if (metadata.Description) {
      source = metadata.Description;
    }
	
	// Log all available date fields for analysis
	const fileTimes = fs.statSync(filePath);
	console.log(`\n=== Date fields for ${path.basename(filePath)} ===`);
	console.log('EXIF Fields:');
	console.log('  DateTimeOriginal:', metadata.DateTimeOriginal || 'N/A');
	console.log('  CreateDate:', metadata.CreateDate || 'N/A');
	console.log('  MediaCreateDate:', metadata.MediaCreateDate || 'N/A');
	console.log('  FileModifyDate:', metadata.FileModifyDate || 'N/A');
	console.log('  ModifyDate:', metadata.ModifyDate || 'N/A');
	console.log('  DateCreated:', metadata.DateCreated || 'N/A');
	console.log('Filesystem:');
	console.log('  birthtime:', fileTimes.birthtime);
	console.log('  mtime:', fileTimes.mtime);
	console.log('  ctime:', fileTimes.ctime);

	// For now, use filesystem mtime
	if (fileTimes) {
		date = fileTimes.mtime;
	}

    return {
      tags,
      artist,
      rating: rating && !isNaN(rating) ? rating : undefined,
      width,
      height,
      source,
	  date
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
