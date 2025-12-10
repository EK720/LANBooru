/**
 * Frontend Plugin Types
 *
 * These types mirror the backend types for plugin information
 * received from the /api/plugins endpoint.
 */

import type { ImageWithTags } from '../types/api';

export type PluginType = 'builtin' | 'container' | 'external';
export type PluginStatus = 'loading' | 'healthy' | 'unhealthy' | 'disabled' | 'error';

export interface PluginButton {
  id: string;
  label: string;
  icon?: string;
  tooltip?: string;
  location: 'image-actions' | 'gallery-toolbar' | 'header' | 'settings';
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  confirmMessage?: string;
  pluginId: string; // Added by frontend for routing
}

export interface ConfigField {
  key: string;
  label: string;
  description?: string;
  required?: boolean;
  type: 'string' | 'password' | 'number' | 'boolean' | 'select';
  default?: string | number | boolean;
  // For number type
  min?: number;
  max?: number;
  step?: number;
  // For select type
  options?: Array<{ value: string; label: string }>;
  // For string type
  placeholder?: string;
}

export interface PluginConfig {
  [key: string]: string | number | boolean;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  type: PluginType;
  enabled: boolean;
  status: PluginStatus;
  hasScript: boolean; // Whether plugin has a frontend script
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

/**
 * API object passed to plugin handlers.
 * Provides access to common frontend operations.
 */
export interface PluginAPI {
  // Tag editing - opens editor with specified tags
  openTagEditor: (tags: string[], mode?: 'append' | 'replace') => void;

  // Notifications
  showMessage: (message: string, severity?: 'success' | 'error' | 'warning' | 'info') => void;

  // Data refresh - refetch current image data
  refreshImage: () => void;

  // Navigation
  navigate: (path: string) => void;

  // Current image info (null if not on an image page)
  getImage: () => ImageWithTags | null;
}

/**
 * Plugin handler function signature.
 * Called when a plugin button action completes.
 */
export type PluginSuccessHandler = (
  response: PluginActionResponse,
  api: PluginAPI
) => void | Promise<void>;

export type PluginErrorHandler = (
  error: Error,
  api: PluginAPI
) => void | Promise<void>;

/**
 * Plugin script module interface.
 * What a plugin's frontend.js should export.
 */
export interface PluginModule {
  // Called when any button action succeeds (if no specific handler)
  onSuccess?: PluginSuccessHandler;

  // Called when any button action fails
  onError?: PluginErrorHandler;

  // Per-button handlers (keyed by button id)
  handlers?: Record<string, PluginSuccessHandler>;
}
