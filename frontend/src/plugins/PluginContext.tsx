/**
 * Plugin Context
 *
 * Provides plugin state and actions to the React component tree.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { PluginInfo, PluginButton, PluginConfig } from './types';
import { getPlugins, updatePlugin, callPluginEndpoint } from './api';

interface PluginContextValue {
  plugins: PluginInfo[];
  isLoading: boolean;
  error: string | null;
  getButtonsForLocation: (location: string) => PluginButton[];
  callEndpoint: <T = any>(pluginId: string, endpoint: string, method?: string, data?: any) => Promise<T>;
  setPluginEnabled: (pluginId: string, enabled: boolean) => Promise<void>;
  updatePluginConfig: (pluginId: string, config: PluginConfig) => Promise<void>;
  refreshPlugins: () => Promise<void>;
}

const PluginContext = createContext<PluginContextValue | null>(null);

interface PluginProviderProps {
  children: ReactNode;
}

export function PluginProvider({ children }: PluginProviderProps) {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPlugins = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const loaded = await getPlugins();
      setPlugins(loaded);
    } catch (err) {
      console.error('Failed to load plugins:', err);
      setError(err instanceof Error ? err.message : 'Failed to load plugins');
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  const value: PluginContextValue = {
    plugins,
    isLoading,
    error,
    getButtonsForLocation,
    callEndpoint,
    setPluginEnabled,
    updatePluginConfig,
    refreshPlugins: loadPlugins,
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
