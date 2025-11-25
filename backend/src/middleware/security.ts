import { Request, Response, NextFunction } from 'express';

/**
 * Check if request is from localhost
 *
 * Security Note: This checks the Host header to determine if the user is accessing
 * via localhost. While Host headers can be spoofed, this provides reasonable protection
 * for a trusted LAN environment where physical network access is controlled.
 *
 * Works in Docker by checking the hostname in the Host header, since Docker routing
 * makes IP-based checks unreliable (all requests appear as 172.x.0.1 gateway IP).
 */
export function isLocalhost(req: Request): boolean {
  const host = req.headers.host || '';

  // Extract hostname (remove port if present)
  const hostname = host.split(':')[0];

  // Check if accessing via localhost/127.0.0.1
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.startsWith('127.')
  );
}

// Middleware to restrict routes to localhost only
export function localhostOnly(req: Request, res: Response, next: NextFunction) {
  if (!isLocalhost(req)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'This endpoint is only accessible from localhost'
    });
  }
  next();
}

// Middleware to add security context to request
export function addSecurityContext(req: Request, res: Response, next: NextFunction) {
  (req as any).isLocalhost = isLocalhost(req);
  next();
}