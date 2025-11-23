import { Request, Response, NextFunction } from 'express';

/**
 * Check if request is from localhost
 */
export function isLocalhost(req: Request): boolean {
  const ip = req.ip || req.connection.remoteAddress || '';

  // Check for localhost IPs
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.startsWith('127.') ||
    ip === 'localhost'
  );
}

/**
 * Middleware to restrict routes to localhost only
 */
export function localhostOnly(req: Request, res: Response, next: NextFunction) {
  if (!isLocalhost(req)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'This endpoint is only accessible from localhost'
    });
  }
  next();
}

/**
 * Middleware to add security context to request
 */
export function addSecurityContext(req: Request, res: Response, next: NextFunction) {
  (req as any).isLocalhost = isLocalhost(req);
  next();
}
