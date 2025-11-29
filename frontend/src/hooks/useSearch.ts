import { useInfiniteQuery } from '@tanstack/react-query';
import { searchImages } from '../api/client';
import { config } from '../config';

export function useSearch(query: string, sort?: string) {
  return useInfiniteQuery({
    queryKey: ['search', query, sort],
    queryFn: ({ pageParam = 1 }) =>
      searchImages({
        q: query,
        page: pageParam,
        limit: config.imagesPerPage,
        sort,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    staleTime: 60000, // Cache for 1 minute
  });
}
