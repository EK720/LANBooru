// Environment variable helper
// In Docker: reads from window.__ENV__ (injected at runtime)
// In dev: falls back to import.meta.env (Vite's build-time vars)

declare global {
  interface Window {
    __ENV__?: Record<string, string>;
  }
}

export function getEnv(key: string, defaultValue: string = ''): string {
  // Try runtime config first (Docker)
  if (window.__ENV__?.[key]) {
    return window.__ENV__[key];
  }
  // Fall back to Vite's build-time env (local dev)
  return (import.meta.env[key] as string) || defaultValue;
}

// Export commonly used config values
export const config = {
  imagesPerPage: parseInt(getEnv('VITE_IMAGES_PER_PAGE', '50'), 10),
};
