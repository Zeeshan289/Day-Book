import { Router } from 'express';
import { query } from '../db.js';
import { balanceBefore, closingFrom, ENTRY_SELECT, getSettings, totalsBetween } from '../services/book.js';
import { ah, HttpError, isDate } from '../utils.js';

const router = Router();

// Everything needed to show one page of the day book.
router.get('/:date', ah(async (req, res) => {
  const { date } = req.params;
  if (!isDate(date)) throw new HttpError(400, 'Invalid date.');
  const s = await getSettings();
  if (date < s.start_date) throw new HttpError(400, `The book starts on ${s.start_date}.`);

  const opening = await balanceBefore(date);
  const totals = await totalsBetween(date, date);
  const closing = closingFrom(opening, totals);
  const { rows: entries } = await query(`${ENTRY_SELECT} WHERE e.entry_date = $1 ORDER BY e.id`, [date]);

  res.json({ date, opening, totals, closing, entries });
}));

export default router;
