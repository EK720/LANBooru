/**
 * LANBooru Plugin System Types
 *
 * Plugins are distributed as .lbplugin files (ZIP archives) containing:
 * - manifest.json: Plugin metadata and configuration
 * - hooks.js: Optional Node.js hooks (for builtin type)
 * - docker/: Optional Docker build context (for container type)
 */

import type { Image } from '../types';
import type { Application } from 'express';

// ============================================================================
// Configuration Schema Types
// ============================================================================

export type ConfigFieldType = 'string' | 'number' | 'boolean' | 'select' | 'password';

export interface ConfigFieldBase {
  key: string;
  label: string;
  description?: string;
  required?: boolean;
}

export interface ConfigFieldString extends ConfigFieldBase {
  type: 'string' | 'password';
  default?: string;
  placeholder?: string;
}

export interface ConfigFieldNumber extends ConfigFieldBase {
  type: 'number';
  default?: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface ConfigFieldBoolean extends ConfigFieldBase {
  type: 'boolean';
  default?: boolean;
}

export interface ConfigFieldSelect extends ConfigFieldBase {
  type: 'select';
  default?: string;
  options: Array<{ value: string; label: string }>;
}

export type ConfigField = ConfigFieldString | ConfigFieldNumber | ConfigFieldBoolean | ConfigFieldSelect;

// ============================================================================
// Plugin Manifest Types
// ============================================================================

export type PluginType = 'builtin' | 'container' | 'external';

export interface PluginButton {
  id: string;
  label: string;
  icon?: string; // Material icon name or URL
  tooltip?: string;
  location: 'image-toolbar' | 'image-sidebar' | 'gallery-toolbar' | 'header' | 'settings';
  endpoint: string; // Relative to /api/plugins/{pluginId}/
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  confirmMessage?: string; // Optional confirmation dialog
}

export interface PluginContainerConfig {
  image?: string; // Pre-built image to pull
  build?: string; // Path to Dockerfile directory within plugin
  ports?: string[]; // Port mappings (internal use)
  environment?: Record<string, string>; // Environment variables
  volumes?: string[]; // Volume mounts
  gpu?: boolean; // Request GPU access
  healthCheck?: {
    path: string;
    interval?: number; // seconds
    timeout?: number; // seconds
    retries?: number;
  };
}

export interface PluginApiConfig {
  baseUrl: string; // URL to proxy requests to
  healthCheck?: string; // Health check endpoint path
  timeout?: number; // Request timeout in ms
}

export interface PluginHooksConfig {
  backend?: string; // Path to hooks.js file
}

export interface PluginFrontendConfig {
  script?: string; // Path to frontend.js file for custom handlers
  buttons?: PluginButton[];
  settingsComponent?: string; // Future: custom settings UI
}

export interface PluginManifest {
  // Required fields
  id: string;
  name: string;
  version: string;
  description: string;
  type: PluginType;

  // Optional metadata
  author?: string;
  homepage?: string;
  license?: string;

  // Type-specific configuration
  container?: PluginContainerConfig; // Required for type: 'container'
  api?: PluginApiConfig; // Required for type: 'container' or 'external'
  hooks?: PluginHooksConfig; // Optional hooks

  // Frontend integration
  frontend?: PluginFrontendConfig;

  // User-configurable settings
  config?: ConfigField[];
}

// ============================================================================
// Runtime Types
// ============================================================================

export interface PluginConfig {
  [key: string]: string | number | boolean;
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  extractedPath: string; // Path to extracted plugin files
  enabled: boolean;
  config: PluginConfig; // Current configuration values
  status: PluginStatus;
  error?: string;
}

export type PluginStatus =
  | 'loading'
  | 'healthy'
  | 'unhealthy'
  | 'disabled'
  | 'error';

// ============================================================================
// Hook Types
// ============================================================================

export type HookName =
  | 'onImageScanned'
  | 'onBeforeTagUpdate'
  | 'onAfterTagUpdate'
  | 'onImageDeleted'
  | 'onRouteRegister';

/** Fields that can be updated via updateImage */
export interface ImageUpdates {
  tags?: string[];
  artist?: string;
  rating?: number;
  source?: string;
}

/** Database query helpers available to plugins */
export interface PluginDbHelpers {
  /** Execute a SELECT query and return results */
  query: <T = any>(sql: string, params?: any[]) => Promise<T[]>;
  /** Execute a SELECT query and return first result or null */
  queryOne: <T = any>(sql: string, params?: any[]) => Promise<T | null>;
}

export interface HookContext {
  pluginId: string;
  config: PluginConfig;
  /** Update an image's metadata (tags, artist, rating, source, etc.) */
  updateImage?: (imageId: number, updates: ImageUpdates) => Promise<void>;
  /** Database query helpers (read-only queries recommended) */
  db: PluginDbHelpers;
}

export type HookFunction<T extends any[] = any[], R = void> = (
  context: HookContext,
  ...args: T
) => Promise<R> | R;

// Side-effect hooks (no return value)
export type SideEffectHook<T extends any[] = any[]> = (
  context: HookContext,
  ...args: T
) => Promise<void> | void;

// Transform hooks (return modified value, chained through multiple plugins)
export type TransformHook<T, A extends any[] = any[]> = (
  context: HookContext,
  value: T,
  ...args: A
) => Promise<T> | T;

export interface PluginHooks {
  // Side-effect hooks
  onImageScanned?: SideEffectHook<[Image]>;
  onAfterTagUpdate?: SideEffectHook<[number, string[]]>;
  onImageDeleted?: SideEffectHook<[number]>;
  onRouteRegister?: SideEffectHook<[Application]>;

  // Transform hooks (value is first arg after context, return modified value)
  onBeforeTagUpdate?: TransformHook<string[], [number]>; // (ctx, tags, imageId) => tags
}

// ============================================================================
// API Response Types
// ============================================================================

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  type: PluginType;
  enabled: boolean;
  status: PluginStatus;
  hasScript: boolean;
  buttons: PluginButton[];
  config: ConfigField[];
  currentConfig: PluginConfig;
}

export interface PluginListResponse {
  plugins: PluginInfo[];
}

export interface PluginActionResponse {
  success: boolean;
  message?: string;
  data?: any;
}
