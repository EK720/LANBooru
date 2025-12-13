import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Typography, Stack, Chip } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import SearchBar from '../components/Search/SearchBar';
import MasonryGallery from '../components/Gallery/MasonryGallery';
import { useSearch } from '../hooks/useSearch';
import { useScrollRestore } from '../hooks/useScrollRestore';
import { useGalleryNavigation } from '../hooks/useGalleryNavigation';
import { getStats } from '../api/client';
import { usePlugins, PluginButton } from '../plugins';

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

  const { getButtonsForLocation } = usePlugins();

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
  const { saveNavigationContext } = useGalleryNavigation();

  // Save both scroll position and navigation context when clicking an image
  const handleNavigate = useCallback(() => {
    saveScrollPosition();
    saveNavigationContext(
      images.map(img => img.id),
      query,
      loadedPages,
      !!hasNextPage,
      sort
    );
  }, [saveScrollPosition, saveNavigationContext, images, query, loadedPages, hasNextPage, sort]);

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

  // Parse query into tokens for display (handles groups like {tag1 tag2})
  type TagWithPrefix = { name: string; prefix: string };
  type QueryToken = { type: 'tag'; value: string; prefix: string } | { type: 'group'; tags: TagWithPrefix[]; prefix: string };

  const parseQueryTokens = (q: string): QueryToken[] => {
    const tokens: QueryToken[] = [];
    let i = 0;

    while (i < q.length) {
      // Skip whitespace
      while (i < q.length && /\s/.test(q[i])) i++;
      if (i >= q.length) break;

      // Check for prefix (- or ~)
      let prefix = '';
      if (q[i] === '-' || q[i] === '~') {
        prefix = q[i];
        i++;
      }

      // Check for group
      if (q[i] === '{') {
        i++; // skip opening {
        const groupStart = i;
        // Handle nested braces by counting depth
        let depth = 1;
        while (i < q.length && depth > 0) {
          if (q[i] === '{') depth++;
          else if (q[i] === '}') depth--;
          if (depth > 0) i++;
        }
        const groupContent = q.slice(groupStart, i);
        i++; // skip closing }
        // Split on whitespace and parse each tag's prefix
        const rawTags = groupContent.split(/\s+/).filter(t => t && t !== '{' && t !== '}');
        const groupTags: TagWithPrefix[] = rawTags.map(t => {
          let tagPrefix = '';
          let tagName = t;
          // Extract prefix from individual tag
          if (t.startsWith('-') || t.startsWith('~')) {
            tagPrefix = t[0];
            tagName = t.slice(1);
          }
          return { name: tagName, prefix: tagPrefix };
        }).filter(t => t.name); // Filter out empty names
        if (groupTags.length > 0) {
          tokens.push({ type: 'group', tags: groupTags, prefix });
        }
      } else {
        // Regular tag
        const tagStart = i;
        while (i < q.length && !/\s/.test(q[i]) && q[i] !== '{' && q[i] !== '}') i++;
        const tag = q.slice(tagStart, i);
        if (tag) {
          tokens.push({ type: 'tag', value: tag, prefix });
        }
      }
    }

    return tokens;
  };

  const queryTokens = parseQueryTokens(query);

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
        {/* Results info row with plugin buttons */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          {/* Query info */}
          {query ? (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="body2" color="text.secondary">
                Searching:
              </Typography>
              {queryTokens.map((token, i) => {
                const getColor = (prefix: string) =>
                  prefix === '-' ? 'error' : prefix === '~' ? 'warning' : 'primary';

                if (token.type === 'group') {
                  return (
                    <Box
                      key={i}
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        border: 2,
                        borderColor: getColor(token.prefix) + '.main',
                        borderRadius: 2,
                        px: 0.75,
                        py: 0.25,
                        bgcolor: 'action.hover',
                      }}
                    >
                      {token.tags.map((tag, j) => (
                        <Chip
                          key={j}
                          label={tag.name}
                          size="small"
                          color={getColor(tag.prefix)}
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  );
                }

                return (
                  <Chip
                    key={i}
                    label={token.value}
                    size="small"
                    color={getColor(token.prefix)}
                    variant="outlined"
                  />
                );
              })}
              <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                ({totalCount.toLocaleString()} results)
              </Typography>
            </Stack>
          ) : !isLoading ? (
            <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
              Showing all images ({totalCount.toLocaleString()} total)
            </Typography>
          ) : (
            <Box /> /* Empty spacer while loading */
          )}

          {/* Gallery toolbar - plugin buttons (right-aligned) */}
          {getButtonsForLocation('gallery-toolbar').length > 0 && (
            <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="flex-end">
              {getButtonsForLocation('gallery-toolbar').map((btn) => (
                <PluginButton key={`${btn.pluginId}-${btn.id}`} button={btn} variant="outlined" />
              ))}
            </Stack>
          )}
        </Stack>

        <MasonryGallery
          images={images}
          hasMore={!!hasNextPage}
          isLoading={isLoading}
          isFetchingMore={isFetchingNextPage}
          onLoadMore={handleLoadMore}
          onNavigate={handleNavigate}
        />
      </Box>
    </Box>
  );
}
