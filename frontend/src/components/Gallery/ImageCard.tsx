import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Box, Skeleton } from '@mui/material';
import { getThumbnailUrl, calculateThumbnailSize } from '../../api/client';
import type { ImageWithTags } from '../../types/api';

interface ImageCardProps {
  image: ImageWithTags;
  columnWidth: number;
  onNavigate?: () => void;
}

export default function ImageCard({ image, columnWidth, onNavigate }: ImageCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // Calculate aspect ratio for proper sizing
  const aspectRatio = image.width / image.height;
  const displayHeight = columnWidth / aspectRatio;

  // Calculate optimal thumbnail size based on column width and DPR
  const thumbnailSize = calculateThumbnailSize(columnWidth);
  const thumbnailUrl = getThumbnailUrl(image.id, thumbnailSize);

  // Reset states when image changes
  useEffect(() => {
    setLoaded(false);
    setError(false);
  }, [image.id]);

  return (
    <Link
      to={`/image/${image.id}`}
      onClick={onNavigate}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          height: displayHeight,
          bgcolor: 'background.paper',
          borderRadius: 1,
          overflow: 'hidden',
          mb: 1,
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: 4,
          },
        }}
      >
        {!loaded && !error && (
          <Skeleton
            variant="rectangular"
            width="100%"
            height="100%"
            animation="wave"
            sx={{ position: 'absolute', top: 0, left: 0 }}
          />
        )}

        {error ? (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'text.secondary',
              fontSize: '0.75rem',
            }}
          >
            Failed to load
          </Box>
        ) : (
          <img
            src={thumbnailUrl}
            alt={image.filename}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: loaded ? 1 : 0,
              transition: 'opacity 0.2s ease',
            }}
          />
        )}
      </Box>
    </Link>
  );
}
