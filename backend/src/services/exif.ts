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
	
	// Extract date: prioritize CreateDate, fallback to mtime
	if (metadata.CreateDate) {
		try {
			// ExifDateTime objects have a .toDate() method
			const parsedDate = typeof metadata.CreateDate.toDate === 'function'
				? metadata.CreateDate.toDate()
				: new Date(metadata.CreateDate);

			// Check for invalid dates (e.g., 0000-00-00)
			if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() >= 1900) {
				date = parsedDate;
			}
		} catch {
			// Invalid date format, will fall back to mtime
		}
	}

	// Fall back to filesystem modified time if no valid EXIF date
	if (!date) {
		const fileTimes = fs.statSync(filePath);
		if (fileTimes) {
			date = fileTimes.mtime;
		}
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

// Internal/meta tags that should not be written to files
const INTERNAL_TAGS = ['duplicate_image'];

/**
 * Write tags to image/video file metadata
 * Filters out internal tags like 'duplicate_image'
 *
 * JPEG: Writes to XPKeywords field (semicolon-separated)
 * Video: Writes to Genre field (semicolon-separated)
 * PNG/WebP: Writes to XMP Subject field
 */
export async function writeTagsToFile(filePath: string, tags: string[]): Promise<void> {
  try {
    const ext = path.extname(filePath).toLowerCase();

    // Filter out internal tags
    const writableTags = tags.filter(t => !INTERNAL_TAGS.includes(t));
    const tagString = writableTags.join(';');

    if (ext === '.jpg' || ext === '.jpeg') {
      // JPEG: Write to XPKeywords
      await exiftool.write(filePath, {
        XPKeywords: tagString
      }, ['-overwrite_original']);
    } else if (ext === '.mp4' || ext === '.webm' || ext === '.mkv') {
      // Video: Write to Genre field
      await exiftool.write(filePath, {
        Genre: tagString
      } as any, ['-overwrite_original']);
    } else if (ext === '.png' || ext === '.webp') {
      // PNG/WebP: Write to XMP Subject
      await exiftool.write(filePath, {
        'Subject': writableTags
      }, ['-overwrite_original']);
    }

    console.log(`Wrote ${writableTags.length} tags to ${path.basename(filePath)}`);
  } catch (error) {
    console.error(`Failed to write tags to ${filePath}:`, error);
    throw error;
  }
}

/**
 * Cleanup ExifTool process on shutdown
 */
export async function cleanup() {
  await exiftool.end();
}
