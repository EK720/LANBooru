/**
 * Plugin Routes
 *
 * API endpoints for plugin management and proxying requests to plugin services.
 */

import { Router, Request, Response } from 'express';
import type { PluginRegistry } from './registry';
import type { PluginConfig } from './types';

export function createPluginRoutes(registry: PluginRegistry): Router {
  const router = Router();

  /**
   * GET /api/plugins
   * List all plugins with their status and frontend buttons
   */
  router.get('/', (req: Request, res: Response) => {
    const plugins = registry.getAll();
    res.json({ plugins });
  });

  /**
   * GET /api/plugins/:pluginId
   * Get details for a specific plugin
   */
  router.get('/:pluginId', (req: Request, res: Response) => {
    const { pluginId } = req.params;
    const plugin = registry.get(pluginId);

    if (!plugin) {
      res.status(404).json({ error: `Plugin not found: ${pluginId}` });
      return;
    }

    res.json({
      id: plugin.manifest.id,
      name: plugin.manifest.name,
      version: plugin.manifest.version,
      description: plugin.manifest.description,
      type: plugin.manifest.type,
      enabled: plugin.enabled,
      status: plugin.status,
      error: plugin.error,
      buttons: plugin.manifest.frontend?.buttons || [],
      config: plugin.manifest.config || [],
      currentConfig: plugin.config,
    });
  });

  /**
   * PATCH /api/plugins/:pluginId
   * Update plugin settings (enabled state and/or config)
   */
  router.patch('/:pluginId', async (req: Request, res: Response) => {
    const { pluginId } = req.params;
    const { enabled, config } = req.body as {
      enabled?: boolean;
      config?: PluginConfig;
    };

    const plugin = registry.get(pluginId);
    if (!plugin) {
      res.status(404).json({ error: `Plugin not found: ${pluginId}` });
      return;
    }

    if (enabled !== undefined) {
      await registry.setEnabled(pluginId, enabled);
    }

    if (config !== undefined) {
      registry.updateConfig(pluginId, config);
    }

    // Return updated plugin state
    const updated = registry.get(pluginId)!;
    res.json({
      id: updated.manifest.id,
      enabled: updated.enabled,
      status: updated.status,
      currentConfig: updated.config,
    });
  });

  /**
   * POST /api/plugins/:pluginId/health
   * Trigger a health check for a specific plugin
   */
  router.post('/:pluginId/health', async (req: Request, res: Response) => {
    const { pluginId } = req.params;
    const plugin = registry.get(pluginId);

    if (!plugin) {
      res.status(404).json({ error: `Plugin not found: ${pluginId}` });
      return;
    }

    // Run health check
    await registry.checkHealth();

    const updated = registry.get(pluginId)!;
    res.json({
      status: updated.status,
      error: updated.error,
    });
  });

  /**
   * ALL /api/plugins/:pluginId/call/*
   * Proxy requests to plugin services
   * The /call/ prefix distinguishes plugin API calls from management endpoints
   */
  router.all('/:pluginId/call/*', async (req: Request, res: Response) => {
    const { pluginId } = req.params;
    // Extract the path after /call/
    const subPath = req.params[0] || '';

    await registry.proxyRequest(pluginId, subPath, req, res);
  });

  return router;
}
