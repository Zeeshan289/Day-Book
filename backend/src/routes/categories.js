import { Router } from 'express';
import { query, withTx } from '../db.js';
import { requireOwner } from '../middleware/auth.js';
import { ah, audit, HttpError, requiredText, toId } from '../utils.js';

const router = Router();

// Is there another category with this name on the same side? (ignores upper/lower case)
async function isDuplicate(name, type, exceptId = 0) {
  const dup = await query('SELECT 1 FROM categories WHERE lower(name) = lower($1) AND type = $2 AND id <> $3', [name, type, exceptId]);
  return dup.rowCount > 0;
}

router.get('/', ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM categories ORDER BY type, active DESC, name');
  res.json(rows);
}));

router.post('/', requireOwner, ah(async (req, res) => {
  const name = requiredText(req.body.name, 'Enter a category name.');
  if (!['receipt', 'payment'].includes(req.body.type)) throw new HttpError(400, 'Pick money in or money out.');
  if (await isDuplicate(name, req.body.type)) throw new HttpError(400, 'This category already exists.');
  const c = await withTx(async (db) => {
    const { rows: [r] } = await db.query('INSERT INTO categories (name, type) VALUES ($1, $2) RETURNING *', [name, req.body.type]);
    await audit(db, req.user.id, 'create', 'categories', r.id, null, r);
    return r;
  });
  res.status(201).json(c);
}));

router.patch('/:id', requireOwner, ah(async (req, res) => {
  const id = toId(req.params.id);
  const { rows: [cur] } = await query('SELECT * FROM categories WHERE id = $1', [id]);
  if (!cur) throw new HttpError(404, 'Category not found.');
  const name = req.body.name !== undefined ? requiredText(req.body.name, 'Enter a category name.') : cur.name;
  if (await isDuplicate(name, cur.type, id)) throw new HttpError(400, 'Another category already has this name.');
  const active = typeof req.body.active === 'boolean' ? req.body.active : cur.active;
  const c = await withTx(async (db) => {
    const { rows: [r] } = await db.query('UPDATE categories SET name = $1, active = $2 WHERE id = $3 RETURNING *', [name, active, id]);
    await audit(db, req.user.id, 'update', 'categories', id, cur, r);
    return r;
  });
  res.json(c);
}));

export default router;
