import { Router } from 'express';
import { query, withTx } from '../db.js';
import { requireOwner } from '../middleware/auth.js';
import { getSettings } from '../services/book.js';
import { ah, audit, HttpError, isDate, requiredText, round2, today } from '../utils.js';

const router = Router();

router.get('/', ah(async (req, res) => {
  const s = await getSettings();
  res.json({ ...s, today: today() });
}));

router.put('/', requireOwner, ah(async (req, res) => {
  const b = req.body || {};
  const business_name = requiredText(b.business_name, 'Enter the business name.');
  if (!isDate(b.start_date)) throw new HttpError(400, 'Enter a valid start date.');
  const opening_cash = round2(b.opening_cash || 0);
  const opening_bank = round2(b.opening_bank || 0);
  if (!Number.isFinite(opening_cash) || !Number.isFinite(opening_bank)) throw new HttpError(400, 'Opening balances must be numbers.');

  const row = await withTx(async (db) => {
    const old = await getSettings(db);
    if (b.start_date > old.start_date) {
      const { rows: [{ n }] } = await db.query('SELECT COUNT(*)::int AS n FROM entries WHERE entry_date < $1', [b.start_date]);
      if (n > 0) throw new HttpError(400, `There are ${n} entries before this date. Pick an earlier start date.`);
    }
    const { rows: [r] } = await db.query(
      `UPDATE settings SET business_name = $1, start_date = $2, opening_cash = $3, opening_bank = $4
       WHERE id = 1 RETURNING *`,
      [business_name, b.start_date, opening_cash, opening_bank]
    );
    await audit(db, req.user.id, 'update', 'settings', 1, old, r);
    return r;
  });
  res.json({ ...row, today: today() });
}));

// Recent changes (owner only; checked in index.js).
export const auditRouter = Router();
auditRouter.get('/', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT a.id, a.action, a.table_name, a.record_id, a.old_data, a.new_data, a.created_at, u.name AS user_name
     FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.id DESC LIMIT 200`
  );
  res.json(rows);
}));

export default router;
