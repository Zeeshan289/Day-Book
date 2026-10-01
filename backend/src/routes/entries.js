import { Router } from 'express';
import { query, withTx } from '../db.js';
import { requireOwner } from '../middleware/auth.js';
import { ENTRY_SELECT, getSettings } from '../services/book.js';
import {
  ah, audit, HttpError, isDate, optionalPositive, optionalText, requiredText, round2, toId, today,
} from '../utils.js';

const router = Router();

async function cleanEntry(body, user, db) {
  const e = {};

  e.entry_date = body.entry_date;
  if (!isDate(e.entry_date)) throw new HttpError(400, 'Pick a valid date.');
  const s = await getSettings(db);
  const now = today();
  if (e.entry_date < s.start_date) throw new HttpError(400, `The book starts on ${s.start_date}. Entries can't be older than that.`);
  if (e.entry_date > now) throw new HttpError(400, "Entries can't be in the future.");
  if (user.role !== 'owner' && e.entry_date !== now) throw new HttpError(403, 'Cashiers can only add entries for today.');

  if (!['receipt', 'payment'].includes(body.type)) throw new HttpError(400, 'Pick money in or money out.');
  e.type = body.type;

  if (!['cash', 'bank', 'credit'].includes(body.mode)) throw new HttpError(400, 'Pick cash, bank or credit.');
  e.mode = body.mode;

  e.description = requiredText(body.description, 'Write what this entry is for.');
  e.note = optionalText(body.note);

  e.qty = optionalPositive(body.qty, 'Quantity');
  e.rate = optionalPositive(body.rate, 'Rate');
  // The database keeps rate to 2 decimals, so round it first: then qty × rate always matches amount.
  if (e.rate !== null) e.rate = round2(e.rate);
  e.amount = e.qty !== null && e.rate !== null ? round2(e.qty * e.rate) : optionalPositive(body.amount, 'Amount');
  if (!e.amount) throw new HttpError(400, 'Enter the amount.');

  e.category_id = body.category_id ? toId(body.category_id) : null;
  if (e.category_id) {
    const { rows: [c] } = await db.query('SELECT type FROM categories WHERE id = $1', [e.category_id]);
    if (!c) throw new HttpError(400, 'Category not found.');
    if (c.type !== e.type) throw new HttpError(400, 'This category is for the other side of the book.');
  }

  e.person_id = body.person_id ? toId(body.person_id) : null;
  if (e.person_id) {
    const { rows: [p] } = await db.query('SELECT id FROM people WHERE id = $1', [e.person_id]);
    if (!p) throw new HttpError(400, 'Person not found.');
  }
  if (e.mode === 'credit' && !e.person_id) {
    throw new HttpError(400, 'Credit entries need a person, so the app knows who owes whom.');
  }
  return e;
}

// Owner can change anything. Cashier: only their own entries, only today's.
function canModify(entry, user) {
  if (user.role === 'owner') return true;
  return entry.created_by === user.id && entry.entry_date === today() && !entry.voided;
}

async function loadEntry(id, db = { query }) {
  const { rows: [e] } = await db.query(`${ENTRY_SELECT} WHERE e.id = $1`, [id]);
  if (!e) throw new HttpError(404, 'Entry not found.');
  return e;
}

// List entries with filters (used for reports and CSV export).
router.get('/', ah(async (req, res) => {
  const { from, to } = req.query;
  if (!isDate(from) || !isDate(to)) throw new HttpError(400, 'Pick a valid date range.');
  const params = [from, to];
  const where = ['e.entry_date BETWEEN $1 AND $2'];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };

  if (['receipt', 'payment'].includes(req.query.type)) add('e.type = ?', req.query.type);
  if (['cash', 'bank', 'credit'].includes(req.query.mode)) add('e.mode = ?', req.query.mode);
  if (req.query.category_id) add('e.category_id = ?', toId(req.query.category_id));
  if (req.query.person_id) add('e.person_id = ?', toId(req.query.person_id));
  if (optionalText(req.query.q)) add("e.description ILIKE '%' || ? || '%'", req.query.q.trim());
  if (req.query.include_voided !== '1') where.push('NOT e.voided');

  // CSV export (export=1) allows many more rows and says if any were cut off.
  const isExport = req.query.export === '1';
  const limit = isExport ? 50000 : 5000;
  const { rows } = await query(
    `${ENTRY_SELECT} WHERE ${where.join(' AND ')} ORDER BY e.entry_date, e.id LIMIT ${limit + 1}`,
    params
  );
  const truncated = rows.length > limit;
  if (truncated) rows.length = limit;
  if (isExport) return res.json({ entries: rows, truncated, limit });
  res.json(rows);
}));

router.post('/', ah(async (req, res) => {
  const saved = await withTx(async (db) => {
    const e = await cleanEntry(req.body || {}, req.user, db);
    const { rows: [row] } = await db.query(
      `INSERT INTO entries (entry_date, type, description, category_id, person_id, qty, rate, amount, mode, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [e.entry_date, e.type, e.description, e.category_id, e.person_id, e.qty, e.rate, e.amount, e.mode, e.note, req.user.id]
    );
    await audit(db, req.user.id, 'create', 'entries', row.id, null, row);
    return row;
  });
  res.status(201).json(await loadEntry(saved.id));
}));

router.put('/:id', ah(async (req, res) => {
  const id = toId(req.params.id);
  await withTx(async (db) => {
    const { rows: [old] } = await db.query('SELECT * FROM entries WHERE id = $1 FOR UPDATE', [id]);
    if (!old) throw new HttpError(404, 'Entry not found.');
    if (old.voided) throw new HttpError(400, 'This entry is cancelled and cannot be changed.');
    if (!canModify(old, req.user)) throw new HttpError(403, 'You can only change your own entries from today.');

    const e = await cleanEntry(req.body || {}, req.user, db);
    const { rows: [row] } = await db.query(
      `UPDATE entries SET entry_date = $1, type = $2, description = $3, category_id = $4, person_id = $5,
         qty = $6, rate = $7, amount = $8, mode = $9, note = $10, updated_at = now()
       WHERE id = $11 RETURNING *`,
      [e.entry_date, e.type, e.description, e.category_id, e.person_id, e.qty, e.rate, e.amount, e.mode, e.note, id]
    );
    await audit(db, req.user.id, 'update', 'entries', id, old, row);
  });
  res.json(await loadEntry(id));
}));

// Entries are never deleted. They are cancelled ("voided") with a reason.
router.post('/:id/void', ah(async (req, res) => {
  const id = toId(req.params.id);
  const reason = requiredText(req.body?.reason, 'Write why this entry is being cancelled.');
  await withTx(async (db) => {
    const { rows: [old] } = await db.query('SELECT * FROM entries WHERE id = $1 FOR UPDATE', [id]);
    if (!old) throw new HttpError(404, 'Entry not found.');
    if (old.voided) throw new HttpError(400, 'This entry is already cancelled.');
    if (!canModify(old, req.user)) throw new HttpError(403, 'You can only cancel your own entries from today.');
    const { rows: [row] } = await db.query(
      'UPDATE entries SET voided = TRUE, void_reason = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [reason, id]
    );
    await audit(db, req.user.id, 'void', 'entries', id, old, row);
  });
  res.json(await loadEntry(id));
}));

router.get('/:id/history', requireOwner, ah(async (req, res) => {
  const id = toId(req.params.id);
  const { rows } = await query(
    `SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.table_name = 'entries' AND a.record_id = $1 ORDER BY a.id`,
    [id]
  );
  res.json(rows);
}));

export default router;
