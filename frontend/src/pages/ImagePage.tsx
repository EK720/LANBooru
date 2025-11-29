import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Box,
  Typography,
  Chip,
  Stack,
  IconButton,
  Paper,
  Skeleton,
  Divider,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  OpenInNew as ExternalIcon,
  Download as DownloadIcon,
  ContentCopy as DuplicateIcon,
  Star as PrimeIcon,
} from '@mui/icons-material';
import { useImage } from '../hooks/useImage';
import { getImageFileUrl } from '../api/client';

export default function ImagePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const imageId = id ? parseInt(id, 10) : undefined;

  const { data: image, isLoading, error } = useImage(imageId);

  if (error) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="error">Failed to load image</Typography>
      </Box>
    );
  }

  const fileUrl = imageId ? getImageFileUrl(imageId) : '';

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, minHeight: '100%' }}>
      {/* Image viewer */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'black',
          position: 'relative',
        }}
      >
        {/* Top bar */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            p: 1,
            display: 'flex',
            justifyContent: 'space-between',
            zIndex: 1,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)',
          }}
        >
          <IconButton onClick={() => navigate(-1)} sx={{ color: 'white' }}>
            <BackIcon />
          </IconButton>
          <Stack direction="row" spacing={1}>
            <IconButton
              component="a"
              href={fileUrl}
              target="_blank"
              rel="noopener"
              sx={{ color: 'white' }}
            >
              <ExternalIcon />
            </IconButton>
            <IconButton
              component="a"
              href={fileUrl}
              download={image?.filename}
              sx={{ color: 'white' }}
            >
              <DownloadIcon />
            </IconButton>
          </Stack>
        </Box>

        {/* Image */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 2,
            minHeight: { xs: '50vh', md: 'calc(100vh - 64px)' },
          }}
        >
          {isLoading ? (
            <Skeleton
              variant="rectangular"
              width="80%"
              height="60%"
              sx={{ bgcolor: 'grey.900' }}
            />
          ) : image && ['mp4', 'webm', 'mkv'].includes(image.file_type) ? (
            <video
              src={fileUrl}
              controls
              autoPlay
              loop
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
              }}
            />
          ) : (
            <img
              src={fileUrl}
              alt={image?.filename}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
              }}
            />
          )}
        </Box>
      </Box>

      {/* Sidebar with metadata */}
      <Paper
        sx={{
          width: { xs: '100%', md: 320 },
          p: 2,
          borderRadius: 0,
          overflowY: 'auto',
        }}
      >
        {isLoading ? (
          <Stack spacing={2}>
            <Skeleton width="60%" />
            <Skeleton width="40%" />
            <Skeleton width="80%" />
          </Stack>
        ) : image ? (
          <Stack spacing={2}>
            {/* Filename */}
            <Typography variant="subtitle2" sx={{ wordBreak: 'break-word' }}>
              {image.filename}
            </Typography>

            <Divider />

            {/* Tags */}
            <Box>
              <Typography variant="overline" color="text.secondary">
                Tags
              </Typography>
              {image.tags.length > 0 ? (
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                  {image.tags.map((tag) => (
                    <Chip
                      key={tag}
                      label={tag}
                      size="small"
                      component={Link}
                      to={`/search?q=${encodeURIComponent(tag)}`}
                      clickable
                      sx={{ mb: 0.5 }}
                    />
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  No tags
                </Typography>
              )}
            </Box>

            {/* Duplicates */}
            {image.duplicates && (
              <>
                <Divider />
                <Box>
                  <Typography variant="overline" color="text.secondary">
                    Duplicates
                  </Typography>
                  <Stack spacing={1} sx={{ mt: 1 }}>
                    {image.duplicates.is_prime ? (
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <PrimeIcon fontSize="small" color="warning" />
                        <Typography variant="body2" color="warning.main">
                          Best quality version
                        </Typography>
                      </Stack>
                    ) : (
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <DuplicateIcon fontSize="small" color="info" />
                        <Typography variant="body2">
                          Duplicate of{' '}
                          <Link to={`/image/${image.duplicates.prime_id}`}>
                            #{image.duplicates.prime_id}
                          </Link>
                        </Typography>
                      </Stack>
                    )}
                    {image.duplicates.group && image.duplicates.group.length > 1 && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          {image.duplicates.group.length} versions:
                        </Typography>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                          {image.duplicates.group.map((dupId) => (
                            <Chip
                              key={dupId}
                              label={dupId === image.duplicates!.prime_id ? `#${dupId} ★` : `#${dupId}`}
                              size="small"
                              component={Link}
                              to={`/image/${dupId}`}
                              clickable
                              variant={dupId === image.id ? 'filled' : 'outlined'}
                              color={dupId === image.duplicates!.prime_id ? 'warning' : 'default'}
                              sx={{ mb: 0.5 }}
                            />
                          ))}
                        </Stack>
                      </Box>
                    )}
                  </Stack>
                </Box>
              </>
            )}

            <Divider />

            {/* Image info */}
            <Box>
              <Typography variant="overline" color="text.secondary">
                Information
              </Typography>
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                <Typography variant="body2">
                  <strong>Dimensions:</strong> {image.width} × {image.height}
                </Typography>
                <Typography variant="body2">
                  <strong>Size:</strong> {formatFileSize(image.file_size)}
                </Typography>
                <Typography variant="body2">
                  <strong>Type:</strong> {image.file_type}
                </Typography>
                {image.artist && (
                  <Typography variant="body2">
                    <strong>Artist:</strong> {image.artist}
                  </Typography>
                )}
                {image.source && (
                  <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                    <strong>Source:</strong>{' '}
                    <a href={image.source} target="_blank" rel="noopener noreferrer">
                      {image.source}
                    </a>
                  </Typography>
                )}
              </Stack>
            </Box>

            <Divider />

            {/* Dates */}
            <Box>
              <Typography variant="overline" color="text.secondary">
                Dates
              </Typography>
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                <Typography variant="body2">
                  <strong>Added:</strong> {formatDate(image.created_at)}
                </Typography>
                <Typography variant="body2">
                  <strong>Updated:</strong> {formatDate(image.updated_at)}
                </Typography>
              </Stack>
            </Box>
          </Stack>
        ) : null}
      </Paper>
    </Box>
  );
}
