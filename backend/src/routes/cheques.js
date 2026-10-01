import { Router } from 'express';
import { query, withTx } from '../db.js';
import { requireOwner } from '../middleware/auth.js';
import { ah, audit, HttpError, isDate, optionalPositive, optionalText, requiredText, toId, today } from '../utils.js';

const router = Router();
const STATUSES = ['pending', 'cleared', 'bounced', 'cancelled'];

const SELECT = `SELECT ch.*, p.name AS person_name FROM cheques ch LEFT JOIN people p ON p.id = ch.person_id`;

function clean(b) {
  if (!['received', 'issued'].includes(b.direction)) throw new HttpError(400, 'Pick received or issued.');
  if (!isDate(b.cheque_date)) throw new HttpError(400, 'Enter the cheque date.');
  const amount = optionalPositive(b.amount, 'Amount');
  if (!amount) throw new HttpError(400, 'Enter the amount.');
  return {
    cheque_no: requiredText(b.cheque_no, 'Enter the cheque number.'),
    bank_name: optionalText(b.bank_name),
    party_name: requiredText(b.party_name, 'Enter who the cheque is from or to.'),
    person_id: b.person_id ? toId(b.person_id) : null,
    amount,
    direction: b.direction,
    cheque_date: b.cheque_date,
    note: optionalText(b.note),
  };
}

router.get('/', ah(async (req, res) => {
  const params = [];
  const where = [];
  if (STATUSES.includes(req.query.status)) { params.push(req.query.status); where.push(`ch.status = $${params.length}`); }
  if (['received', 'issued'].includes(req.query.direction)) { params.push(req.query.direction); where.push(`ch.direction = $${params.length}`); }
  const { rows } = await query(
    `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY (ch.status = 'pending') DESC, ch.cheque_date, ch.id LIMIT 1000`,
    params
  );
  res.json(rows);
}));

router.post('/', ah(async (req, res) => {
  const c = clean(req.body || {});
  const row = await withTx(async (db) => {
    const { rows: [r] } = await db.query(
      `INSERT INTO cheques (cheque_no, bank_name, party_name, person_id, amount, direction, cheque_date, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [c.cheque_no, c.bank_name, c.party_name, c.person_id, c.amount, c.direction, c.cheque_date, c.note, req.user.id]
    );
    await audit(db, req.user.id, 'create', 'cheques', r.id, null, r);
    return r;
  });
  res.status(201).json(row);
}));

router.put('/:id', requireOwner, ah(async (req, res) => {
  const id = toId(req.params.id);
  const c = clean(req.body || {});
  await withTx(async (db) => {
    const { rows: [old] } = await db.query('SELECT * FROM cheques WHERE id = $1 FOR UPDATE', [id]);
    if (!old) throw new HttpError(404, 'Cheque not found.');
    const { rows: [r] } = await db.query(
      `UPDATE cheques SET cheque_no = $1, bank_name = $2, party_name = $3, person_id = $4, amount = $5,
         direction = $6, cheque_date = $7, note = $8, updated_at = now() WHERE id = $9 RETURNING *`,
      [c.cheque_no, c.bank_name, c.party_name, c.person_id, c.amount, c.direction, c.cheque_date, c.note, id]
    );
    await audit(db, req.user.id, 'update', 'cheques', id, old, r);
  });
  const { rows: [row] } = await query(`${SELECT} WHERE ch.id = $1`, [id]);
  res.json(row);
}));

// Change status. When a cheque clears, it can be added to the day book as a bank entry.
router.post('/:id/status', requireOwner, ah(async (req, res) => {
  const id = toId(req.params.id);
  const { status, add_entry, category_id } = req.body || {};
  if (!STATUSES.includes(status)) throw new HttpError(400, 'Invalid status.');

  await withTx(async (db) => {
    const { rows: [old] } = await db.query('SELECT * FROM cheques WHERE id = $1 FOR UPDATE', [id]);
    if (!old) throw new HttpError(404, 'Cheque not found.');

    // If the day book entry for this cheque was cancelled, forget the link.
    let entryId = old.entry_id;
    if (entryId) {
      const { rows: [linked] } = await db.query('SELECT voided FROM entries WHERE id = $1', [entryId]);
      if (!linked || linked.voided) entryId = null;
    }
    if (entryId && status !== 'cleared') {
      throw new HttpError(400, 'This cheque is already in the day book. Cancel that entry first.');
    }

    if (status === 'cleared' && add_entry && !entryId) {
      const type = old.direction === 'received' ? 'receipt' : 'payment';
      if (category_id) {
        const { rows: [c] } = await db.query('SELECT type FROM categories WHERE id = $1', [toId(category_id)]);
        if (!c || c.type !== type) throw new HttpError(400, 'Pick a category from the right side of the book.');
      }
      const { rows: [entry] } = await db.query(
        `INSERT INTO entries (entry_date, type, description, category_id, person_id, amount, mode, note, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'bank', $7, $8) RETURNING *`,
        [today(), type, `Cheque #${old.cheque_no} ${old.direction === 'received' ? 'from' : 'to'} ${old.party_name}`,
          category_id ? toId(category_id) : null, old.person_id, old.amount, old.bank_name, req.user.id]
      );
      await audit(db, req.user.id, 'create', 'entries', entry.id, null, entry);
      entryId = entry.id;
    }

    const { rows: [r] } = await db.query(
      'UPDATE cheques SET status = $1, entry_id = $2, updated_at = now() WHERE id = $3 RETURNING *',
      [status, entryId, id]
    );
    await audit(db, req.user.id, 'status', 'cheques', id, old, r);
  });
  const { rows: [row] } = await query(`${SELECT} WHERE ch.id = $1`, [id]);
  res.json(row);
}));

export default router;
