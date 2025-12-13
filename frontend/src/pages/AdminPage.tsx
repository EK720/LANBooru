import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActions,
  IconButton,
  Switch,
  TextField,
  Button,
  Stack,
  Chip,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Refresh as ScanIcon,
  Add as AddIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFolders, addFolder, deleteFolder, updateFolder, scanFolder } from '../api/client';
import { getPlugins, updatePlugin } from '../plugins/api';
import { usePlugins, PluginButton } from '../plugins';
import type { Folder } from '../types/api';
import type { PluginInfo, ConfigField, PluginConfig } from '../plugins/types';

// Plugin config form component
function PluginConfigForm({ plugin, onSave }: { plugin: PluginInfo; onSave: (config: PluginConfig) => void }) {
  const [config, setConfig] = useState<PluginConfig>({ ...plugin.currentConfig });
  const [isDirty, setIsDirty] = useState(false);

  const handleChange = (key: string, value: string | number | boolean) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    onSave(config);
    setIsDirty(false);
  };

  const renderField = (field: ConfigField) => {
    const value = config[field.key] ?? field.default ?? '';

    switch (field.type) {
      case 'boolean':
        return (
          <FormControlLabel
            control={
              <Checkbox
                checked={Boolean(value)}
                onChange={(e) => handleChange(field.key, e.target.checked)}
              />
            }
            label={field.label}
          />
        );

      case 'select':
        return (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              {field.label}
            </Typography>
            <Select
              size="small"
              fullWidth
              value={value}
              onChange={(e) => handleChange(field.key, e.target.value)}
            >
              {field.options?.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </Select>
          </Box>
        );

      case 'number':
        return (
          <TextField
            size="small"
            fullWidth
            type="number"
            label={field.label}
            value={value}
            onChange={(e) => handleChange(field.key, parseFloat(e.target.value) || 0)}
            inputProps={{ min: field.min, max: field.max, step: field.step }}
            helperText={field.description}
          />
        );

      case 'password':
        return (
          <TextField
            size="small"
            fullWidth
            type="password"
            label={field.label}
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            helperText={field.description}
          />
        );

      default: // string
        return (
          <TextField
            size="small"
            fullWidth
            label={field.label}
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            helperText={field.description}
          />
        );
    }
  };

  if (plugin.config.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        This plugin has no configuration options.
      </Typography>
    );
  }

  const handleResetToDefaults = () => {
    const defaults: PluginConfig = {};
    for (const field of plugin.config) {
      if (field.default !== undefined) {
        defaults[field.key] = field.default;
      }
    }
    setConfig(defaults);
    setIsDirty(true);
  };

  return (
    <Stack spacing={2}>
      {plugin.config.map(field => (
        <Box key={field.key}>
          {renderField(field)}
        </Box>
      ))}
      <Stack direction="row" spacing={1}>
        <Button
          variant="contained"
          size="small"
          onClick={handleSave}
          disabled={!isDirty}
        >
          Save Configuration
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={handleResetToDefaults}
        >
          Reset to Defaults
        </Button>
      </Stack>
    </Stack>
  );
}

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(0);
  const [newPath, setNewPath] = useState('');
  const [newRecursive, setNewRecursive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { getButtonsForLocation } = usePlugins();

  // Track which plugins are being toggled (for optimistic UI)
  const [togglingPlugins, setTogglingPlugins] = useState<Set<string>>(new Set());

  // Folders query
  const { data: folders, isLoading: foldersLoading } = useQuery({
    queryKey: ['folders'],
    queryFn: getFolders,
  });

  // Plugins query
  const { data: plugins, isLoading: pluginsLoading } = useQuery({
    queryKey: ['plugins'],
    queryFn: getPlugins,
  });

  const addMutation = useMutation({
    mutationFn: ({ path, recursive }: { path: string; recursive: boolean }) =>
      addFolder(path, recursive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      setNewPath('');
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFolder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: { recursive?: boolean; enabled?: boolean } }) =>
      updateFolder(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
    },
  });

  const scanMutation = useMutation({
    mutationFn: scanFolder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  const pluginUpdateMutation = useMutation({
    mutationFn: ({ pluginId, updates }: { pluginId: string; updates: { enabled?: boolean; config?: PluginConfig } }) =>
      updatePlugin(pluginId, updates),
    onMutate: async ({ pluginId, updates }) => {
      // Only do optimistic update for enable/disable toggle
      if (updates.enabled === undefined) return;

      setTogglingPlugins(prev => new Set(prev).add(pluginId));

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['plugins'] });

      // Snapshot previous value
      const previousPlugins = queryClient.getQueryData<PluginInfo[]>(['plugins']);

      // Optimistically update
      queryClient.setQueryData<PluginInfo[]>(['plugins'], old =>
        old?.map(p => p.id === pluginId ? { ...p, enabled: updates.enabled! } : p)
      );

      return { previousPlugins };
    },
    onError: (_err, { pluginId }, context) => {
      // Revert on error
      if (context?.previousPlugins) {
        queryClient.setQueryData(['plugins'], context.previousPlugins);
      }
      setTogglingPlugins(prev => {
        const next = new Set(prev);
        next.delete(pluginId);
        return next;
      });
    },
    onSettled: (_data, _err, { pluginId }) => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      setTogglingPlugins(prev => {
        const next = new Set(prev);
        next.delete(pluginId);
        return next;
      });
    },
  });

  const handleAddFolder = () => {
    if (newPath.trim()) {
      addMutation.mutate({ path: newPath.trim(), recursive: newRecursive });
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h4" sx={{ flexShrink: 0 }}>
          Admin Settings
        </Typography>

        {/* Settings plugin buttons (right-aligned) */}
        {getButtonsForLocation('settings').length > 0 && (
          <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="flex-end" sx={{ minWidth: 0 }}>
            {getButtonsForLocation('settings').map((btn) => (
              <PluginButton key={`${btn.pluginId}-${btn.id}`} button={btn} variant="outlined" />
            ))}
          </Stack>
        )}
      </Stack>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label="Folders" />
          <Tab label="Plugins" />
        </Tabs>
      </Box>

      {/* Folders Tab */}
      {activeTab === 0 && (
        <>
          <Alert severity="info" sx={{ mb: 3 }}>
            Folder management is only available from localhost for security.
          </Alert>

          {/* Add folder form */}
          <Paper sx={{ p: 2, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Add Folder
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
              <TextField
                label="Folder path"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="/host/path/to/images"
                fullWidth
                size="small"
                helperText="Use /host prefix for mounted volumes"
              />
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2">Recursive</Typography>
                <Switch
                  checked={newRecursive}
                  onChange={(e) => setNewRecursive(e.target.checked)}
                />
              </Stack>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAddFolder}
                disabled={!newPath.trim() || addMutation.isPending}
              >
                Add
              </Button>
            </Stack>
          </Paper>

          {/* Folder grid */}
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Monitored Folders
            </Typography>

            {foldersLoading ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <CircularProgress />
              </Box>
            ) : folders && folders.length > 0 ? (
              <Grid container spacing={2}>
                {folders.map((folder: Folder) => (
                  <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={folder.id}>
                    <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                      <CardContent sx={{ flex: 1 }}>
                        <Typography
                          variant="subtitle2"
                          sx={{
                            wordBreak: 'break-all',
                            mb: 1,
                            fontFamily: 'monospace',
                            fontSize: '0.85rem',
                          }}
                        >
                          {folder.path}
                        </Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                          <Chip
                            label={folder.do_recurse ? 'Recursive' : 'Non-recursive'}
                            size="small"
                            variant="outlined"
                          />
                          <Chip
                            label={folder.enabled ? 'Enabled' : 'Disabled'}
                            size="small"
                            color={folder.enabled ? 'success' : 'default'}
                            variant="outlined"
                          />
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          Last scanned: {formatDate(folder.last_scanned_at)}
                        </Typography>
                      </CardContent>
                      <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 1 }}>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Typography variant="caption" color="text.secondary">Enabled</Typography>
                          <Switch
                            checked={folder.enabled}
                            onChange={(e) =>
                              updateMutation.mutate({
                                id: folder.id,
                                updates: { enabled: e.target.checked },
                              })
                            }
                            size="small"
                          />
                        </Stack>
                        <Stack direction="row" spacing={0.5}>
                          <IconButton
                            onClick={() => scanMutation.mutate(folder.id)}
                            disabled={scanMutation.isPending}
                            title="Scan now"
                            size="small"
                          >
                            <ScanIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            onClick={() => {
                              if (confirm(`Delete folder "${folder.path}" and all its images?`)) {
                                deleteMutation.mutate(folder.id);
                              }
                            }}
                            color="error"
                            title="Delete folder"
                            size="small"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      </CardActions>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Paper sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">
                  No folders configured. Add a folder above to get started.
                </Typography>
              </Paper>
            )}
          </Box>
        </>
      )}

      {/* Plugins Tab */}
      {activeTab === 1 && (
        <Box>
          {pluginsLoading ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <CircularProgress />
            </Box>
          ) : plugins && plugins.length > 0 ? (
            <Stack spacing={1}>
              {plugins.map((plugin: PluginInfo) => (
                <Accordion key={plugin.id} defaultExpanded={plugin.config.length > 0}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ width: '100%', pr: 2 }}>
                      <Typography sx={{ fontWeight: 500 }}>{plugin.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        v{plugin.version}
                      </Typography>
                      <Chip
                        label={plugin.enabled ? 'Enabled' : 'Disabled'}
                        size="small"
                        color={plugin.enabled ? 'success' : 'default'}
                        variant="outlined"
                      />
                      <Chip
                        label={plugin.status}
                        size="small"
                        color={plugin.status === 'healthy' ? 'success' : plugin.status === 'error' ? 'error' : 'default'}
                        variant="outlined"
                      />
                    </Stack>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Stack spacing={2}>
                      <Typography variant="body2" color="text.secondary">
                        {plugin.description}
                      </Typography>

                      <FormControlLabel
                        control={
                          <Box sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                            <Switch
                              checked={plugin.enabled}
                              onChange={(e) =>
                                pluginUpdateMutation.mutate({
                                  pluginId: plugin.id,
                                  updates: { enabled: e.target.checked },
                                })
                              }
                              disabled={togglingPlugins.has(plugin.id)}
                            />
                            {togglingPlugins.has(plugin.id) && (
                              <CircularProgress size={20} sx={{ position: 'absolute', left: '50%', ml: '-10px' }} />
                            )}
                          </Box>
                        }
                        label="Enabled"
                      />

                      {plugin.config.length > 0 && (
                        <>
                          <Typography variant="subtitle2" sx={{ mt: 1 }}>
                            Configuration
                          </Typography>
                          <PluginConfigForm
                            plugin={plugin}
                            onSave={(config) =>
                              pluginUpdateMutation.mutate({
                                pluginId: plugin.id,
                                updates: { config },
                              })
                            }
                          />
                        </>
                      )}
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Stack>
          ) : (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">
                No plugins installed. Place .lbplugin files in the plugins directory.
              </Typography>
            </Paper>
          )}
        </Box>
      )}
    </Box>
  );
}
