/**
 * Frontend Plugin Types
 *
 * These types mirror the backend types for plugin information
 * received from the /api/plugins endpoint.
 */

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
