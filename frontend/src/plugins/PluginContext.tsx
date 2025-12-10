/**
 * Plugin Context
 *
 * Provides plugin state, actions, and the plugin API to the React component tree.
 * Handles loading and executing plugin frontend scripts.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  PluginInfo,
  PluginButton,
  PluginConfig,
  PluginModule,
  PluginAPI,
  PluginActionResponse,
} from './types';
import type { ImageWithTags } from '../types/api';
import { getPlugins, updatePlugin, callPluginEndpoint } from './api';

// API base for loading scripts
const API_BASE = '/api/plugins';

interface PluginContextValue {
  plugins: PluginInfo[];
  isLoading: boolean;
  error: string | null;
  getButtonsForLocation: (location: string) => PluginButton[];
  callEndpoint: <T = any>(pluginId: string, endpoint: string, method?: string, data?: any) => Promise<T>;
  setPluginEnabled: (pluginId: string, enabled: boolean) => Promise<void>;
  updatePluginConfig: (pluginId: string, config: PluginConfig) => Promise<void>;
  refreshPlugins: () => Promise<void>;

  // Plugin handler invocation
  invokeHandler: (
    pluginId: string,
    buttonId: string,
    response: PluginActionResponse
  ) => Promise<void>;

  // API callbacks - set by components that can handle these actions
  setTagEditorCallback: (cb: ((tags: string[], mode: 'append' | 'replace') => void) | null) => void;
  setMessageCallback: (cb: ((message: string, severity: 'success' | 'error' | 'warning' | 'info') => void) | null) => void;
  setCurrentImage: (image: ImageWithTags | null) => void;
  setRefreshImageCallback: (cb: (() => void) | null) => void;
}

const PluginContext = createContext<PluginContextValue | null>(null);

interface PluginProviderProps {
  children: ReactNode;
}

export function PluginProvider({ children }: PluginProviderProps) {
  const queryClient = useQueryClient();

  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Loaded plugin modules (keyed by plugin ID)
  const pluginModules = useRef<Map<string, PluginModule>>(new Map());

  // Callbacks set by components
  const tagEditorCallback = useRef<((tags: string[], mode: 'append' | 'replace') => void) | null>(null);
  const messageCallback = useRef<((message: string, severity: 'success' | 'error' | 'warning' | 'info') => void) | null>(null);
  const currentImage = useRef<ImageWithTags | null>(null);
  const refreshImageCallback = useRef<(() => void) | null>(null);

  // Build the API object for plugins
  const buildPluginAPI = useCallback((): PluginAPI => {
    return {
      openTagEditor: (tags: string[], mode: 'append' | 'replace' = 'append') => {
        if (tagEditorCallback.current) {
          tagEditorCallback.current(tags, mode);
        } else {
          console.warn('openTagEditor called but no tag editor is available');
        }
      },

      showMessage: (message: string, severity: 'success' | 'error' | 'warning' | 'info' = 'info') => {
        if (messageCallback.current) {
          messageCallback.current(message, severity);
        } else {
          // Fallback to console
          console.log(`[Plugin ${severity}] ${message}`);
        }
      },

      refreshImage: () => {
        if (refreshImageCallback.current) {
          refreshImageCallback.current();
        } else if (currentImage.current) {
          // Fallback: invalidate query cache
          queryClient.invalidateQueries({ queryKey: ['image', currentImage.current.id] });
        }
      },

      navigate: (path: string) => {
        // Use window.location for navigation to avoid Router dependency
        window.location.href = path;
      },

      getImage: () => currentImage.current,
    };
  }, [queryClient]);

  // Load a plugin's frontend script
  const loadPluginScript = useCallback(async (pluginId: string): Promise<PluginModule | null> => {
    try {
      const response = await fetch(`${API_BASE}/${pluginId}/script`);

      // 204 = no script (valid)
      if (response.status === 204) {
        return null;
      }

      if (!response.ok) {
        console.error(`Failed to load script for plugin ${pluginId}: ${response.status}`);
        return null;
      }

      const scriptText = await response.text();

      // Create a module from the script text
      // The script should assign to module.exports or export default
      const moduleWrapper = new Function('module', 'exports', scriptText);
      const module: { exports: PluginModule } = { exports: {} as PluginModule };
      moduleWrapper(module, module.exports);

      return module.exports;
    } catch (err) {
      console.error(`Error loading script for plugin ${pluginId}:`, err);
      return null;
    }
  }, []);

  const loadPlugins = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const loaded = await getPlugins();

      // Load frontend scripts for plugins that have them
      for (const plugin of loaded) {
        if (plugin.enabled && plugin.hasScript && !pluginModules.current.has(plugin.id)) {
          const module = await loadPluginScript(plugin.id);
          if (module) {
            pluginModules.current.set(plugin.id, module);
            console.log(`Loaded frontend script for plugin: ${plugin.id}`);
          }
        }
      }

      setPlugins(loaded);
    } catch (err) {
      console.error('Failed to load plugins:', err);
      setError(err instanceof Error ? err.message : 'Failed to load plugins');
    } finally {
      setIsLoading(false);
    }
  }, [loadPluginScript]);

  // Load plugins on mount
  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  const getButtonsForLocation = useCallback(
    (location: string): PluginButton[] => {
      const buttons: PluginButton[] = [];

      for (const plugin of plugins) {
        if (!plugin.enabled || plugin.status === 'error' || plugin.status === 'disabled') {
          continue;
        }

        for (const button of plugin.buttons) {
          if (button.location === location) {
            buttons.push(button);
          }
        }
      }

      return buttons;
    },
    [plugins]
  );

  const callEndpoint = useCallback(
    async <T = any>(pluginId: string, endpoint: string, method: string = 'POST', data?: any): Promise<T> => {
      return callPluginEndpoint<T>(pluginId, endpoint, method, data);
    },
    []
  );

  // Invoke a plugin's handler after an action completes
  const invokeHandler = useCallback(
    async (pluginId: string, buttonId: string, response: PluginActionResponse) => {
      const module = pluginModules.current.get(pluginId);
      if (!module) return;

      const api = buildPluginAPI();

      try {
        // First try button-specific handler
        if (module.handlers?.[buttonId]) {
          await module.handlers[buttonId](response, api);
        }
        // Fall back to generic onSuccess
        else if (module.onSuccess) {
          await module.onSuccess(response, api);
        }
      } catch (err) {
        console.error(`Plugin ${pluginId} handler error:`, err);
        if (module.onError) {
          await module.onError(err instanceof Error ? err : new Error(String(err)), api);
        }
      }
    },
    [buildPluginAPI]
  );

  const setPluginEnabled = useCallback(
    async (pluginId: string, enabled: boolean) => {
      await updatePlugin(pluginId, { enabled });
      // Refresh plugin list to get updated state
      await loadPlugins();
    },
    [loadPlugins]
  );

  const updatePluginConfig = useCallback(
    async (pluginId: string, config: PluginConfig) => {
      await updatePlugin(pluginId, { config });
      // Refresh plugin list to get updated state
      await loadPlugins();
    },
    [loadPlugins]
  );

  // Setters for callbacks
  const setTagEditorCallback = useCallback(
    (cb: ((tags: string[], mode: 'append' | 'replace') => void) | null) => {
      tagEditorCallback.current = cb;
    },
    []
  );

  const setMessageCallback = useCallback(
    (cb: ((message: string, severity: 'success' | 'error' | 'warning' | 'info') => void) | null) => {
      messageCallback.current = cb;
    },
    []
  );

  const setCurrentImage = useCallback((image: ImageWithTags | null) => {
    currentImage.current = image;
  }, []);

  const setRefreshImageCallback = useCallback((cb: (() => void) | null) => {
    refreshImageCallback.current = cb;
  }, []);

  const value: PluginContextValue = {
    plugins,
    isLoading,
    error,
    getButtonsForLocation,
    callEndpoint,
    setPluginEnabled,
    updatePluginConfig,
    refreshPlugins: loadPlugins,
    invokeHandler,
    setTagEditorCallback,
    setMessageCallback,
    setCurrentImage,
    setRefreshImageCallback,
  };

  return <PluginContext.Provider value={value}>{children}</PluginContext.Provider>;
}

export function usePlugins(): PluginContextValue {
  const context = useContext(PluginContext);
  if (!context) {
    throw new Error('usePlugins must be used within a PluginProvider');
  }
  return context;
}
