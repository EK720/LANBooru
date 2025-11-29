import { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import Masonry from 'react-masonry-css';
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
const TARGET_COLUMN_WIDTH = 280; // Ideal column width in pixels
const MIN_COLUMN_WIDTH = 150; // Minimum column width (for small screens)
const MAX_COLUMNS = 16;
const GAP = 8; // Gap between columns in pixels

// Calculate columns based on width
function calculateColumns(containerWidth: number): { cols: number; colWidth: number } {
  if (containerWidth <= 0) {
    return { cols: 2, colWidth: TARGET_COLUMN_WIDTH };
  }

  // Calculate optimal number of columns based on target width
  let cols = Math.floor((containerWidth + GAP) / (TARGET_COLUMN_WIDTH + GAP));

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
      <Masonry
        breakpointCols={numColumns}
        className="masonry-grid"
        columnClassName="masonry-grid-column"
      >
        {images.map((image) => (
          <ImageCard
            key={image.id}
            image={image}
            columnWidth={columnWidth}
            onNavigate={onNavigate}
          />
        ))}
      </Masonry>

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
