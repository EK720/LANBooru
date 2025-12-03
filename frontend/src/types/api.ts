export interface Image {
  id: number;
  file_path: string;
  filename: string;
  file_type: string;
  file_size: number;
  file_hash: string;
  width: number;
  height: number;
  artist?: string;
  rating?: number;
  source?: string;
  created_at: string;
  updated_at: string;
}

export interface ImageWithTags extends Image {
  tags: string[];
  duplicates?: DuplicateInfo;
}

export interface SearchResult {
  images: ImageWithTags[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface Stats {
  total_images: number;
  total_tags: number;
  total_folders: number;
  last_scan?: string;
  require_edit_password?: boolean;
}

export interface Folder {
  id: number;
  path: string;
  do_recurse: boolean;
  enabled: boolean;
  last_scanned_at?: string;
  created_at: string;
}

export interface DuplicateInfo {
  prime_id: number;
  is_prime: boolean;
  group?: number[];  // All image IDs in the duplicate group
}
