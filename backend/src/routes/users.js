// Owner only (checked in index.js).
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTx } from '../db.js';
import { ah, audit, HttpError, requiredText, toId } from '../utils.js';

const router = Router();
const ROLES = ['owner', 'cashier'];
const PUBLIC = 'id, name, username, role, active, created_at';

// What goes into the audit log for a user. Never the password hash.
const forLog = (u) => ({ id: u.id, name: u.name, username: u.username, role: u.role, active: u.active });

router.get('/', ah(async (req, res) => {
  const { rows } = await query(`SELECT ${PUBLIC} FROM users ORDER BY active DESC, name`);
  res.json(rows);
}));

router.post('/', ah(async (req, res) => {
  const name = requiredText(req.body.name, 'Enter a name.');
  const username = requiredText(req.body.username, 'Enter a username.').toLowerCase();
  const role = ROLES.includes(req.body.role) ? req.body.role : 'cashier';
  const password = String(req.body.password || '');
  if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');

  const exists = await query('SELECT 1 FROM users WHERE lower(username) = $1', [username]);
  if (exists.rowCount) throw new HttpError(400, 'This username is already taken.');

  const hash = await bcrypt.hash(password, 10);
  const user = await withTx(async (db) => {
    const { rows: [u] } = await db.query(
      `INSERT INTO users (name, username, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING ${PUBLIC}`,
      [name, username, hash, role]
    );
    await audit(db, req.user.id, 'create', 'users', u.id, null, forLog(u));
    return u;
  });
  res.status(201).json(user);
}));

router.patch('/:id', ah(async (req, res) => {
  const id = toId(req.params.id);
  const { rows: [current] } = await query('SELECT * FROM users WHERE id = $1', [id]);
  if (!current) throw new HttpError(404, 'User not found.');

  const name = req.body.name !== undefined ? requiredText(req.body.name, 'Enter a name.') : current.name;
  const role = ROLES.includes(req.body.role) ? req.body.role : current.role;
  const active = typeof req.body.active === 'boolean' ? req.body.active : current.active;

  // Never lock everyone out: keep at least one active owner.
  if (current.role === 'owner' && (role !== 'owner' || !active)) {
    const { rows: [{ n }] } = await query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'owner' AND active AND id <> $1", [id]);
    if (n === 0) throw new HttpError(400, 'There must be at least one active owner.');
  }

  // New password: also log this user out everywhere (see middleware/auth.js).
  let hash = current.password_hash;
  let changedAt = current.password_changed_at;
  const passwordChanged = Boolean(req.body.password);
  if (passwordChanged) {
    if (String(req.body.password).length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');
    hash = await bcrypt.hash(String(req.body.password), 10);
    changedAt = new Date();
  }

  const user = await withTx(async (db) => {
    const { rows: [u] } = await db.query(
      `UPDATE users SET name = $1, role = $2, active = $3, password_hash = $4, password_changed_at = $5
       WHERE id = $6 RETURNING ${PUBLIC}`,
      [name, role, active, hash, changedAt, id]
    );
    await audit(db, req.user.id, 'update', 'users', id, forLog(current), { ...forLog(u), password_changed: passwordChanged });
    return u;
  });
  res.json(user);
}));

export default router;
