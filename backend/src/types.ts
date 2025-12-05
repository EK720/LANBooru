export interface Image {
  id: number;
  file_path: string;
  filename: string;
  file_type: string;
  file_size: number;
  file_hash: string;
  content_hash_600?: string;
  content_hash_800?: string;
  content_hash_1400?: string;
  width: number;
  height: number;
  artist?: string;
  rating?: number;
  source?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Tag {
  id: number;
  name: string;
  count: number;
}

export interface ImageTag {
  image_id: number;
  tag_id: number;
}

export interface Folder {
  id: number;
  path: string;
  do_recurse: boolean;
  enabled: boolean;
  last_scanned_at?: Date;
  created_at: Date;
}

export interface SearchQuery {
  query: string;
  page?: number;
  limit?: number;
  sort?: 'date_asc' | 'date_desc' | 'random';
}

export interface SearchResult {
  images: ImageWithTags[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface DuplicateInfo {
  prime_id: number;
  is_prime: boolean;
  group?: number[];  // All image IDs in the duplicate group
}

export interface ImageWithTags extends Image {
  tags: string[];
  duplicates?: DuplicateInfo;
}

export interface ScanStats {
  total_images: number;
  total_tags: number;
  total_folders: number;
  last_scan?: Date;
}
