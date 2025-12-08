/**
 * Plugin API Client
 */

import type { PluginInfo, PluginListResponse, PluginConfig, PluginActionResponse } from './types';

const API_BASE = '/api/plugins';

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

/**
 * Get list of all plugins
 */
export async function getPlugins(): Promise<PluginInfo[]> {
  const result = await fetchJSON<PluginListResponse>(API_BASE);
  // Add pluginId to each button for easier routing
  return result.plugins.map(plugin => ({
    ...plugin,
    buttons: plugin.buttons.map(btn => ({ ...btn, pluginId: plugin.id })),
  }));
}

/**
 * Get a specific plugin
 */
export async function getPlugin(pluginId: string): Promise<PluginInfo> {
  const plugin = await fetchJSON<PluginInfo>(`${API_BASE}/${pluginId}`);
  return {
    ...plugin,
    buttons: plugin.buttons.map(btn => ({ ...btn, pluginId: plugin.id })),
  };
}

/**
 * Update plugin settings (enabled state and/or config)
 */
export async function updatePlugin(
  pluginId: string,
  updates: { enabled?: boolean; config?: PluginConfig }
): Promise<{ id: string; enabled: boolean; status: string; currentConfig: PluginConfig }> {
  return fetchJSON(`${API_BASE}/${pluginId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

/**
 * Call a plugin endpoint
 */
export async function callPluginEndpoint<T = PluginActionResponse>(
  pluginId: string,
  endpoint: string,
  method: string = 'POST',
  data?: any
): Promise<T> {
  return fetchJSON<T>(`${API_BASE}/${pluginId}/call/${endpoint}`, {
    method,
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * Trigger health check for a plugin
 */
export async function checkPluginHealth(pluginId: string): Promise<{ status: string; error?: string }> {
  return fetchJSON(`${API_BASE}/${pluginId}/health`, {
    method: 'POST',
  });
}
