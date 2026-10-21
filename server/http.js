import path from 'node:path';
import { rootDir } from './config.js';

export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function notFoundHandler(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  return res.status(404).sendFile(path.join(rootDir, 'views', '404.html'));
}

export function errorHandler(error, req, res, _next) {
  const status = error.status && Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) {
    console.error('[fleettrack]', error);
  }
  if (req.path.startsWith('/api/')) {
    return res.status(status).json({
      error: status >= 500 ? 'An unexpected server error occurred' : error.message,
    });
  }
  return res.status(status).send('Something went wrong.');
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function isSameOrigin(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const expected = new URL(origin);
    const host = req.headers.host;
    return expected.host === host;
  } catch {
    return false;
  }
}
