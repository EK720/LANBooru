import type { SearchResult, ImageWithTags, Stats, Folder } from '../types/api';

const API_BASE = '/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Search
export async function searchImages(params: {
  q?: string;
  page?: number;
  limit?: number;
  sort?: string;
}): Promise<SearchResult> {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set('q', params.q);
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.sort) searchParams.set('sort', params.sort);

  return fetchJSON<SearchResult>(`${API_BASE}/search?${searchParams}`);
}

// Tag suggestions
export interface TagSuggestion {
  name: string;
  count: number;
}

export async function getTagSuggestions(prefix: string): Promise<TagSuggestion[]> {
  if (!prefix || prefix.length < 2) return [];
  const searchParams = new URLSearchParams({ q: prefix });
  return fetchJSON<TagSuggestion[]>(`${API_BASE}/search/tags/suggest?${searchParams}`);
}

// Single image
export async function getImage(id: number): Promise<ImageWithTags> {
  return fetchJSON<ImageWithTags>(`${API_BASE}/images/${id}`);
}

// Image URLs (not fetched, just constructed)
export function getThumbnailUrl(id: number, size?: number): string {
  const params = size ? `?size=${size}` : '';
  return `${API_BASE}/images/${id}/thumbnail${params}`;
}

export function getImageFileUrl(id: number): string {
  return `${API_BASE}/images/${id}/file`;
}

// Stats
export async function getStats(): Promise<Stats> {
  return fetchJSON<Stats>(`${API_BASE}/stats`);
}

// Folders (admin - localhost only)
export async function getFolders(): Promise<Folder[]> {
  return fetchJSON<Folder[]>(`${API_BASE}/folders`);
}

export async function addFolder(path: string, recursive: boolean = true): Promise<Folder> {
  return fetchJSON<Folder>(`${API_BASE}/folders`, {
    method: 'POST',
    body: JSON.stringify({ path, recursive }),
  });
}

export async function deleteFolder(id: number): Promise<void> {
  await fetch(`${API_BASE}/folders/${id}`, { method: 'DELETE' });
}

export async function updateFolder(
  id: number,
  updates: { recursive?: boolean; enabled?: boolean }
): Promise<Folder> {
  return fetchJSON<Folder>(`${API_BASE}/folders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function scanFolder(id: number): Promise<void> {
  await fetchJSON<{ message: string }>(`${API_BASE}/folders/${id}/scan`, {
    method: 'POST',
  });
}

// Calculate optimal thumbnail size based on viewport and columns
export function calculateThumbnailSize(columnWidth: number): number {
  const dpr = window.devicePixelRatio || 1;
  // Round up to nearest 50 for cache efficiency
  const idealSize = Math.ceil((columnWidth * dpr) / 50) * 50;
  // Clamp between 150 and 600
  return Math.max(150, Math.min(600, idealSize));
}
