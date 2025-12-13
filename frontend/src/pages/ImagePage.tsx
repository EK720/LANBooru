import { useEffect, useCallback, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Box,
  Typography,
  Chip,
  Stack,
  IconButton,
  Paper,
  Skeleton,
  Divider,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Checkbox,
  Alert,
  Select,
  MenuItem,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  OpenInNew as ExternalIcon,
  Download as DownloadIcon,
  ContentCopy as DuplicateIcon,
  Star as PrimeIcon,
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Close as CloseIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  Slideshow as SlideshowIcon,
} from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useImage } from '../hooks/useImage';
import { useGalleryNavigation } from '../hooks/useGalleryNavigation';
import {
  getImageFileUrl,
  searchImages,
  updateImageTags,
  updateImageRating,
  deleteImageById,
  getEditPassword,
  setEditPassword,
  getStats,
} from '../api/client';
import { usePlugins, PluginButton } from '../plugins';

function formatRating(rating: number | null | undefined): string {
  switch (rating) {
    case 1: return 'Safe';
    case 2: return 'Questionable';
    case 3: return 'Explicit';
    default: return 'Undefined';
  }
}

// Matches URLs with or without protocol (e.g., example.com/path, https://example.com)
const URL_REGEX = /[-a-zA-Z0-9@:%._+~#=]{1,256}\.(?=\D)[a-zA-Z0-9()]{2,6}\b([-a-zA-Z0-9()@:%_+.~#?&\/=]*)/;

/**
 * Check if a string looks like a URL
 */
function isUrl(text: string): boolean {
  return URL_REGEX.test(text);
}

/**
 * Get a proper href for a URL (adds https:// if missing)
 */
function getHref(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

const DEFAULT_SLIDESHOW_INTERVAL = parseFloat(import.meta.env.VITE_DEFAULT_SLIDESHOW_INTERVAL) || 3;

export default function ImagePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const imageId = id ? parseInt(id, 10) : undefined;

  // Slideshow state from URL params
  const slideshowParam = searchParams.get('slideshow') === 'true';
  const intervalParam = parseFloat(searchParams.get('interval') || '') || DEFAULT_SLIDESHOW_INTERVAL;
  const [slideshowPlaying, setSlideshowPlaying] = useState(slideshowParam);
  const [slideshowInterval, setSlideshowInterval] = useState(intervalParam);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Reset loaded state when image changes
  useEffect(() => {
    setImageLoaded(false);
  }, [imageId]);

  const { data: image, isLoading, error } = useImage(imageId);
  const { getAdjacentImages, getNavigationContext, appendToNavigationContext, removeFromNavigationContext } = useGalleryNavigation();
  const { getButtonsForLocation, setTagEditorCallback, setCurrentImage } = usePlugins();

  // Fetch config to check if password is required
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: getStats,
    staleTime: 60 * 60 * 1000, // Cache for 1 hour
  });
  const requirePassword = stats?.require_edit_password !== false;

  // Get prev/next images from navigation context
  const { prev, next, canLoadMore } = imageId
    ? getAdjacentImages(imageId)
    : { prev: null, next: null, canLoadMore: false };

  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editedTags, setEditedTags] = useState('');
  const [editedRating, setEditedRating] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Password dialog state
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'save' | 'delete' | null>(null);

  // Delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteFile, setDeleteFile] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Register plugin callbacks
  useEffect(() => {
    // Update plugin context with current image
    setCurrentImage(image || null);

    // Register tag editor callback for plugins
    setTagEditorCallback((tags: string[], mode: 'append' | 'replace') => {
      if (!image) return;

      let newTags: string;
      if (mode === 'replace') {
        newTags = tags.join(' ');
      } else {
        // Append: combine existing with new, avoiding duplicates
        const existingSet = new Set(image.tags);
        const combined = [...image.tags, ...tags.filter(t => !existingSet.has(t))];
        newTags = combined.join(' ');
      }

      setEditedTags(newTags);
      setEditedRating(image.rating ?? null);
      setEditError(null);
      setIsEditing(true);
    });

    // Cleanup on unmount
    return () => {
      setCurrentImage(null);
      setTagEditorCallback(null);
    };
  }, [image, setCurrentImage, setTagEditorCallback]);

  // Slideshow controls
  const startSlideshow = useCallback(() => {
    setSlideshowPlaying(true);
    setSearchParams(params => {
      params.set('slideshow', 'true');
      params.set('interval', slideshowInterval.toString());
      return params;
    }, { replace: true });
  }, [slideshowInterval, setSearchParams]);

  const stopSlideshow = useCallback(() => {
    setSlideshowPlaying(false);
    setSearchParams(params => {
      params.delete('slideshow');
      params.delete('interval');
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const toggleSlideshow = useCallback(() => {
    if (slideshowPlaying) {
      setSlideshowPlaying(false);
    } else {
      setSlideshowPlaying(true);
    }
  }, [slideshowPlaying]);

  const updateInterval = useCallback((newInterval: number) => {
    const clampedInterval = Math.max(0.5, Math.min(60, newInterval));
    setSlideshowInterval(clampedInterval);
    if (slideshowPlaying) {
      setSearchParams(params => {
        params.set('interval', clampedInterval.toString());
        return params;
      }, { replace: true });
    }
  }, [slideshowPlaying, setSearchParams]);

  const goToPrev = useCallback(() => {
    if (prev) navigate(`/image/${prev}`);
  }, [prev, navigate]);

  const goToNext = useCallback(async () => {
    // Preserve slideshow params if active
    const slideshowSuffix = slideshowPlaying ? `?slideshow=true&interval=${slideshowInterval}` : '';

    if (next) {
      navigate(`/image/${next}${slideshowSuffix}`);
      return;
    }

    // At the end but can load more
    if (canLoadMore && !isLoadingMore) {
      setIsLoadingMore(true);
      try {
        const context = getNavigationContext();
        if (!context) return;

        const result = await searchImages({
          q: context.searchQuery || undefined,
          page: context.currentPage + 1,
          sort: context.sort,
        });

        if (result.images.length > 0) {
          const newIds = result.images.map(img => img.id);
          const hasMore = result.page < result.total_pages;
          appendToNavigationContext(newIds, hasMore);
          // Navigate to first image of new page
          navigate(`/image/${newIds[0]}${slideshowSuffix}`);
        }
      } catch (err) {
        console.error('Failed to load more images:', err);
      } finally {
        setIsLoadingMore(false);
      }
    }
  }, [next, canLoadMore, isLoadingMore, navigate, getNavigationContext, appendToNavigationContext, slideshowPlaying, slideshowInterval]);

  const goBack = useCallback(() => {
    // Navigate back to the gallery with search query preserved
    const savedState = sessionStorage.getItem('gallery-scroll-state');
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        navigate(state.pathname + state.search);
        return;
      } catch {
        // Invalid state, fall through to home
      }
    }
    navigate('/');
  }, [navigate]);

  // Handle password submission - then retry the pending action
  const handlePasswordSubmit = useCallback(() => {
    if (!passwordInput.trim()) {
      setPasswordError('Password is required');
      return;
    }
    setEditPassword(passwordInput.trim());
    setPasswordError(null);
    setShowPasswordDialog(false);
    setPasswordInput('');

    // Retry the pending action
    if (pendingAction === 'save') {
      // Will be called after state updates
      setTimeout(() => saveEdits(), 0);
    } else if (pendingAction === 'delete') {
      setTimeout(() => confirmDelete(), 0);
    }
    setPendingAction(null);
  }, [passwordInput, pendingAction]);

  // Start editing tags and rating - no password required yet
  const startEditing = useCallback(() => {
    if (!image) return;
    setEditedTags(image.tags.join(' '));
    setEditedRating(image.rating ?? null);
    setEditError(null);
    setIsEditing(true);
  }, [image]);

  // Cancel editing
  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditedTags('');
    setEditedRating(null);
    setEditError(null);
  }, []);

  // Save edited tags and rating - prompts for password if needed
  const saveEdits = useCallback(async () => {
    if (!imageId || !image) return;

    // Check if we have a password, prompt if not (skip if password not required)
    if (requirePassword && !getEditPassword()) {
      setPendingAction('save');
      setShowPasswordDialog(true);
      return;
    }

    // Split by whitespace, filter empty, sanitize
    const newTags = editedTags
      .split(/\s+/)
      .map(t => t.trim().replace(/[;,]/g, ''))
      .filter(t => t.length > 0);

    // Check what actually changed (existing tags are already sorted from DB)
    const tagsChanged = JSON.stringify(image.tags) !== JSON.stringify([...newTags].sort());
    const ratingChanged = editedRating !== (image.rating ?? null);

    // If nothing changed, just close the editor
    if (!tagsChanged && !ratingChanged) {
      setIsEditing(false);
      setEditedTags('');
      setEditedRating(null);
      return;
    }

    setIsSaving(true);
    setEditError(null);

    try {
      // Only update tags if they changed
      if (tagsChanged) {
        await updateImageTags(imageId, newTags);
      }

      // Only update rating if it changed
      if (ratingChanged) {
        await updateImageRating(imageId, editedRating);
      }

      // Invalidate cache to refetch
      queryClient.invalidateQueries({ queryKey: ['image', imageId] });
      queryClient.invalidateQueries({ queryKey: ['search'] });

      setIsEditing(false);
      setEditedTags('');
      setEditedRating(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      // If password was wrong, prompt for new password
      if (message === 'Invalid password') {
        setPendingAction('save');
        setShowPasswordDialog(true);
        setPasswordError('Incorrect password');
      } else {
        setEditError(message);
      }
    } finally {
      setIsSaving(false);
    }
  }, [imageId, image, editedTags, editedRating, queryClient, requirePassword]);

  // Start delete flow - no password required yet
  const startDelete = useCallback(() => {
    setDeleteError(null);
    setShowDeleteDialog(true);
  }, []);

  // Confirm delete - prompts for password if needed
  const confirmDelete = useCallback(async () => {
    if (!imageId) return;

    // Check if we have a password, prompt if not (skip if password not required)
    if (requirePassword && !getEditPassword()) {
      setPendingAction('delete');
      setShowPasswordDialog(true);
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    // Capture duplicate group IDs before deletion so we can invalidate their cache
    const duplicateGroupIds = image?.duplicates?.group?.filter(id => id !== imageId) || [];

    try {
      await deleteImageById(imageId, deleteFile);

      // Remove from navigation context so user can't navigate back to deleted image
      removeFromNavigationContext(imageId);

      // Invalidate cache for deleted image and search results
      queryClient.invalidateQueries({ queryKey: ['image', imageId] });
      queryClient.invalidateQueries({ queryKey: ['search'] });

      // Invalidate cache for other images in the duplicate group so their sidebar updates
      for (const dupId of duplicateGroupIds) {
        queryClient.invalidateQueries({ queryKey: ['image', dupId] });
      }

      // Navigate to next image or back to gallery
      setShowDeleteDialog(false);
      if (next) {
        navigate(`/image/${next}`);
      } else if (prev) {
        navigate(`/image/${prev}`);
      } else {
        goBack();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete image';
      // If password was wrong, prompt for new password
      if (message === 'Invalid password') {
        setPendingAction('delete');
        setShowPasswordDialog(true);
        setPasswordError('Incorrect password');
      } else {
        setDeleteError(message);
      }
    } finally {
      setIsDeleting(false);
    }
  }, [imageId, deleteFile, queryClient, next, prev, navigate, goBack, requirePassword, removeFromNavigationContext]);

  // Slideshow auto-advance (only after image loads)
  useEffect(() => {
    if (!slideshowPlaying || !imageLoaded || (!next && !canLoadMore)) return;

    const timer = setTimeout(() => {
      goToNext();
    }, slideshowInterval * 1000);

    return () => clearTimeout(timer);
  }, [slideshowPlaying, imageLoaded, next, canLoadMore, slideshowInterval, goToNext]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          goToPrev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          goToNext();
          break;
        case 'Escape':
          e.preventDefault();
          goBack();
          break;
        case ' ':
          // Space to toggle slideshow play/pause when in slideshow mode
          if (slideshowParam || slideshowPlaying) {
            e.preventDefault();
            toggleSlideshow();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext, goBack, slideshowPlaying, slideshowParam, stopSlideshow, toggleSlideshow]);

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
          bgcolor: 'imageViewer.background',
          position: 'relative',
        }}
      >
        {/* Top bar */}
        <Box
          sx={(theme) => ({
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            p: 1,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 1,
            background: theme.palette.imageViewer.gradient,
          })}
        >
          <IconButton onClick={() => goBack()} sx={{ color: 'imageViewer.controls' }}>
            <BackIcon />
          </IconButton>

          {/* Slideshow controls - shown when in slideshow mode */}
          {(slideshowParam || slideshowPlaying) && (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{
                bgcolor: 'rgba(0,0,0,0.5)',
                borderRadius: 2,
                px: 1.5,
                py: 0.5,
              }}
            >
              <IconButton
                onClick={toggleSlideshow}
                size="small"
                sx={{ color: 'imageViewer.controls' }}
                title={slideshowPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {slideshowPlaying ? <PauseIcon /> : <PlayIcon />}
              </IconButton>
              <TextField
                type="number"
                size="small"
                value={slideshowInterval}
                onChange={(e) => updateInterval(parseFloat(e.target.value) || DEFAULT_SLIDESHOW_INTERVAL)}
                inputProps={{ min: 0.5, max: 60, step: 0.5 }}
                sx={{
                  width: 70,
                  '& .MuiInputBase-input': {
                    color: 'white',
                    py: 0.5,
                    textAlign: 'center',
                  },
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgba(255,255,255,0.3)',
                  },
                }}
              />
              <Typography variant="body2" sx={{ color: 'imageViewer.controls' }}>
                sec
              </Typography>
              <IconButton
                onClick={stopSlideshow}
                size="small"
                sx={{ color: 'imageViewer.controls' }}
                title="Stop slideshow"
              >
                <StopIcon />
              </IconButton>
            </Stack>
          )}

          <Stack direction="row" spacing={1}>
            {/* Plugin buttons for top bar */}
            {image && getButtonsForLocation('image-topbar').map((btn) => (
              <PluginButton
                key={`${btn.pluginId}-${btn.id}`}
                button={btn}
                image={image}
                variant="icon"
              />
            ))}

            {/* Start slideshow button - only show when not in slideshow mode and there's a next image */}
            {!slideshowPlaying && !slideshowParam && (next || canLoadMore) && (
              <IconButton
                onClick={startSlideshow}
                sx={{ color: 'imageViewer.controls' }}
                title="Start slideshow"
              >
                <SlideshowIcon />
              </IconButton>
            )}
            <IconButton
              component="a"
              href={fileUrl}
              target="_blank"
              rel="noopener"
              sx={{ color: 'imageViewer.controls' }}
            >
              <ExternalIcon />
            </IconButton>
            <IconButton
              component="a"
              href={fileUrl}
              download={image?.filename}
              sx={{ color: 'imageViewer.controls' }}
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
              onLoadedData={() => setImageLoaded(true)}
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
              onLoad={() => setImageLoaded(true)}
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
          pb: { xs: 9, md: 2 }, // Extra bottom padding on mobile for fixed nav footer
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
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="overline" color="text.secondary">
                  Tags
                </Typography>
                {!isEditing && (
                  <IconButton size="small" onClick={startEditing} title="Edit tags">
                    <EditIcon fontSize="small" />
                  </IconButton>
                )}
              </Stack>
              {isEditing ? (
                <Stack spacing={1} sx={{ mt: 1 }}>
                  <TextField
                    fullWidth
                    size="small"
                    multiline
                    rows={3}
                    value={editedTags}
                    onChange={(e) => setEditedTags(e.target.value)}
                    placeholder="Tags separated by spaces"
                    disabled={isSaving}
                    helperText="Use underscores for multi-word tags (e.g., brown_hair)"
                  />
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" color="text.secondary">
                      Rating:
                    </Typography>
                    <Select
                      size="small"
                      value={editedRating ?? 0}
                      onChange={(e) => setEditedRating(e.target.value === 0 ? null : Number(e.target.value))}
                      disabled={isSaving}
                      sx={{ minWidth: 130 }}
                    >
                      <MenuItem value={0}>Undefined</MenuItem>
                      <MenuItem value={1}>Safe</MenuItem>
                      <MenuItem value={2}>Questionable</MenuItem>
                      <MenuItem value={3}>Explicit</MenuItem>
                    </Select>
                  </Stack>
                  {editError && (
                    <Alert severity="error" sx={{ py: 0 }}>
                      {editError}
                    </Alert>
                  )}
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<SaveIcon />}
                      onClick={saveEdits}
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<CloseIcon />}
                      onClick={cancelEditing}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                  </Stack>
                </Stack>
              ) : image.tags.length > 0 ? (
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
                {image.rating && !isEditing && (
                  <Typography variant="body2">
                    <strong>Rating:</strong> {formatRating(image.rating)}
                  </Typography>
                )}
                {image.source && (
                  <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                    <strong>Source:</strong>{' '}
                    {isUrl(image.source) ? (
                      <a href={getHref(image.source)} target="_blank" rel="noopener noreferrer">
                        {image.source}
                      </a>
                    ) : (
                      image.source
                    )}
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

            <Divider />

            {/* Actions */}
            <Box>
              <Typography variant="overline" color="text.secondary">
                Actions
              </Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {/* Plugin buttons for sidebar */}
                {getButtonsForLocation('image-sidebar').map((btn) => (
                  <PluginButton
                    key={`${btn.pluginId}-${btn.id}`}
                    button={btn}
                    image={image}
                    variant="outlined"
                  />
                ))}
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  startIcon={<DeleteIcon />}
                  onClick={startDelete}
                >
                  Delete Image
                </Button>
              </Stack>
            </Box>
          </Stack>
        ) : null}
      </Paper>

      {/* Mobile-only navigation footer */}
      {(prev || next || canLoadMore) && (
        <Box
          sx={{
            display: { xs: 'flex', md: 'none' },
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            bgcolor: 'background.paper',
            borderTop: 1,
            borderColor: 'divider',
            justifyContent: 'space-between',
            p: 1,
            zIndex: 10,
          }}
        >
          <IconButton
            onClick={goToPrev}
            disabled={!prev}
            sx={{ opacity: prev ? 1 : 0.3 }}
          >
            <PrevIcon />
          </IconButton>
          <IconButton
            onClick={goToNext}
            disabled={(!next && !canLoadMore) || isLoadingMore}
            sx={{ opacity: (next || canLoadMore) ? 1 : 0.3 }}
          >
            <NextIcon />
          </IconButton>
        </Box>
      )}

      {/* Password Dialog */}
      <Dialog open={showPasswordDialog} onClose={() => setShowPasswordDialog(false)}>
        <DialogTitle>Enter Edit Password</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            type="password"
            label="Password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
            error={!!passwordError}
            helperText={passwordError}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPasswordDialog(false)}>Cancel</Button>
          <Button onClick={handlePasswordSubmit} variant="contained">
            Continue
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onClose={() => !isDeleting && setShowDeleteDialog(false)}>
        <DialogTitle>Delete Image</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Are you sure you want to delete this image? This action cannot be undone.
          </Typography>
          <FormControlLabel
            control={
              <Checkbox
                checked={deleteFile}
                onChange={(e) => setDeleteFile(e.target.checked)}
                disabled={isDeleting}
              />
            }
            label="Also delete the file from disk"
          />
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteDialog(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            onClick={confirmDelete}
            variant="contained"
            color="error"
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
