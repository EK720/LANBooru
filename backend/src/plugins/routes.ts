/**
 * Plugin Routes
 *
 * API endpoints for plugin management and proxying requests to plugin services.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Router, Request, Response, NextFunction, Application } from 'express';
import multer from 'multer';
import type { PluginRegistry } from './registry';
import type { PluginConfig } from './types';
import { localhostOnly } from '../middleware/security';

// Max plugin upload size in MB (default 500MB for AI model support)
const MAX_PLUGIN_SIZE_MB = parseInt(process.env.MAX_PLUGIN_SIZE_MB || '500', 10);

export function createPluginRoutes(registry: PluginRegistry, pluginsDir: string, app: Application): Router {
  const router = Router();

  // Configure multer for plugin uploads
  const storage = multer.diskStorage({
    destination: pluginsDir,
    filename: (req, file, cb) => {
      // Keep original filename but sanitize it
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, safeName);
    },
  });

  const upload = multer({
    storage,
    limits: {
      fileSize: MAX_PLUGIN_SIZE_MB * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
      if (file.originalname.endsWith('.lbplugin')) {
        cb(null, true);
      } else {
        cb(new Error('Only .lbplugin files are allowed'));
      }
    },
  });

  /**
   * GET /api/plugins
   * List all plugins with their status and frontend buttons
   */
  router.get('/', async (req: Request, res: Response) => {
    // Refresh health status before returning
    await registry.checkHealth();
    const plugins = registry.getAll();
    res.json({ plugins });
  });

  /**
   * POST /api/plugins/upload
   * Upload and install a new plugin
   * Localhost only - prevents remote installation
   */
  router.post('/upload', localhostOnly, upload.single('plugin'), async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'No plugin file uploaded' });
      return;
    }

    const result = await registry.install(req.file.path, app);

    if (!result.success) {
      // Clean up the uploaded file on failure
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        // Ignore cleanup errors
      }
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      plugin: result.plugin,
    });
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
   * Localhost only - prevents remote configuration changes
   */
  router.patch('/:pluginId', localhostOnly, async (req: Request, res: Response) => {
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
   * DELETE /api/plugins/:pluginId
   * Uninstall a plugin completely
   * Localhost only - prevents remote uninstallation
   */
  router.delete('/:pluginId', localhostOnly, async (req: Request, res: Response) => {
    const { pluginId } = req.params;

    const result = await registry.uninstall(pluginId);

    if (!result.success) {
      res.status(404).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      message: `Plugin ${pluginId} uninstalled`,
      ...(result.error && { warning: result.error }),
    });
  });

  /**
   * GET /api/plugins/:pluginId/health
   * Trigger a health check for a specific plugin
   */
  router.get('/:pluginId/health', async (req: Request, res: Response) => {
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
   * GET /api/plugins/:pluginId/script
   * Serve the plugin's frontend script, if it has one
   */
  router.get('/:pluginId/script', (req: Request, res: Response) => {
    const { pluginId } = req.params;
    const plugin = registry.get(pluginId);

    if (!plugin) {
      res.status(404).json({ error: `Plugin not found: ${pluginId}` });
      return;
    }

    const scriptPath = plugin.manifest.frontend?.script;
    if (!scriptPath) {
      res.status(204).send();
      return;
    }

    // Resolve and validate path
    const fullPath = path.resolve(plugin.extractedPath, scriptPath);
    if (!fullPath.startsWith(plugin.extractedPath)) {
      res.status(400).json({ error: 'Invalid script path' });
      return;
    }

    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: `Frontend script not found: ${scriptPath}` });
      return;
    }

    res.type('application/javascript');
    res.sendFile(fullPath);
  });

  /**
   * ALL /api/plugins/:pluginId/call/*
   * Proxy requests to plugin services (container/external) or
   * fall through to routes registered by builtin plugins
   * The /call/ prefix distinguishes plugin API calls from management endpoints
   */
  router.all('/:pluginId/call/*', async (req: Request, res: Response, next: NextFunction) => {
    const { pluginId } = req.params;
    const plugin = registry.get(pluginId);

    // For builtin plugins, inject fresh config and let Express continue to routes they registered via onRouteRegister
    if (plugin?.manifest.type === 'builtin') {
      req.headers['x-plugin-config'] = JSON.stringify(plugin.config);
      return next();
    }

    // For container/external plugins, proxy the request
    const subPath = req.params[0] || '';
    await registry.proxyRequest(pluginId, subPath, req, res);
  });

  return router;
}
