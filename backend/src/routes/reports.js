import { Router } from 'express';
import { query } from '../db.js';
import { balanceBefore, closingFrom, totalsBetween } from '../services/book.js';
import { ah, HttpError, isDate } from '../utils.js';

const router = Router();

router.get('/summary', ah(async (req, res) => {
  const { from, to } = req.query;
  if (!isDate(from) || !isDate(to)) throw new HttpError(400, 'Pick a valid date range.');
  if (from > to) throw new HttpError(400, 'The start date must be before the end date.');

  const opening = await balanceBefore(from);
  const totals = await totalsBetween(from, to);
  const closing = closingFrom(opening, totals);

  const { rows: byCategory } = await query(
    `SELECT e.type, COALESCE(c.name, 'No category') AS category,
            SUM(e.amount) AS total,
            SUM(CASE WHEN e.mode = 'credit' THEN e.amount ELSE 0 END) AS credit,
            COUNT(*)::int AS count
     FROM entries e LEFT JOIN categories c ON c.id = e.category_id
     WHERE NOT e.voided AND e.entry_date BETWEEN $1 AND $2
     GROUP BY e.type, c.name
     ORDER BY e.type, total DESC`,
    [from, to]
  );

  const { rows: byDay } = await query(
    `SELECT entry_date,
       SUM(CASE WHEN type = 'receipt' AND mode <> 'credit' THEN amount ELSE 0 END) AS money_in,
       SUM(CASE WHEN type = 'payment' AND mode <> 'credit' THEN amount ELSE 0 END) AS money_out,
       SUM(CASE WHEN type = 'receipt' AND mode = 'credit' THEN amount ELSE 0 END) AS credit_sales,
       SUM(CASE WHEN type = 'payment' AND mode = 'credit' THEN amount ELSE 0 END) AS credit_purchases
     FROM entries
     WHERE NOT voided AND entry_date BETWEEN $1 AND $2
     GROUP BY entry_date ORDER BY entry_date`,
    [from, to]
  );

  res.json({ from, to, opening, totals, closing, byCategory, byDay });
}));

export default router;
