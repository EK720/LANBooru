/**
 * Docker Container Manager for Plugins
 *
 * Manages building and running Docker containers for container-type plugins.
 * Requires Docker socket to be mounted into the backend container.
 *
 * Cross-platform support:
 * - Linux/Mac: /var/run/docker.sock
 * - Windows (Docker Desktop with WSL2): /var/run/docker.sock (via WSL integration)
 * - Windows (Docker Desktop native): //./pipe/docker_engine
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { LoadedPlugin } from './types';

const CONTAINER_PREFIX = 'plugin-';

// Docker socket paths to try
const DOCKER_SOCKET_PATHS = [
  '/var/run/docker.sock',           // Linux/Mac/WSL2
  '//./pipe/docker_engine',         // Windows native
];

// Cached network name (detected at runtime)
let detectedNetworkName: string | null = null;

/**
 * Get the Docker network name that the backend is connected to.
 * Docker Compose prefixes network names with the project name,
 * so we need to detect it at runtime.
 */
function getNetworkName(): string {
  if (detectedNetworkName) {
    return detectedNetworkName;
  }

  try {
    // Get the network(s) the backend container is connected to
    const hostname = execSync('hostname', { stdio: 'pipe', encoding: 'utf-8' }).trim();
    const networksJson = execSync(
      `docker inspect --format='{{json .NetworkSettings.Networks}}' ${hostname} 2>/dev/null`,
      { stdio: 'pipe', encoding: 'utf-8' }
    );

    const networks = JSON.parse(networksJson);
    const networkNames = Object.keys(networks);

    // Find a network that looks like our booru network (contains 'booru')
    const booruNetwork = networkNames.find(name => name.includes('booru'));
    if (booruNetwork) {
      detectedNetworkName = booruNetwork;
      console.log(`Detected Docker network: ${detectedNetworkName}`);
      return detectedNetworkName;
    }
	
	// This should make the plugin loader error out, there's some sort of problem if it can't find the booru network
	return '';
  } catch (err) {
    // Fallback to common compose naming convention
    console.warn('Could not detect Docker network, using fallback');
    detectedNetworkName = 'local-booru_booru-network';
    return detectedNetworkName;
  }
}

export interface ContainerStatus {
  running: boolean;
  containerId?: string;
  error?: string;
}

/**
 * Check if Docker is available
 */
export function isDockerAvailable(): boolean {
  try {
    execSync('docker version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the container name for a plugin
 */
export function getContainerName(pluginId: string): string {
  return `${CONTAINER_PREFIX}${pluginId}`;
}

/**
 * Get the image name for a plugin
 */
export function getImageName(pluginId: string): string {
  return `lanbooru-plugin-${pluginId}:latest`;
}

/**
 * Check if a container is running
 */
export function getContainerStatus(pluginId: string): ContainerStatus {
  const containerName = getContainerName(pluginId);

  try {
    const result = execSync(
      `docker inspect --format='{{.State.Running}}' ${containerName} 2>/dev/null`,
      { stdio: 'pipe', encoding: 'utf-8' }
    ).trim();

    return {
      running: result === 'true',
      containerId: containerName,
    };
  } catch {
    return { running: false };
  }
}

/**
 * Build a Docker image for a plugin
 */
export async function buildPluginImage(plugin: LoadedPlugin): Promise<boolean> {
  if (!plugin.manifest.container?.build) {
    console.error(`Plugin ${plugin.manifest.id} has no build path configured`);
    return false;
  }

  const buildPath = path.join(plugin.extractedPath, plugin.manifest.container.build);
  const imageName = getImageName(plugin.manifest.id);

  console.log(`Building Docker image for plugin ${plugin.manifest.id}...`);
  console.log(`  Build context: ${buildPath}`);
  console.log(`  Image name: ${imageName}`);

  return new Promise((resolve) => {
    const buildProcess = spawn('docker', ['build', '-t', imageName, buildPath], {
      stdio: 'inherit',
    });

    buildProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`Successfully built image ${imageName}`);
        resolve(true);
      } else {
        console.error(`Failed to build image ${imageName} (exit code: ${code})`);
        resolve(false);
      }
    });

    buildProcess.on('error', (err) => {
      console.error(`Failed to build image ${imageName}:`, err);
      resolve(false);
    });
  });
}

