import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Typography, Stack, Chip } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import SearchBar from '../components/Search/SearchBar';
import MasonryGallery from '../components/Gallery/MasonryGallery';
import { useSearch } from '../hooks/useSearch';
import { useScrollRestore } from '../hooks/useScrollRestore';
import { getStats } from '../api/client';

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const sort = searchParams.get('sort') || undefined;

  const [searchValue, setSearchValue] = useState(query);

  // Sync search bar with URL query param (e.g., when home button is clicked)
  useEffect(() => {
    setSearchValue(query);
  }, [query]);

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: getStats,
  });

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useSearch(query, sort);

  // Flatten pages into single array
  const images = useMemo(() => {
    return data?.pages.flatMap((page) => page.images) ?? [];
  }, [data]);

  const totalCount = data?.pages[0]?.total ?? 0;
  const loadedPages = data?.pages.length ?? 0;

  const { saveScrollPosition } = useScrollRestore(loadedPages);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleSearch = useCallback((newQuery: string) => {
    if (newQuery.trim()) {
      setSearchParams({ q: newQuery.trim() });
    } else {
      setSearchParams({});
    }
  }, [setSearchParams]);

  // Parse query into tags for display
  const queryTags = query.split(/\s+/).filter(Boolean);

  return (
    <Box sx={{ minHeight: '100%' }}>
      {/* Hero section with search */}
      <Box
        sx={{
          py: 4,
          px: 2,
          textAlign: 'center',
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Typography
          variant="h3"
          component="h1"
          sx={{
            fontWeight: 700,
            mb: 0.5,
            background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          LANBooru
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          v1.0.0
        </Typography>

        {/* Stats row */}
        {stats && (
          <Stack
            direction="row"
            spacing={3}
            justifyContent="center"
            sx={{ mb: 3 }}
          >
            <Typography variant="body2" color="text.secondary">
              <strong>{stats.total_images.toLocaleString()}</strong> images
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>{stats.total_tags.toLocaleString()}</strong> tags
            </Typography>
          </Stack>
        )}

        {/* Search bar */}
        <Box sx={{ maxWidth: 600, mx: 'auto' }}>
          <SearchBar
            value={searchValue}
            onChange={setSearchValue}
            onSearch={handleSearch}
          />
        </Box>
      </Box>

      {/* Results section */}
      <Box sx={{ p: 2 }}>
        {/* Query info */}
        {query ? (
          <Box sx={{ mb: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="body2" color="text.secondary">
                Searching:
              </Typography>
              {queryTags.map((tag, i) => (
                <Chip
                  key={i}
                  label={tag}
                  size="small"
                  color={tag.startsWith('-') ? 'error' : tag.startsWith('~') ? 'warning' : 'primary'}
                  variant="outlined"
                />
              ))}
              <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                ({totalCount.toLocaleString()} results)
              </Typography>
            </Stack>
          </Box>
        ) : !isLoading && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Showing all images ({totalCount.toLocaleString()} total)
            </Typography>
          </Box>
        )}

        <MasonryGallery
          images={images}
          hasMore={!!hasNextPage}
          isLoading={isLoading}
          isFetchingMore={isFetchingNextPage}
          onLoadMore={handleLoadMore}
          onNavigate={saveScrollPosition}
        />
      </Box>
    </Box>
  );
}
