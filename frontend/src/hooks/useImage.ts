import { useQuery } from '@tanstack/react-query';
import { getImage } from '../api/client';

export function useImage(id: number | undefined) {
  return useQuery({
    queryKey: ['image', id],
    queryFn: () => getImage(id!),
    enabled: id !== undefined,
    staleTime: 60000,
  });
}
