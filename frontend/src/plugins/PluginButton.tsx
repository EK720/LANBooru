/**
 * Plugin Button Component
 *
 * Renders a plugin button and handles calling the plugin endpoint.
 */

import React, { useState, useCallback } from 'react';
import {
  IconButton,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import * as Icons from '@mui/icons-material';
import type { PluginButton as PluginButtonType } from './types';
import type { ImageWithTags } from '../types/api';
import { usePlugins } from './PluginContext';

interface PluginButtonProps {
  button: PluginButtonType;
  image: ImageWithTags;
  variant?: 'icon' | 'text' | 'outlined';
  onSuccess?: (result: any) => void;
  onError?: (error: Error) => void;
}

// Get MUI icon by name, fallback to Extension icon
function getIcon(iconName?: string): React.ElementType {
  if (!iconName) return Icons.Extension;

  // Try to get the icon from MUI icons
  const Icon = (Icons as any)[iconName];
  if (Icon) return Icon;

  // Try common variations
  const variations = [
    iconName,
    `${iconName}Outlined`,
    `${iconName}Rounded`,
    `${iconName}Sharp`,
  ];

  for (const name of variations) {
    const icon = (Icons as any)[name];
    if (icon) return icon;
  }

  return Icons.Extension;
}

export function PluginButton({
  button,
  image,
  variant = 'icon',
  onSuccess,
  onError,
}: PluginButtonProps) {
  const { callEndpoint, invokeHandler } = usePlugins();
  const [isLoading, setIsLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleClick = useCallback(async () => {
    // If confirmation is required, show dialog first
    if (button.confirmMessage && !confirmOpen) {
      setConfirmOpen(true);
      return;
    }

    setConfirmOpen(false);
    setIsLoading(true);

    try {
      const result = await callEndpoint(
        button.pluginId,
        button.endpoint,
        button.method || 'POST',
        {
          imageId: image.id,
          image,
        }
      );

      // Invoke the plugin's frontend handler (if it has one)
      await invokeHandler(button.pluginId, button.id, result);

      // Also call the optional prop callback
      onSuccess?.(result);
    } catch (error) {
      console.error(`Plugin ${button.pluginId} action failed:`, error);
      onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsLoading(false);
    }
  }, [button, image, callEndpoint, invokeHandler, confirmOpen, onSuccess, onError]);

  const Icon = getIcon(button.icon);
  const tooltipText = button.tooltip || button.label;

  // Render confirmation dialog if needed
  const confirmDialog = button.confirmMessage ? (
    <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
      <DialogTitle>{button.label}</DialogTitle>
      <DialogContent>
        <DialogContentText>{button.confirmMessage}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
        <Button onClick={handleClick} variant="contained" autoFocus>
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  ) : null;

  if (variant === 'icon') {
    return (
      <>
        <IconButton
          onClick={handleClick}
          disabled={isLoading}
          size="small"
          color="inherit"
          title={tooltipText}
        >
          {isLoading ? <CircularProgress size={20} /> : <Icon />}
        </IconButton>
        {confirmDialog}
      </>
    );
  }

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={isLoading}
        variant={variant === 'outlined' ? 'outlined' : 'text'}
        startIcon={isLoading ? <CircularProgress size={16} /> : <Icon />}
        size="small"
        title={tooltipText}
      >
        {button.label}
      </Button>
      {confirmDialog}
    </>
  );
}
