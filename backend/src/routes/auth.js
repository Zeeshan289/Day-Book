import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { ah, audit, HttpError } from '../utils.js';

const router = Router();

const makeToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' });

// Slow down password guessing: 10 tries per 15 minutes per IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: 'Too many login attempts. Wait 15 minutes and try again.' },
});

router.post('/login', loginLimiter, ah(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) throw new HttpError(400, 'Enter your username and password.');

  const { rows } = await query('SELECT * FROM users WHERE lower(username) = lower($1)', [String(username).trim()]);
  const user = rows[0];
  const ok = user && user.active && (await bcrypt.compare(String(password), user.password_hash));
  if (!ok) throw new HttpError(401, 'Wrong username or password.');

  res.json({ token: makeToken(user.id), user: { id: user.id, name: user.name, username: user.username, role: user.role } });
}));

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

router.post('/change-password', requireAuth, ah(async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!new_password || String(new_password).length < 6) throw new HttpError(400, 'New password must be at least 6 characters.');

  const { rows: [user] } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(String(current_password || ''), user.password_hash))) {
    throw new HttpError(400, 'Current password is wrong.');
  }
  const hash = await bcrypt.hash(String(new_password), 10);
  await query('UPDATE users SET password_hash = $1, password_changed_at = $2 WHERE id = $3', [hash, new Date(), req.user.id]);
  await audit({ query }, req.user.id, 'update', 'users', req.user.id, null, { password_changed: true });
  // Other logins of this user stop working. Give this one a fresh token so it stays logged in.
  res.json({ ok: true, token: makeToken(req.user.id) });
}));

export default router;
