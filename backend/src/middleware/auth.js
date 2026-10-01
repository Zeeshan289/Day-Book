import jwt from 'jsonwebtoken';
import { query } from '../db.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in.' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Your session has ended. Please log in again.' });
  }

  try {
    // Check the user still exists and is active (owner may have disabled them).
    const { rows } = await query(
      'SELECT id, name, username, role, active, password_changed_at FROM users WHERE id = $1',
      [payload.id]
    );
    const user = rows[0];
    if (!user || !user.active) return res.status(401).json({ error: 'This account is disabled.' });
    // Password changed after this login: the old login no longer works.
    // (iat is in seconds, so compare whole seconds.)
    if (user.password_changed_at && payload.iat < Math.floor(user.password_changed_at.getTime() / 1000)) {
      return res.status(401).json({ error: 'Your password was changed. Please log in again.' });
    }
    req.user = { id: user.id, name: user.name, username: user.username, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') return res.status(403).json({ error: 'Only the owner can do this.' });
  next();
}
