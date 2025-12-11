/**
 * Plugin Registry
 *
 * Manages loaded plugins, executes hooks, and proxies requests to plugin services.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Request, Response, Application } from 'express';
import type {
  LoadedPlugin,
  PluginConfig,
  PluginButton,
  PluginInfo,
  HookName,
  HookContext,
  PluginHooks,
  ImageUpdates,
} from './types';
import { PluginLoader } from './loader';
import {
  isDockerAvailable,
  buildPluginImage,
  startPluginContainer,
  stopPluginContainer,
  getContainerStatus,
  getBackendVolumeMounts,
} from './container';
import { query, execute } from '../database/connection';
import { addTagsToImage, removeTagsFromImage } from '../services/scanner';

export class PluginRegistry {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private hooks: Map<HookName, Array<{ pluginId: string; fn: Function }>> = new Map();
  private loader: PluginLoader;
  private dockerAvailable: boolean = false;
  private volumeMounts: string[] = [];

  constructor(loader: PluginLoader) {
    this.loader = loader;
  }

  /**
   * Load all plugins from the plugins directory
   */
  async loadPlugins(): Promise<void> {
    // Check Docker availability for container plugins
    this.dockerAvailable = isDockerAvailable();
    if (this.dockerAvailable) {
      console.log('Docker is available - container plugins will be supported');
      this.volumeMounts = getBackendVolumeMounts();
      if (this.volumeMounts.length > 0) {
        console.log(`  Volume mounts to pass to plugins: ${this.volumeMounts.length}`);
      }
    } else {
      console.log('Docker is not available - container plugins will not work');
    }

    const loaded = await this.loader.loadAll();

    for (const plugin of loaded) {
      this.plugins.set(plugin.manifest.id, plugin);

      // Load hooks if plugin has them
      if (plugin.manifest.hooks?.backend && plugin.enabled) {
        await this.loadPluginHooks(plugin);
      }

      // Update status based on plugin type
      if (!plugin.enabled) {
        plugin.status = 'disabled';
      } else if (plugin.manifest.type === 'builtin') {
        // Builtin plugins are healthy if hooks loaded without error
        plugin.status = plugin.status === 'error' ? 'error' : 'healthy';
      } else if (plugin.manifest.type === 'container') {
        // Container plugins need to be built and started
        plugin.status = 'loading';
        if (this.dockerAvailable) {
          await this.startContainerPlugin(plugin);
        } else {
          plugin.status = 'error';
          plugin.error = 'Docker is not available';
        }
      } else {
        // External plugins just need health check
        plugin.status = 'loading';
      }
    }

    console.log(`Loaded ${this.plugins.size} plugin(s)`);
  }

  /**
   * Build and start a container plugin
   */
  private async startContainerPlugin(plugin: LoadedPlugin): Promise<void> {
    const pluginId = plugin.manifest.id;

    // Check if container is already running
    const status = getContainerStatus(pluginId);
    if (status.running) {
      console.log(`Container for plugin ${pluginId} is already running`);
      plugin.status = 'loading'; // Will be updated by health check
      return;
    }

    // Build the image if using local build
    if (plugin.manifest.container?.build) {
      console.log(`Building container for plugin ${pluginId}...`);
      const buildSuccess = await buildPluginImage(plugin);
      if (!buildSuccess) {
        plugin.status = 'error';
        plugin.error = 'Failed to build Docker image';
        return;
      }
    }

    // Start the container
    console.log(`Starting container for plugin ${pluginId}...`);
    const startSuccess = await startPluginContainer(plugin, this.volumeMounts);
    if (!startSuccess) {
      plugin.status = 'error';
      plugin.error = 'Failed to start Docker container';
      return;
    }

    // Container started, health check will update status
    plugin.status = 'loading';
  }

  /**
   * Load hooks from a plugin's hooks.js file
   */
  private async loadPluginHooks(plugin: LoadedPlugin): Promise<void> {
    const hooksPath = path.join(
      plugin.extractedPath,
      plugin.manifest.hooks!.backend!
    );

    if (!fs.existsSync(hooksPath)) {
      console.warn(`Hooks file not found for plugin ${plugin.manifest.id}: ${hooksPath}`);
      return;
    }

    try {
      // Dynamic import of the hooks module
      const hooksModule = require(hooksPath) as PluginHooks;

      const hookNames: HookName[] = [
        'onImageScanned',
        'onBeforeTagUpdate',
        'onAfterTagUpdate',
        'onImageDeleted',
        'onRouteRegister',
      ];

      for (const hookName of hookNames) {
        if (typeof hooksModule[hookName] === 'function') {
          this.registerHook(hookName, plugin.manifest.id, hooksModule[hookName]!);
        }
      }
    } catch (error) {
      console.error(`Failed to load hooks for plugin ${plugin.manifest.id}:`, error);
      plugin.status = 'error';
      plugin.error = `Failed to load hooks: ${error}`;
    }
  }

  /**
   * Register a hook function for a plugin
   */
  private registerHook(hookName: HookName, pluginId: string, fn: Function): void {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }
    this.hooks.get(hookName)!.push({ pluginId, fn });
  }

  /**
   * Update an image's metadata. Available to plugins via HookContext.
   */
  private async updateImage(imageId: number, updates: ImageUpdates): Promise<void> {
    // Handle tag updates
    if (updates.tags !== undefined) {
      // Normalize tags
      const newTags = [...new Set(
        updates.tags.map(t => String(t).trim().toLowerCase()).filter(t => t.length > 0)
      )];
      const newTagSet = new Set(newTags);

      // Get existing tags
      const existingTagRows = await query<{ name: string }>(
        `SELECT t.name FROM tags t
         JOIN image_tags it ON t.id = it.tag_id
         WHERE it.image_id = ?`,
        [imageId]
      );
      const existingTags = new Set(existingTagRows.map(t => t.name));

      // Compute diff and apply
      const tagsToAdd = newTags.filter(t => !existingTags.has(t));
      const tagsToRemove = [...existingTags].filter(t => !newTagSet.has(t));

      if (tagsToAdd.length > 0) {
        await addTagsToImage(imageId, tagsToAdd);
      }
      if (tagsToRemove.length > 0) {
        await removeTagsFromImage(imageId, tagsToRemove);
      }
    }

    // Handle simple field updates
    const fieldUpdates: string[] = [];
    const fieldValues: any[] = [];

    if (updates.artist !== undefined) {
      fieldUpdates.push('artist = ?');
      fieldValues.push(updates.artist);
    }
    if (updates.rating !== undefined) {
      fieldUpdates.push('rating = ?');
      fieldValues.push(updates.rating);
    }
    if (updates.source !== undefined) {
      fieldUpdates.push('source = ?');
      fieldValues.push(updates.source);
    }

    if (fieldUpdates.length > 0) {
      fieldUpdates.push('updated_at = NOW()');
      fieldValues.push(imageId);
      await execute(
        `UPDATE images SET ${fieldUpdates.join(', ')} WHERE id = ?`,
        fieldValues
      );
    }
  }

  /**
   * Run all registered hooks for an event (side-effects only, no return value).
   * Use this for: onImageScanned, onAfterTagUpdate, onImageDeleted, onRouteRegister
   */
  async runHook(hookName: HookName, ...args: any[]): Promise<void> {
    const handlers = this.hooks.get(hookName) || [];

    for (const { pluginId, fn } of handlers) {
      const plugin = this.plugins.get(pluginId);
      if (!plugin || !plugin.enabled || plugin.status === 'error') {
        continue;
      }

      const context: HookContext = {
        pluginId,
        config: plugin.config,
        updateImage: this.updateImage.bind(this),
      };

      try {
        await fn(context, ...args);
      } catch (error) {
        console.error(`Hook ${hookName} failed for plugin ${pluginId}:`, error);
      }
    }
  }

  /**
   * Run transform hooks where each hook's output becomes the next hook's input.
   * Use this for: onBeforeTagUpdate
   *
   * @param hookName - The hook to execute
   * @param initialValue - The starting value to transform
   * @param args - Additional arguments passed to each hook (after context and value)
   * @returns The final transformed value after all hooks have run
   */
  async runTransformHook<T>(
    hookName: HookName,
    initialValue: T,
    ...args: any[]
  ): Promise<T> {
    const handlers = this.hooks.get(hookName) || [];
    let value = initialValue;

    for (const { pluginId, fn } of handlers) {
      const plugin = this.plugins.get(pluginId);
      if (!plugin || !plugin.enabled || plugin.status === 'error') {
        continue;
      }

      const context: HookContext = {
        pluginId,
        config: plugin.config,
        updateImage: this.updateImage.bind(this),
      };

      try {
        const result = await fn(context, value, ...args);
        // Only update value if hook returned something
        if (result !== undefined) {
          value = result;
        }
      } catch (error) {
        console.error(`Hook ${hookName} failed for plugin ${pluginId}:`, error);
      }
    }

    return value;
  }

  /**
   * Proxy a request to a plugin's service
   */
  async proxyRequest(
    pluginId: string,
    subPath: string,
    req: Request,
    res: Response
  ): Promise<void> {
    const plugin = this.plugins.get(pluginId);

    if (!plugin) {
      res.status(404).json({ error: `Plugin not found: ${pluginId}` });
      return;
    }

    if (!plugin.enabled) {
      res.status(503).json({ error: `Plugin disabled: ${pluginId}` });
      return;
    }

    if (!plugin.manifest.api) {
      res.status(400).json({ error: `Plugin ${pluginId} has no API endpoint` });
      return;
    }

    const targetUrl = `${plugin.manifest.api.baseUrl}/${subPath}`;
    const timeout = plugin.manifest.api.timeout || 30000;

    try {
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          // Pass through plugin config as headers
          'X-Plugin-Config': JSON.stringify(plugin.config),
        },
        body: ['POST', 'PUT', 'PATCH'].includes(req.method)
          ? JSON.stringify(req.body)
          : undefined,
        signal: AbortSignal.timeout(timeout),
      });

      // Forward status and headers
      res.status(response.status);

      // Forward response body
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const data = await response.json();
        res.json(data);
      } else {
        const text = await response.text();
        res.send(text);
      }
    } catch (error: any) {
      console.error(`Proxy request to ${pluginId} failed:`, error);

      if (error.name === 'TimeoutError') {
        res.status(504).json({ error: 'Plugin request timed out' });
      } else {
        res.status(502).json({ error: `Plugin request failed: ${error.message}` });
      }
    }
  }

  /**
   * Get all plugins as PluginInfo for API responses
   */
  getAll(): PluginInfo[] {
    return Array.from(this.plugins.values()).map(p => ({
      id: p.manifest.id,
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description,
      type: p.manifest.type,
      enabled: p.enabled,
      status: p.status,
      hasScript: !!p.manifest.frontend?.script,
      buttons: p.manifest.frontend?.buttons || [],
      config: p.manifest.config || [],
      currentConfig: p.config,
    }));
  }

  /**
   * Get a specific plugin
   */
  get(pluginId: string): LoadedPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Get buttons for a specific location
   */
  getButtonsForLocation(location: string): Array<PluginButton & { pluginId: string }> {
    const buttons: Array<PluginButton & { pluginId: string }> = [];

    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled || plugin.status === 'error' || plugin.status === 'disabled') {
        continue;
      }

      const pluginButtons = plugin.manifest.frontend?.buttons || [];
      for (const button of pluginButtons) {
        if (button.location === location) {
          buttons.push({ ...button, pluginId: plugin.manifest.id });
        }
      }
    }

    return buttons;
  }

  /**
   * Enable or disable a plugin
   */
  async setEnabled(pluginId: string, enabled: boolean): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return false;
    }

    plugin.enabled = enabled;
    this.loader.saveConfig(pluginId, plugin.config, enabled);

    // Handle container plugins
    if (plugin.manifest.type === 'container' && this.dockerAvailable) {
      if (enabled) {
        await this.startContainerPlugin(plugin);
      } else {
        await stopPluginContainer(pluginId);
        plugin.status = 'disabled';
      }
    } else {
      plugin.status = enabled ? 'healthy' : 'disabled';
    }

    return true;
  }

  /**
   * Update plugin configuration
   */
  updateConfig(pluginId: string, config: PluginConfig): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return false;
    }

    plugin.config = { ...plugin.config, ...config };
    this.loader.saveConfig(pluginId, plugin.config, plugin.enabled);

    return true;
  }

  /**
   * Check health of all plugin services (container/external only)
   */
  async checkHealth(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      // Skip disabled plugins and builtin plugins (no health check needed)
      if (!plugin.enabled || plugin.manifest.type === 'builtin') {
        continue;
      }

      // Skip if no health check endpoint configured
      if (!plugin.manifest.api?.healthCheck) {
        // No health check = assume healthy
        plugin.status = 'healthy';
        continue;
      }

      const healthUrl = `${plugin.manifest.api.baseUrl}${plugin.manifest.api.healthCheck}`;

      try {
        const response = await fetch(healthUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });

        plugin.status = response.ok ? 'healthy' : 'unhealthy';
        if (!response.ok) {
          plugin.error = `Health check returned ${response.status}`;
        } else {
          delete plugin.error;
        }
      } catch (error: any) {
        plugin.status = 'unhealthy';
        plugin.error = `Health check failed: ${error.message}`;
      }
    }
  }

  /**
   * Register custom routes from plugins
   */
  async registerRoutes(app: Application): Promise<void> {
    await this.runHook('onRouteRegister', app);
  }

  /**
   * Shutdown all container plugins
   */
  async shutdown(): Promise<void> {
    const containerPlugins = [...this.plugins.values()].filter(
      p => p.manifest.type === 'container' && p.enabled
    );

    if (containerPlugins.length === 0) {
      return;
    }

    console.log('Stopping plugin containers...');
    for (const plugin of containerPlugins) {
      console.log(`  Stopping ${plugin.manifest.id}...`);
      await stopPluginContainer(plugin.manifest.id);
    }
  }
}