/**
 * Start a plugin container
 */
export async function startPluginContainer(
  plugin: LoadedPlugin,
  volumeMounts: string[] = []
): Promise<boolean> {
  const containerName = getContainerName(plugin.manifest.id);
  const imageName = plugin.manifest.container?.image || getImageName(plugin.manifest.id);

  // Stop existing container if running
  await stopPluginContainer(plugin.manifest.id);

  // Build run arguments
  const networkName = getNetworkName();
  const args = [
    'run',
    '-d',
    '--name', containerName,
    '--network', networkName,
    '--restart', 'unless-stopped',
  ];

  // Add environment variables
  if (plugin.manifest.container?.environment) {
    for (const [key, value] of Object.entries(plugin.manifest.container.environment)) {
      args.push('-e', `${key}=${value}`);
    }
  }

  // Add GPU support if requested
  if (plugin.manifest.container?.gpu) {
    args.push('--gpus', 'all');
  }

  // Add volume mounts (inherited from backend for image access)
  for (const mount of volumeMounts) {
    args.push('-v', mount);
  }

  // Add plugin-specific volumes
  if (plugin.manifest.container?.volumes) {
    for (const vol of plugin.manifest.container.volumes) {
      args.push('-v', vol);
    }
  }

  // Add image name
  args.push(imageName);

  console.log(`Starting container ${containerName}...`);
  console.log(`  Command: docker ${args.join(' ')}`);

  return new Promise((resolve) => {
    const runProcess = spawn('docker', args, { stdio: 'inherit' });

    runProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`Successfully started container ${containerName}`);
        resolve(true);
      } else {
        console.error(`Failed to start container ${containerName} (exit code: ${code})`);
        resolve(false);
      }
    });

    runProcess.on('error', (err) => {
      console.error(`Failed to start container ${containerName}:`, err);
      resolve(false);
    });
  });
}

/**
 * Stop a plugin container
 */
export async function stopPluginContainer(pluginId: string): Promise<boolean> {
  const containerName = getContainerName(pluginId);

  try {
    // Stop and remove if exists
    execSync(`docker stop ${containerName} 2>/dev/null || true`, { stdio: 'pipe' });
    execSync(`docker rm ${containerName} 2>/dev/null || true`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get logs from a plugin container
 */
export function getContainerLogs(pluginId: string, lines: number = 100): string {
  const containerName = getContainerName(pluginId);

  try {
    return execSync(`docker logs --tail ${lines} ${containerName} 2>&1`, {
      stdio: 'pipe',
      encoding: 'utf-8',
    });
  } catch (err: any) {
    return err.message || 'Failed to get logs';
  }
}

/**
 * Parse volume mounts from environment or docker inspect
 * This gets the image folder mounts from the backend container
 */
export function getBackendVolumeMounts(): string[] {
  const mounts: string[] = [];

  try {
    // Try to get mounts from current container (if running in Docker)
    const hostname = execSync('hostname', { stdio: 'pipe', encoding: 'utf-8' }).trim();
    const inspect = execSync(
      `docker inspect --format='{{json .Mounts}}' ${hostname} 2>/dev/null`,
      { stdio: 'pipe', encoding: 'utf-8' }
    );

    const mountsData = JSON.parse(inspect);
    for (const mount of mountsData) {
      // Only pass through bind mounts to image directories (not volumes)
      if (mount.Type === 'bind' && mount.Destination !== '/app/plugins') {
        mounts.push(`${mount.Source}:${mount.Destination}:${mount.RW ? 'rw' : 'ro'}`);
      }
    }
  } catch {
    // Not running in Docker or can't inspect - return empty
    console.warn('Could not detect backend volume mounts - plugins may not have image access');
  }

  return mounts;
}
