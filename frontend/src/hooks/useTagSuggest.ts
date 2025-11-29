import { useQuery } from '@tanstack/react-query';
import { getTagSuggestions } from '../api/client';

export function useTagSuggestions(prefix: string) {
  return useQuery({
    queryKey: ['tagSuggestions', prefix],
    queryFn: () => getTagSuggestions(prefix),
    enabled: prefix.length >= 2,
    staleTime: 30000, // Cache suggestions for 30s
  });
}
