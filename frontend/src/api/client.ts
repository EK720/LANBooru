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

// Tags
export interface TagSuggestion {
  name: string;
  count: number;
}

export interface TagsResult {
  tags: TagSuggestion[];
  total: number;
  page: number;
  totalPages: number;
}

export async function getTags(params: {
  q?: string;
  page?: number;
  limit?: number;
}): Promise<TagsResult> {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set('q', params.q);
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());

  return fetchJSON<TagsResult>(`${API_BASE}/search/tags?${searchParams}`);
}

// Tag suggestions for autocomplete (uses tags endpoint)
export async function getTagSuggestions(prefix: string): Promise<TagSuggestion[]> {
  if (!prefix || prefix.length < 2) return [];
  const result = await getTags({ q: prefix, limit: 20 });
  return result.tags;
}

// Single image
export async function getImage(id: number): Promise<ImageWithTags> {
  return fetchJSON<ImageWithTags>(`${API_BASE}/image/${id}`);
}

// Image URLs (not fetched, just constructed)
export function getThumbnailUrl(id: number, size?: number): string {
  const params = size ? `?size=${size}` : '';
  return `${API_BASE}/image/${id}/thumbnail${params}`;
}

export function getImageFileUrl(id: number): string {
  return `${API_BASE}/image/${id}/file`;
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
    body: JSON.stringify({ path, do_recurse: recursive }),
  });
}

export async function deleteFolder(id: number): Promise<void> {
  await fetch(`${API_BASE}/folders/${id}`, { method: 'DELETE' });
}

export async function updateFolder(
  id: number,
  updates: { do_recurse?: boolean; enabled?: boolean }
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

// Edit password management
let editPassword: string | null = null;

export function setEditPassword(password: string) {
  editPassword = password;
  sessionStorage.setItem('edit-password', password);
}

export function getEditPassword(): string | null {
  if (!editPassword) {
    editPassword = sessionStorage.getItem('edit-password');
  }
  return editPassword;
}

export function clearEditPassword() {
  editPassword = null;
  sessionStorage.removeItem('edit-password');
}

// Update image metadata (tags and/or rating) - uses unified endpoint
export interface UpdateImageParams {
  tags?: string[];
  rating?: number | null;
}

export interface UpdateImageResult {
  success: boolean;
  tags?: string[];
  rating?: number | null;
}

export async function updateImage(id: number, updates: UpdateImageParams): Promise<UpdateImageResult> {
  const password = getEditPassword();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (password) {
    headers['X-Edit-Password'] = password;
  }

  const response = await fetch(`${API_BASE}/image/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updates),
  });

  if (response.status === 401) {
    clearEditPassword();
    throw new Error('Invalid password');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Convenience wrappers for updating just tags or just rating
export async function updateImageTags(id: number, tags: string[]): Promise<{ success: boolean; tags: string[] }> {
  const result = await updateImage(id, { tags });
  return { success: result.success, tags: result.tags || [] };
}

export async function updateImageRating(id: number, rating: number | null): Promise<{ success: boolean; rating: number | null }> {
  const result = await updateImage(id, { rating });
  return { success: result.success, rating: result.rating ?? null };
}

// Delete image (may require edit password depending on server config)
export async function deleteImageById(id: number, deleteFile: boolean = true): Promise<{ success: boolean; fileDeleted: boolean }> {
  const password = getEditPassword();

  const headers: Record<string, string> = {};
  if (password) {
    headers['X-Edit-Password'] = password;
  }

  const response = await fetch(`${API_BASE}/image/${id}?deleteFile=${deleteFile}`, {
    method: 'DELETE',
    headers,
  });

  if (response.status === 401) {
    clearEditPassword();
    throw new Error('Invalid password');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Calculate optimal thumbnail size based on viewport and columns
export function calculateThumbnailSize(columnWidth: number): number {
  const dpr = window.devicePixelRatio || 1;
  // Round up to nearest 50 for cache efficiency
  const idealSize = Math.ceil((columnWidth * dpr) / 50) * 50;
  // Clamp between 150 and 600
  return Math.max(150, Math.min(600, idealSize));
}
