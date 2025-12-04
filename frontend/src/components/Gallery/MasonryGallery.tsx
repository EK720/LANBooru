import { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import ImageCard from './ImageCard';
import type { ImageWithTags } from '../../types/api';

interface MasonryGalleryProps {
  images: ImageWithTags[];
  hasMore: boolean;
  isLoading: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
  onNavigate?: () => void;
}

// Column configuration
const TARGET_COLUMN_WIDTH = 285; // Ideal column width in pixels
const MIN_COLUMN_WIDTH = 150; // Minimum column width (for small screens)
const MAX_COLUMNS = 16;
const GAP = 8; // Gap between columns in pixels

// Calculate columns based on width
function calculateColumns(containerWidth: number): { cols: number; colWidth: number } {
  if (containerWidth <= 0) {
    return { cols: 2, colWidth: TARGET_COLUMN_WIDTH };
  }

  // Calculate optimal number of columns based on target width
  let cols = Math.round((containerWidth + GAP) / (TARGET_COLUMN_WIDTH + GAP));

  // Ensure at least 2 columns on phone (420px), 4 on iPad (810px)
  // If we'd get 1 column, try smaller column widths
  if (cols < 2 && containerWidth >= 300) {
    // For small screens, aim for 2 columns minimum
    cols = 2;
  } else if (cols < 1) {
    cols = 1;
  }

  // Cap at max columns
  cols = Math.min(cols, MAX_COLUMNS);

  // Calculate actual column width given the number of columns
  const colWidth = Math.floor((containerWidth - GAP * (cols - 1)) / cols);

  // If column width is too small, reduce columns
  if (colWidth < MIN_COLUMN_WIDTH && cols > 1) {
    cols = Math.max(1, Math.floor((containerWidth + GAP) / (MIN_COLUMN_WIDTH + GAP)));
    const adjustedWidth = Math.floor((containerWidth - GAP * (cols - 1)) / cols);
    return { cols, colWidth: adjustedWidth };
  }

  return { cols, colWidth };
}

/**
 * Distribute images across columns by placing each in the shortest column.
 * This creates balanced columns unlike CSS columns which fill top-to-bottom.
 */
function distributeToColumns(images: ImageWithTags[], numColumns: number, columnWidth: number): ImageWithTags[][] {
  if (numColumns <= 0 || images.length === 0) {
    return Array(Math.max(1, numColumns)).fill([]);
  }

  // Initialize columns and their heights
  const columns: ImageWithTags[][] = Array.from({ length: numColumns }, () => []);
  const columnHeights: number[] = Array(numColumns).fill(0);

  // Place each image in the shortest column
  for (const image of images) {
    // Find the shortest column
    let shortestIndex = 0;
    let shortestHeight = columnHeights[0];
    for (let i = 1; i < numColumns; i++) {
      if (columnHeights[i] < shortestHeight) {
        shortestHeight = columnHeights[i];
        shortestIndex = i;
      }
    }

    // Add image to shortest column
    columns[shortestIndex].push(image);

    // Update column height (use aspect ratio to estimate height)
    // Fallback to square aspect ratio if dimensions are invalid
    const width = image.width || 1;
    const height = image.height || 1;
    const aspectRatio = width / height;
    const imageHeight = columnWidth / aspectRatio;
    columnHeights[shortestIndex] += imageHeight + GAP; // Add gap between images
  }

  return columns;
}

// Get initial columns based on window width (for SSR/initial render)
function getInitialColumns(): { cols: number; colWidth: number } {
  if (typeof window === 'undefined') {
    return { cols: 4, colWidth: TARGET_COLUMN_WIDTH };
  }
  // Use a reasonable estimate based on window width minus some padding
  const estimatedWidth = window.innerWidth - 32; // Account for padding
  return calculateColumns(estimatedWidth);
}

export default function MasonryGallery({
  images,
  hasMore,
  isLoading,
  isFetchingMore,
  onLoadMore,
  onNavigate,
}: MasonryGalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Initialize with reasonable defaults based on window size
  const initial = getInitialColumns();
  const [numColumns, setNumColumns] = useState(initial.cols);
  const [columnWidth, setColumnWidth] = useState(initial.colWidth);

  // Calculate columns and width based on container size
  // Use useLayoutEffect to avoid flash of wrong layout
  useLayoutEffect(() => {
    const updateLayout = () => {
      if (!containerRef.current) return;

      const containerWidth = containerRef.current.offsetWidth;
      const { cols, colWidth } = calculateColumns(containerWidth);

      setNumColumns(cols);
      setColumnWidth(colWidth);
    };

    // Initial calculation
    updateLayout();

    // Use ResizeObserver for more accurate container tracking
    const resizeObserver = new ResizeObserver(() => {
      updateLayout();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Infinite scroll observer
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading && !isFetchingMore) {
          onLoadMore();
        }
      },
      { rootMargin: '200px' }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [hasMore, isLoading, isFetchingMore, onLoadMore]);

  // Distribute images to columns for balanced layout
  const columns = useMemo(
    () => distributeToColumns(images, numColumns, columnWidth),
    [images, numColumns, columnWidth]
  );

  if (isLoading && images.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 400,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!isLoading && images.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 400,
        }}
      >
        <Typography color="text.secondary">No images found</Typography>
      </Box>
    );
  }

  return (
    <Box ref={containerRef} sx={{ width: '100%' }}>
      {/* Custom balanced masonry layout */}
      <Box
        sx={{
          display: 'flex',
          gap: `${GAP}px`,
          width: '100%',
        }}
      >
        {columns.map((columnImages, colIndex) => (
          <Box
            key={colIndex}
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: `${GAP}px`,
            }}
          >
            {columnImages.map((image) => (
              <ImageCard
                key={image.id}
                image={image}
                columnWidth={columnWidth}
                onNavigate={onNavigate}
              />
            ))}
          </Box>
        ))}
      </Box>

      {/* Load more trigger */}
      <Box
        ref={loadMoreRef}
        sx={{
          display: 'flex',
          justifyContent: 'center',
          py: 4,
        }}
      >
        {isFetchingMore && <CircularProgress size={32} />}
        {!hasMore && images.length > 0 && (
          <Typography color="text.secondary" variant="body2">
            No more images
          </Typography>
        )}
      </Box>
    </Box>
  );
}
