import { Router } from 'express';
import { query, withTx } from '../db.js';
import { requireOwner } from '../middleware/auth.js';
import { ENTRY_SELECT, getSettings, PERSON_BALANCE, PERSON_EFFECT } from '../services/book.js';
import { ah, audit, HttpError, isDate, optionalText, requiredText, round2, toId, today } from '../utils.js';

const router = Router();
const TYPES = ['employee', 'customer', 'supplier', 'other'];

// Opening balance and its date (owner only; checked by the routes).
// `cur` holds the values to keep when a field is not sent.
async function cleanOpening(b, cur) {
  const value = b.opening_balance !== undefined ? b.opening_balance : cur.opening_balance;
  const n = value === '' || value === null ? 0 : Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, 'Opening balance must be a number.');
  const opening_balance = round2(n);
  if (opening_balance === 0) return { opening_balance: 0, opening_date: null };

  // No date given: use the day the book starts.
  let opening_date = b.opening_date !== undefined ? optionalText(b.opening_date) : cur.opening_date;
  if (!opening_date) opening_date = (await getSettings()).start_date;
  if (!isDate(opening_date)) throw new HttpError(400, 'Enter a valid date for the opening balance.');
  if (opening_date > today()) throw new HttpError(400, "The opening balance date can't be in the future.");
  return { opening_balance, opening_date };
}

router.get('/', ah(async (req, res) => {
  const type = TYPES.includes(req.query.type) ? req.query.type : null;
  const q = optionalText(req.query.q);
  const onlyActive = req.query.active === '1';
  const { rows } = await query(
    `SELECT p.*, ${PERSON_BALANCE} AS balance
     FROM people p
     LEFT JOIN entries e ON e.person_id = p.id
     WHERE ($1::text IS NULL OR p.type = $1)
       AND ($2::text IS NULL OR p.name ILIKE '%' || $2 || '%')
       AND (NOT $3 OR p.active)
     GROUP BY p.id
     ORDER BY p.active DESC, p.name`,
    [type, q, onlyActive]
  );
  res.json(rows);
}));

// Anyone can add a person. Only the owner can give them an opening balance.
router.post('/', ah(async (req, res) => {
  const name = requiredText(req.body.name, 'Enter a name.');
  const type = TYPES.includes(req.body.type) ? req.body.type : 'other';
  if (Number(req.body.opening_balance || 0) !== 0 && req.user.role !== 'owner') {
    throw new HttpError(403, 'Only the owner can set an opening balance.');
  }
  const o = await cleanOpening(req.body, { opening_balance: 0, opening_date: null });
  const p = await withTx(async (db) => {
    const { rows: [r] } = await db.query(
      `INSERT INTO people (name, type, phone, notes, opening_balance, opening_date)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, type, optionalText(req.body.phone), optionalText(req.body.notes), o.opening_balance, o.opening_date]
    );
    await audit(db, req.user.id, 'create', 'people', r.id, null, r);
    return r;
  });
  res.status(201).json({ ...p, balance: p.opening_balance });
}));

router.patch('/:id', requireOwner, ah(async (req, res) => {
  const id = toId(req.params.id);
  const { rows: [cur] } = await query('SELECT * FROM people WHERE id = $1', [id]);
  if (!cur) throw new HttpError(404, 'Person not found.');
  const b = req.body;
  const o = await cleanOpening(b, cur);
  const values = [
    b.name !== undefined ? requiredText(b.name, 'Enter a name.') : cur.name,
    TYPES.includes(b.type) ? b.type : cur.type,
    b.phone !== undefined ? optionalText(b.phone) : cur.phone,
    b.notes !== undefined ? optionalText(b.notes) : cur.notes,
    typeof b.active === 'boolean' ? b.active : cur.active,
    o.opening_balance,
    o.opening_date,
    id,
  ];
  const p = await withTx(async (db) => {
    const { rows: [r] } = await db.query(
      `UPDATE people SET name = $1, type = $2, phone = $3, notes = $4, active = $5,
         opening_balance = $6, opening_date = $7
       WHERE id = $8 RETURNING *`,
      values
    );
    await audit(db, req.user.id, 'update', 'people', id, cur, r);
    return r;
  });
  res.json(p);
}));

// One person's entries, oldest first, with a running balance.
// Optional from/to: `opening` is the balance before `from` (opening balance + earlier entries),
// `closing` is the balance at the end of `to`. person.balance is always the balance now.
router.get('/:id/ledger', ah(async (req, res) => {
  const id = toId(req.params.id);
  const from = optionalText(req.query.from);
  const to = optionalText(req.query.to);
  if ((from && !isDate(from)) || (to && !isDate(to))) throw new HttpError(400, 'Pick a valid date range.');
  if (from && to && from > to) throw new HttpError(400, 'The start date must be before the end date.');

  const { rows: [person] } = await query('SELECT * FROM people WHERE id = $1', [id]);
  if (!person) throw new HttpError(404, 'Person not found.');

  const { rows } = await query(
    `SELECT x.*, (${PERSON_EFFECT}) AS effect
     FROM (${ENTRY_SELECT} WHERE e.person_id = $1) x
     JOIN entries e ON e.id = x.id
     ORDER BY x.entry_date, x.id`,
    [id]
  );

  let balance = person.opening_balance; // balance now
  let opening = person.opening_balance; // balance before the period
  let running = null;
  const entries = [];
  for (const r of rows) {
    balance = round2(balance + r.effect);
    if (from && r.entry_date < from) { opening = round2(opening + r.effect); continue; }
    if (to && r.entry_date > to) continue;
    running = round2((running ?? opening) + r.effect);
    entries.push({ ...r, running });
  }
  const closing = running ?? opening;

  res.json({ person: { ...person, balance }, from, to, opening, closing, entries });
}));

export default router;
