export const fmt = (n) =>
  Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Split an amount into rupees and paisa, like the Rs. / Ps. columns of a paper day book.
export function splitRs(n) {
  const paisa = Math.round(Math.abs(Number(n || 0)) * 100);
  return { rs: Math.floor(paisa / 100).toLocaleString('en-PK'), ps: String(paisa % 100).padStart(2, '0') };
}

export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// A real 'YYYY-MM-DD' date (rejects things like 'abc' or 2026-02-31).
export function isRealDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const back = new Date(Date.UTC(y, m - 1, d));
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d;
}

export function niceDate(date, opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}

export const firstOfMonth = (date) => date.slice(0, 8) + '01';

export const MODE_LABEL = { cash: 'Cash', bank: 'Bank', credit: 'Credit' };
export const PERSON_TYPES = { employee: 'Employee', customer: 'Customer', supplier: 'Supplier', other: 'Other' };

// For a person's ledger: did we give them something (money or goods on credit, so they owe more)
// or receive something from them (so they owe less)? Same rule as the server's person balance.
export function personSide(e) {
  const gave = (e.type === 'receipt' && e.mode === 'credit') || (e.type === 'payment' && e.mode !== 'credit');
  return gave ? 'given' : 'received';
}

// Positive = they owe us / we advanced money. Negative = we owe them.
export function balanceText(n) {
  if (Math.abs(n) < 0.005) return 'Settled';
  return n > 0 ? `Owes you Rs ${fmt(n)}` : `You owe Rs ${fmt(-n)}`;
}

// Same, for a statement the person reads ("we" = the business).
export function statementBalanceText(n) {
  if (Math.abs(n) < 0.005) return 'Settled';
  return n > 0 ? `Owes us Rs ${fmt(n)}` : `We owe Rs ${fmt(-n)}`;
}
