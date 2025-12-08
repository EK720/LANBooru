/**
 * Plugin Loader
 *
 * Scans for .lbplugin files (tar.gz archives), extracts them,
 * validates manifests, and loads plugins into the registry.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { PluginManifest, LoadedPlugin, PluginConfig, ConfigField } from './types';

const PLUGIN_EXTENSION = '.lbplugin';
const EXTRACTED_DIR = '.extracted';
const CONFIG_FILE = 'plugin-config.json';

export interface PluginLoaderOptions {
  pluginsDir: string;
}

export class PluginLoader {
  private pluginsDir: string;
  private extractedDir: string;
  private configPath: string;

  constructor(options: PluginLoaderOptions) {
    this.pluginsDir = options.pluginsDir;
    this.extractedDir = path.join(this.pluginsDir, EXTRACTED_DIR);
    this.configPath = path.join(this.pluginsDir, CONFIG_FILE);
  }

  /**
   * Initialize the plugins directory structure
   */
  async initialize(): Promise<void> {
    // Create plugins directory if it doesn't exist
    if (!fs.existsSync(this.pluginsDir)) {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
    }

    // Create extracted directory
    if (!fs.existsSync(this.extractedDir)) {
      fs.mkdirSync(this.extractedDir, { recursive: true });
    }

    // Create empty config file if it doesn't exist
    if (!fs.existsSync(this.configPath)) {
      fs.writeFileSync(this.configPath, JSON.stringify({}, null, 2));
    }
  }

  /**
   * Scan for and load all plugins
   */
  async loadAll(): Promise<LoadedPlugin[]> {
    await this.initialize();

    const plugins: LoadedPlugin[] = [];
    const savedConfig = this.loadSavedConfig();

    // Find all .lbplugin files
    const files = fs.readdirSync(this.pluginsDir)
      .filter(f => f.endsWith(PLUGIN_EXTENSION));

    for (const file of files) {
      try {
        const plugin = await this.loadPlugin(file, savedConfig);
        if (plugin) {
          plugins.push(plugin);
        }
      } catch (error) {
        console.error(`Failed to load plugin ${file}:`, error);
      }
    }

    return plugins;
  }

  /**
   * Load a single plugin from a .lbplugin file
   */
  private async loadPlugin(
    filename: string,
    savedConfig: Record<string, PluginConfig>
  ): Promise<LoadedPlugin | null> {
    const pluginPath = path.join(this.pluginsDir, filename);
    const pluginName = filename.replace(PLUGIN_EXTENSION, '');

    // Extract plugin
    const extractedPath = await this.extractPlugin(pluginPath, pluginName);
    if (!extractedPath) {
      return null;
    }

    // Load and validate manifest
    const manifest = await this.loadManifest(extractedPath);
    if (!manifest) {
      return null;
    }

    // Get plugin config (saved or defaults)
    const config = this.resolveConfig(manifest, savedConfig[manifest.id]);

    return {
      manifest,
      extractedPath,
      enabled: savedConfig[manifest.id]?.enabled !== false, // Default to enabled
      config,
      status: 'loading',
    };
  }

  /**
   * Extract a .lbplugin (tar.gz) archive
   * Only extracts if the folder doesn't exist or the archive is newer
   */
  private async extractPlugin(archivePath: string, name: string): Promise<string | null> {
    const targetDir = path.join(this.extractedDir, name);

    try {
      // Check if we need to extract
      if (fs.existsSync(targetDir)) {
        const archiveStat = fs.statSync(archivePath);
        const targetStat = fs.statSync(targetDir);

        // Only re-extract if archive is newer than extracted folder
        if (archiveStat.mtime <= targetStat.mtime) {
          return targetDir;
        }

        // Archive is newer, remove old extraction
        fs.rmSync(targetDir, { recursive: true });
      }

      fs.mkdirSync(targetDir, { recursive: true });

      // Extract using system tar (available on all Linux systems)
      execSync(`tar -xzf "${archivePath}" -C "${targetDir}"`, {
        stdio: 'pipe',
      });

      // Check if files were extracted into a subdirectory
      const contents = fs.readdirSync(targetDir);
      if (contents.length === 1 && fs.statSync(path.join(targetDir, contents[0])).isDirectory()) {
        // Move contents up one level
        const subdir = path.join(targetDir, contents[0]);
        const subContents = fs.readdirSync(subdir);
        for (const item of subContents) {
          fs.renameSync(path.join(subdir, item), path.join(targetDir, item));
        }
        fs.rmdirSync(subdir);
      }

      return targetDir;
    } catch (error) {
      console.error(`Failed to extract plugin ${name}:`, error);
      return null;
    }
  }

  /**
   * Load and validate a plugin manifest
   */
  private async loadManifest(extractedPath: string): Promise<PluginManifest | null> {
    const manifestPath = path.join(extractedPath, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      console.error(`No manifest.json found in ${extractedPath}`);
      return null;
    }

    try {
      const content = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(content) as PluginManifest;

      // Validate required fields
      if (!manifest.id || !manifest.name || !manifest.version || !manifest.type) {
        console.error(`Invalid manifest in ${extractedPath}: missing required fields`);
        return null;
      }

      // Validate type
      if (!['builtin', 'container', 'external'].includes(manifest.type)) {
        console.error(`Invalid plugin type: ${manifest.type}`);
        return null;
      }

      // Validate type-specific requirements
      if (manifest.type === 'container' && !manifest.container) {
        console.error(`Container plugin ${manifest.id} missing container config`);
        return null;
      }

      if ((manifest.type === 'container' || manifest.type === 'external') && !manifest.api) {
        console.error(`Plugin ${manifest.id} of type ${manifest.type} missing api config`);
        return null;
      }

      return manifest;
    } catch (error) {
      console.error(`Failed to parse manifest in ${extractedPath}:`, error);
      return null;
    }
  }

  /**
   * Resolve plugin configuration from saved values and defaults
   */
  private resolveConfig(manifest: PluginManifest, saved?: PluginConfig): PluginConfig {
    const config: PluginConfig = {};

    if (manifest.config) {
      for (const field of manifest.config) {
        // Use saved value if available, otherwise use default
        if (saved && saved[field.key] !== undefined) {
          config[field.key] = saved[field.key];
        } else if ('default' in field && field.default !== undefined) {
          config[field.key] = field.default;
        }
      }
    }

    return config;
  }

  /**
   * Load saved plugin configurations
   */
  private loadSavedConfig(): Record<string, PluginConfig & { enabled?: boolean }> {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Failed to load plugin config:', error);
    }
    return {};
  }

  /**
   * Save plugin configuration
   */
  saveConfig(pluginId: string, config: PluginConfig, enabled: boolean): void {
    const allConfig = this.loadSavedConfig();
    allConfig[pluginId] = { ...config, enabled };
    fs.writeFileSync(this.configPath, JSON.stringify(allConfig, null, 2));
  }

  /**
   * Get the path to the plugins directory
   */
  getPluginsDir(): string {
    return this.pluginsDir;
  }

  /**
   * Get the path to an extracted plugin
   */
  getExtractedPath(pluginId: string): string | null {
    // Find the plugin file
    const files = fs.readdirSync(this.pluginsDir)
      .filter(f => f.endsWith(PLUGIN_EXTENSION));

    for (const file of files) {
      const extractedPath = path.join(this.extractedDir, file.replace(PLUGIN_EXTENSION, ''));
      const manifestPath = path.join(extractedPath, 'manifest.json');

      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          if (manifest.id === pluginId) {
            return extractedPath;
          }
        } catch {
          // Skip invalid manifests
        }
      }
    }

    return null;
  }
}
