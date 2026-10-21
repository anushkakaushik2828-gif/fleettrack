import express from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { get } from '../db.js';
import {
  clearSessionCookie,
  createToken,
  getSessionUser,
  requireAuth,
  setSessionCookie,
  verifyPassword,
} from '../auth.js';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' },
});

router.post('/login', loginLimiter, (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = get('SELECT * FROM users WHERE email = ?', email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }

  const token = createToken(user);
  setSessionCookie(res, token);
  return res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.get('/demo', (req, res) => {
  res.json({
    email: config.demoEmail,
    password: config.demoPassword,
  });
});

// Kept as a safe authenticated no-op for clients that refresh auth state.
router.get('/session', (req, res) => {
  res.json({ user: getSessionUser(req), authenticated: Boolean(getSessionUser(req)) });
});

export default router;
