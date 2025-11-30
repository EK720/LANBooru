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
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Refresh as ScanIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFolders, addFolder, deleteFolder, updateFolder, scanFolder } from '../api/client';
import type { Folder } from '../types/api';

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [newPath, setNewPath] = useState('');
  const [newRecursive, setNewRecursive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { data: folders, isLoading } = useQuery({
    queryKey: ['folders'],
    queryFn: getFolders,
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
      <Typography variant="h4" gutterBottom>
        Admin Settings
      </Typography>

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

        {isLoading ? (
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
    </Box>
  );
}
