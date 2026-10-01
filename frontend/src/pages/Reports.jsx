import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useLoad } from '../api.js';
import { firstOfMonth, fmt, MODE_LABEL, niceDate } from '../money.js';

const SHORT_DATE = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };

export default function Reports() {
  const settings = useLoad(() => api('/settings'), []);
  const today = settings.data?.today;

  // Default range: first of this month → today.
  const [fromPick, setFrom] = useState('');
  const [toPick, setTo] = useState('');
  const from = fromPick || (today ? firstOfMonth(today) : '');
  const to = toPick || today || '';

  const report = useLoad(
    () => (from && to ? api(`/reports/summary?from=${from}&to=${to}`) : Promise.resolve(null)),
    [from, to]
  );
  const [csvError, setCsvError] = useState('');
  const [csvBusy, setCsvBusy] = useState(false);

  async function downloadCsv() {
    setCsvError('');
    setCsvBusy(true);
    try {
      const { entries, truncated, limit } = await api(`/entries?from=${from}&to=${to}&export=1`);
      saveFile(`daybook-${from}-to-${to}.csv`, toCsv(entries));
      if (truncated) setCsvError(`Only the first ${limit.toLocaleString('en-PK')} entries were saved. Pick a shorter date range.`);
    } catch (err) {
      setCsvError(err.message);
    } finally {
      setCsvBusy(false);
    }
  }

  if (settings.error) return <p className="error" role="alert">{settings.error}</p>;
  if (!today) return <p className="muted">Loading…</p>;

  // Only show a report for the dates picked now (old figures stay hidden while new ones load).
  const r = report.data?.from === from && report.data?.to === to ? report.data : null;

  return (
    <>
      <div className="page-head">
        <h1>Reports</h1>
      </div>

      <div className="toolbar">
        <label className="field">
          <span>From</span>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button className="btn" onClick={downloadCsv} disabled={csvBusy || !r}>
          {csvBusy ? 'Preparing…' : 'Download CSV'}
        </button>
      </div>

      {csvError && <p className="error" role="alert">{csvError}</p>}
      {report.error && !report.loading && <p className="error" role="alert">{report.error}</p>}
      {!r && (report.loading || !report.error) && <p className="muted">Loading…</p>}

      {r && <Summary r={r} />}
    </>
  );
}

function Summary({ r }) {
  const { opening, closing, totals } = r;
  const moneyIn = totals.receipt.cash + totals.receipt.bank;
  const moneyOut = totals.payment.cash + totals.payment.bank;
  const net = moneyIn - moneyOut;

  const receipts = r.byCategory.filter((c) => c.type === 'receipt');
  const payments = r.byCategory.filter((c) => c.type === 'payment');

  return (
    <>
      <div className="stats">
        <Stat label="Money in" value={moneyIn} detail={`Cash ${fmt(totals.receipt.cash)} · Bank ${fmt(totals.receipt.bank)}`} />
        <Stat label="Money out" value={moneyOut} detail={`Cash ${fmt(totals.payment.cash)} · Bank ${fmt(totals.payment.bank)}`} />
        <Stat label="Net" value={net} neg={net < 0} />
        <Stat label="Credit sales" value={totals.receipt.credit} red />
        <Stat label="Credit purchases" value={totals.payment.credit} red />
        <Stat label="Opening balance" value={opening.cash + opening.bank} detail={`Cash ${fmt(opening.cash)} · Bank ${fmt(opening.bank)}`} />
        <Stat label="Closing balance" value={closing.cash + closing.bank} detail={`Cash ${fmt(closing.cash)} · Bank ${fmt(closing.bank)}`} />
      </div>

      <div className="two-col">
        <CategoryTable title="Money in by category" rows={receipts} />
        <CategoryTable title="Money out by category" rows={payments} />
      </div>

      <section className="panel">
        <h2>By day</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">Money in</th>
                <th className="num">Money out</th>
                <th className="num">Credit sales</th>
                <th className="num">Credit purchases</th>
              </tr>
            </thead>
            <tbody>
              {r.byDay.map((d) => (
                <tr key={d.entry_date}>
                  <td><Link to={`/day/${d.entry_date}`}>{niceDate(d.entry_date, SHORT_DATE)}</Link></td>
                  <td className="money">{fmt(d.money_in)}</td>
                  <td className="money">{fmt(d.money_out)}</td>
                  <td className="num red">{d.credit_sales ? fmt(d.credit_sales) : ''}</td>
                  <td className="num red">{d.credit_purchases ? fmt(d.credit_purchases) : ''}</td>
                </tr>
              ))}
              {!r.byDay.length && <tr><td colSpan={5} className="empty">No entries in these dates.</td></tr>}
            </tbody>
            {r.byDay.length > 0 && (
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{fmt(moneyIn)}</td>
                  <td className="num">{fmt(moneyOut)}</td>
                  <td className="num">{fmt(totals.receipt.credit)}</td>
                  <td className="num">{fmt(totals.payment.credit)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, detail, red, neg }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className={`value${(red && value) || neg ? ' red' : ''}`}>Rs {fmt(value)}</span>
      {detail && <span className="detail">{detail}</span>}
    </div>
  );
}

function CategoryTable({ title, rows }) {
  const total = rows.reduce((s, c) => s + c.total, 0);
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Category</th>
              <th className="num">Entries</th>
              <th className="num">Of which credit</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.category}>
                <td>{c.category}</td>
                <td className="num">{c.count}</td>
                <td className="num red">{c.credit ? fmt(c.credit) : ''}</td>
                <td className="money">{fmt(c.total)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4} className="empty">Nothing here.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr><td colSpan={3}>Total</td><td className="num">{fmt(total)}</td></tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

// ---------- CSV export ----------

const CSV_COLUMNS = [
  ['Date', (e) => e.entry_date],
  ['Side', (e) => (e.type === 'receipt' ? 'Money in' : 'Money out')],
  ['Description', (e) => e.description],
  ['Category', (e) => e.category_name],
  ['Person', (e) => e.person_name],
  ['Qty', (e) => e.qty],
  ['Rate', (e) => e.rate],
  ['Amount', (e) => e.amount],
  ['Mode', (e) => MODE_LABEL[e.mode]],
  ['Note', (e) => e.note],
  ['Entered by', (e) => e.created_by_name],
];

// Wrap a value in quotes if it has a comma, quote or new line; double any quotes inside.
// Text starting with = + - @ (or tab / return) gets a ' in front, so Excel shows it as text
// instead of running it as a formula.
function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  const lines = [CSV_COLUMNS.map(([h]) => csvCell(h)).join(',')];
  for (const e of rows) lines.push(CSV_COLUMNS.map(([, get]) => csvCell(get(e))).join(','));
  return lines.join('\r\n');
}

function saveFile(name, text) {
  // The BOM helps Excel open the file as UTF-8.
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
