import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { get } from './db.js';

const SCRYPT_KEY_LENGTH = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString('hex');
  return `scrypt$${salt}$${key}`;
}

export function verifyPassword(password, stored) {
  try {
    const [algorithm, salt, key] = String(stored).split('$');
    if (algorithm !== 'scrypt' || !salt || !key) return false;
    const expected = Buffer.from(key, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function createToken(user) {
  return jwt.sign(
    { sub: String(user.id), email: user.email, name: user.name, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn, issuer: 'fleettrack' },
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret, { issuer: 'fleettrack' });
  } catch {
    return null;
  }
}

export function setSessionCookie(res, token) {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.cookieName, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: '/',
  });
}

export function getSessionUser(req) {
  const token = req.cookies?.[config.cookieName];
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload?.sub) return null;
  return get(
    'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
    Number(payload.sub),
  ) || null;
}

export function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
    if ((req.originalUrl || '').startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const next = encodeURIComponent(req.originalUrl || '/');
    return res.redirect(`/login?next=${next}`);
  }
  req.user = user;
  return next();
}

export function requirePageAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
    const target = encodeURIComponent(req.originalUrl || '/');
    return res.redirect(`/login?next=${target}`);
  }
  req.user = user;
  return next();
}

export function parseCookies(cookieHeader = '') {
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

export function userForSocket(socket) {
  const cookies = parseCookies(socket.handshake.headers.cookie || '');
  const token = cookies[config.cookieName];
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload?.sub) return null;
  return get('SELECT id, name, email, role FROM users WHERE id = ?', Number(payload.sub)) || null;
}
