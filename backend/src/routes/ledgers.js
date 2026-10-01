// Ledgers: cash book, bank book, one category, and who owes whom.
// Read-only. Voided entries are listed (so nothing disappears) but never counted.
import { Router } from 'express';
import { query } from '../db.js';
import { balanceBefore, ENTRY_SELECT, getSettings, PERSON_BALANCE } from '../services/book.js';
import { ah, HttpError, isDate, round2, toId } from '../utils.js';

const router = Router();

function dateRange(q) {
  if (!isDate(q.from) || !isDate(q.to)) throw new HttpError(400, 'Pick a valid date range.');
  if (q.from > q.to) throw new HttpError(400, 'The start date must be before the end date.');
  return { from: q.from, to: q.to };
}

// Cash book or bank book: opening balance, every entry with the balance after it, closing balance.
router.get('/book', ah(async (req, res) => {
  const { mode } = req.query;
  if (!['cash', 'bank'].includes(mode)) throw new HttpError(400, 'Pick cash or bank.');
  let { from, to } = dateRange(req.query);
  const s = await getSettings();
  if (to < s.start_date) throw new HttpError(400, `The book starts on ${s.start_date}.`);
  if (from < s.start_date) from = s.start_date; // nothing exists before the book starts

  const opening = (await balanceBefore(from))[mode];
  const { rows } = await query(
    `${ENTRY_SELECT} WHERE e.mode = $1 AND e.entry_date BETWEEN $2 AND $3 ORDER BY e.entry_date, e.id`,
    [mode, from, to]
  );

  let running = opening;
  let moneyIn = 0;
  let moneyOut = 0;
  const entries = rows.map((e) => {
    if (!e.voided) {
      if (e.type === 'receipt') { moneyIn = round2(moneyIn + e.amount); running = round2(running + e.amount); }
      else { moneyOut = round2(moneyOut + e.amount); running = round2(running - e.amount); }
    }
    return { ...e, running };
  });

  res.json({ mode, from, to, opening, totals: { in: moneyIn, out: moneyOut }, closing: running, entries });
}));

// One category: its entries in the period with a running total (credit entries included, as in reports).
router.get('/category/:id', ah(async (req, res) => {
  const id = toId(req.params.id);
  const { from, to } = dateRange(req.query);
  const { rows: [category] } = await query('SELECT * FROM categories WHERE id = $1', [id]);
  if (!category) throw new HttpError(404, 'Category not found.');

  const { rows } = await query(
    `${ENTRY_SELECT} WHERE e.category_id = $1 AND e.entry_date BETWEEN $2 AND $3 ORDER BY e.entry_date, e.id`,
    [id, from, to]
  );

  let total = 0;
  let credit = 0;
  let count = 0;
  const entries = rows.map((e) => {
    if (!e.voided) {
      total = round2(total + e.amount);
      if (e.mode === 'credit') credit = round2(credit + e.amount);
      count += 1;
    }
    return { ...e, running: total };
  });

  res.json({ category, from, to, total, credit, count, entries });
}));

// Everyone who owes us (receivables) or whom we owe (payables) right now.
router.get('/balances', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT p.id, p.name, p.type, p.phone, p.active, ${PERSON_BALANCE} AS balance
     FROM people p
     LEFT JOIN entries e ON e.person_id = p.id
     GROUP BY p.id
     HAVING ${PERSON_BALANCE} <> 0
     ORDER BY abs(${PERSON_BALANCE}) DESC, p.name`
  );
  const receivables = rows.filter((p) => p.balance > 0);
  const payables = rows.filter((p) => p.balance < 0);
  const sum = (list) => round2(list.reduce((s, p) => s + p.balance, 0));

  res.json({
    receivables,
    payables,
    total_receivable: sum(receivables),
    total_payable: round2(-sum(payables)), // shown as a positive amount we owe
  });
}));

export default router;
