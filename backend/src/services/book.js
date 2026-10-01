import { pool } from '../db.js';
import { round2 } from '../utils.js';

export async function getSettings(db = pool) {
  const { rows } = await db.query('SELECT * FROM settings WHERE id = 1');
  if (!rows[0]) throw new Error('Settings row missing. Run `npm run seed`.');
  return rows[0];
}

// Cash and bank balance at the START of `date` (before any entries of that day).
export async function balanceBefore(date, db = pool) {
  const s = await getSettings(db);
  const { rows: [r] } = await db.query(
    `SELECT
       COALESCE(SUM(CASE WHEN mode = 'cash' THEN CASE WHEN type = 'receipt' THEN amount ELSE -amount END END), 0) AS cash,
       COALESCE(SUM(CASE WHEN mode = 'bank' THEN CASE WHEN type = 'receipt' THEN amount ELSE -amount END END), 0) AS bank
     FROM entries
     WHERE NOT voided AND entry_date >= $1 AND entry_date < $2`,
    [s.start_date, date]
  );
  return { cash: round2(s.opening_cash + r.cash), bank: round2(s.opening_bank + r.bank) };
}

// Totals between two dates (inclusive), split by receipt/payment and cash/bank/credit.
export async function totalsBetween(from, to, db = pool) {
  const { rows } = await db.query(
    `SELECT type, mode, SUM(amount) AS total, COUNT(*)::int AS count
     FROM entries
     WHERE NOT voided AND entry_date BETWEEN $1 AND $2
     GROUP BY type, mode`,
    [from, to]
  );
  const empty = () => ({ cash: 0, bank: 0, credit: 0, count: 0 });
  const t = { receipt: empty(), payment: empty() };
  for (const r of rows) {
    t[r.type][r.mode] = round2(r.total);
    t[r.type].count += r.count;
  }
  return t;
}

export function closingFrom(opening, totals) {
  return {
    cash: round2(opening.cash + totals.receipt.cash - totals.payment.cash),
    bank: round2(opening.bank + totals.receipt.bank - totals.payment.bank),
  };
}

// Shared SELECT for entries with names attached.
export const ENTRY_SELECT = `
  SELECT e.*, c.name AS category_name, p.name AS person_name, u.name AS created_by_name
  FROM entries e
  LEFT JOIN categories c ON c.id = e.category_id
  LEFT JOIN people p ON p.id = e.person_id
  LEFT JOIN users u ON u.id = e.created_by`;

// Effect of an entry on a person's balance.
// Positive balance = they owe us (or we advanced them money). Negative = we owe them.
export const PERSON_EFFECT = `
  CASE
    WHEN e.voided THEN 0
    WHEN e.type = 'receipt' AND e.mode = 'credit' THEN e.amount
    WHEN e.type = 'receipt' THEN -e.amount
    WHEN e.mode = 'credit' THEN -e.amount
    ELSE e.amount
  END`;

// A person's balance now: their opening balance plus every entry. Use with `people p LEFT JOIN entries e ... GROUP BY p.id`.
export const PERSON_BALANCE = `p.opening_balance + COALESCE(SUM(${PERSON_EFFECT}), 0)`;
