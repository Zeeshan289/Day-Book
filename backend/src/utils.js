export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Wrap async route handlers so errors reach the error handler.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Today's date in the business timezone, as 'YYYY-MM-DD'.
export function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: process.env.APP_TIMEZONE || 'Asia/Karachi' });
}

// A real 'YYYY-MM-DD' date. Rejects impossible ones like 2026-02-31.
export function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const back = new Date(Date.UTC(y, m - 1, d));
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d;
}

export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Round to paisa. EPSILON fixes cases like 1.005 rounding down to 1.
// Works on the size of the number, so -1.005 becomes -1.01 (balances can be negative).
export function round2(n) {
  const x = Number(n);
  return (Math.sign(x) * Math.round((Math.abs(x) + Number.EPSILON) * 100)) / 100;
}

// Turn '' / null / undefined into null, otherwise a positive number (or error).
export function optionalPositive(value, label) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new HttpError(400, `${label} must be a number above 0.`);
  return n;
}

export function optionalText(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

export function requiredText(value, message) {
  const s = optionalText(value);
  if (!s) throw new HttpError(400, message);
  return s;
}

export function toId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Invalid id.');
  return n;
}

export async function audit(db, userId, action, table, recordId, oldData, newData) {
  await db.query(
    `INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, action, table, recordId, oldData ? JSON.stringify(oldData) : null, newData ? JSON.stringify(newData) : null]
  );
}
