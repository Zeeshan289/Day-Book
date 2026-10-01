import { Link, useSearchParams } from 'react-router-dom';
import { api, useLoad } from '../api.js';
import { balanceText, firstOfMonth, fmt, MODE_LABEL, niceDate, PERSON_TYPES } from '../money.js';

const SHORT_DATE = { day: 'numeric', month: 'short', year: 'numeric' };
const TABS = [
  { id: 'cash', label: 'Cash book' },
  { id: 'bank', label: 'Bank book' },
  { id: 'category', label: 'Category ledger' },
  { id: 'balances', label: 'Receivables / payables' },
];

// Load data for one set of filters. `key` is stored with the result, so a tab never shows
// figures for other filters while the new ones load.
function useKeyedLoad(key, loader) {
  const res = useLoad(() => (key ? loader().then((d) => ({ ...d, key })) : Promise.resolve(null)), [key]);
  return { ...res, data: res.data?.key === key ? res.data : null };
}

export default function Ledgers() {
  const [params, setParams] = useSearchParams();
  const settings = useLoad(() => api('/settings'), []);
  const today = settings.data?.today;

  // Tab, dates and category live in the address, so a link or a reload shows the same view.
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'cash';
  const from = params.get('from') || (today ? firstOfMonth(today) : '');
  const to = params.get('to') || today || '';
  const categoryId = params.get('category') || '';
  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  if (settings.error) return <p className="error" role="alert">{settings.error}</p>;
  if (!today) return <p className="muted">Loading…</p>;

  const current = TABS.find((t) => t.id === tab);
  const period = `${niceDate(from, SHORT_DATE)} to ${niceDate(to, SHORT_DATE)}`;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="print-only muted">{settings.data.business_name}</p>
          <h1>Ledgers</h1>
          <p className="print-only">{current.label}{tab !== 'balances' ? `: ${period}` : `, on ${niceDate(today, SHORT_DATE)}`}</p>
        </div>
        <button className="btn ghost no-print" onClick={() => window.print()}>Print</button>
      </div>

      <div className="tabs no-print" role="tablist" aria-label="Ledgers">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === tab}
            className={`tab${t.id === tab ? ' on' : ''}`}
            onClick={() => set('tab', t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'balances' && (
        <div className="toolbar no-print">
          <label className="field">
            <span>From</span>
            <input type="date" value={from} max={to} onChange={(e) => set('from', e.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={to} min={from} max={today} onChange={(e) => set('to', e.target.value)} />
          </label>
          {tab === 'category' && <CategoryPicker value={categoryId} onChange={(v) => set('category', v)} />}
        </div>
      )}

      <div role="tabpanel" aria-label={current.label}>
        {(tab === 'cash' || tab === 'bank') && <BookTab mode={tab} from={from} to={to} />}
        {tab === 'category' && <CategoryTab categoryId={categoryId} from={from} to={to} />}
        {tab === 'balances' && <BalancesTab />}
      </div>
    </>
  );
}

// ---------- Cash book / bank book ----------

function BookTab({ mode, from, to }) {
  const key = `${mode}|${from}|${to}`;
  const book = useKeyedLoad(key, () => api(`/ledgers/book?mode=${mode}&from=${from}&to=${to}`));
  const label = MODE_LABEL[mode].toLowerCase();

  if (book.error && !book.loading) return <p className="error" role="alert">{book.error}</p>;
  const d = book.data;
  if (!d) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="stats">
        <Money label={`Opening ${label}`} value={d.opening} />
        <Money label="Money in" value={d.totals.in} />
        <Money label="Money out" value={d.totals.out} />
        <Money label={`Closing ${label}`} value={d.closing} />
      </div>

      <section className="panel">
        <div className="table-wrap">
          <table className="table ledger-table stack-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th className="num">In</th>
                <th className="num">Out</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="opening-row">
                <td className="c-date nowrap">{niceDate(d.from, SHORT_DATE)}</td>
                <td className="c-desc">Opening balance</td>
                <td className="c-in" />
                <td className="c-out" />
                <td className={`c-bal num${d.opening < 0 ? ' red' : ''}`} data-label="Balance">{fmt(d.opening)}</td>
              </tr>
              {d.entries.map((e) => (
                <tr key={e.id} className={e.voided ? 'voided' : undefined} title={e.voided ? `Cancelled: ${e.void_reason}` : undefined}>
                  <td className="c-date nowrap"><Link to={`/day/${e.entry_date}`}>{niceDate(e.entry_date, SHORT_DATE)}</Link></td>
                  <td className="c-desc">
                    {e.description}
                    <EntrySub e={e} />
                  </td>
                  <td className="c-in money" data-label="In">{e.type === 'receipt' ? fmt(e.amount) : ''}</td>
                  <td className="c-out money" data-label="Out">{e.type === 'payment' ? fmt(e.amount) : ''}</td>
                  <td className={`c-bal num${e.running < 0 ? ' red' : ''}`} data-label="Balance">{fmt(e.running)}</td>
                </tr>
              ))}
              {!d.entries.length && <tr><td colSpan={5} className="empty">No {label} entries in these dates.</td></tr>}
            </tbody>
            <tfoot>
              <tr>
                <td className="c-desc" colSpan={2}>Closing balance</td>
                <td className="c-in num" data-label="In">{fmt(d.totals.in)}</td>
                <td className="c-out num" data-label="Out">{fmt(d.totals.out)}</td>
                <td className={`c-bal num${d.closing < 0 ? ' red' : ''}`} data-label="Balance">{fmt(d.closing)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </>
  );
}

// ---------- One category ----------

function CategoryPicker({ value, onChange }) {
  const cats = useLoad(() => api('/categories'), []);
  const list = cats.data || [];
  const group = (type) => list.filter((c) => c.type === type).map((c) => (
    <option key={c.id} value={c.id}>{c.name}{c.active ? '' : ' (inactive)'}</option>
  ));
  return (
    <label className="field grow">
      <span>Category</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={!cats.data}>
        <option value="">{cats.error ? 'Could not load categories' : cats.data ? 'Pick a category' : 'Loading…'}</option>
        <optgroup label="Money in">{group('receipt')}</optgroup>
        <optgroup label="Money out">{group('payment')}</optgroup>
      </select>
    </label>
  );
}

function CategoryTab({ categoryId, from, to }) {
  const key = categoryId ? `${categoryId}|${from}|${to}` : '';
  const led = useKeyedLoad(key, () => api(`/ledgers/category/${categoryId}?from=${from}&to=${to}`));

  if (!categoryId) return <p className="muted">Pick a category to see its entries.</p>;
  if (led.error && !led.loading) return <p className="error" role="alert">{led.error}</p>;
  const d = led.data;
  if (!d) return <p className="muted">Loading…</p>;

  return (
    <>
      <p className="print-only"><strong>{d.category.name}</strong> ({d.category.type === 'receipt' ? 'money in' : 'money out'})</p>
      <div className="stats">
        <Money label={`Total ${d.category.type === 'receipt' ? 'money in' : 'money out'}`} value={d.total} />
        <Money label="Of which credit" value={d.credit} red />
        <div className="stat"><span className="label">Entries</span><span className="value">{d.count}</span></div>
      </div>

      <section className="panel">
        <div className="table-wrap">
          <table className="table ledger-table stack-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th className="num">Amount</th>
                <th className="num">Running total</th>
              </tr>
            </thead>
            <tbody>
              {d.entries.map((e) => (
                <tr key={e.id} className={e.voided ? 'voided' : undefined} title={e.voided ? `Cancelled: ${e.void_reason}` : undefined}>
                  <td className="c-date nowrap"><Link to={`/day/${e.entry_date}`}>{niceDate(e.entry_date, SHORT_DATE)}</Link></td>
                  <td className="c-desc">
                    {e.description}
                    <EntrySub e={e} showMode />
                  </td>
                  <td className={`c-in money${e.mode === 'credit' ? ' red' : ''}`} data-label="Amount">{fmt(e.amount)}</td>
                  <td className="c-bal num" data-label="Running total">{fmt(e.running)}</td>
                </tr>
              ))}
              {!d.entries.length && <tr><td colSpan={4} className="empty">No entries in this category in these dates.</td></tr>}
            </tbody>
            {d.entries.length > 0 && (
              <tfoot>
                <tr>
                  <td className="c-desc" colSpan={2}>Total</td>
                  <td className="c-in num">{fmt(d.total)}</td>
                  <td className="c-bal" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </>
  );
}

// ---------- Who owes whom ----------

function BalancesTab() {
  const bal = useLoad(() => api('/ledgers/balances'), []);
  if (bal.error && !bal.loading) return <p className="error" role="alert">{bal.error}</p>;
  const d = bal.data;
  if (!d) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="stats">
        <Money label="They owe you (receivable)" value={d.total_receivable} />
        <Money label="You owe them (payable)" value={d.total_payable} red />
        <Money label="Difference" value={d.total_receivable - d.total_payable} />
      </div>
      <div className="two-col">
        <PeopleTable title="They owe you" rows={d.receivables} total={d.total_receivable} />
        <PeopleTable title="You owe them" rows={d.payables} total={d.total_payable} />
      </div>
    </>
  );
}

function PeopleTable({ title, rows, total }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Type</th><th className="num">Amount</th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={p.active ? undefined : 'inactive'}>
                <td>
                  <Link to={`/people/${p.id}`}>{p.name}</Link>
                  {!p.active && <> <span className="tag inactive">Inactive</span></>}
                </td>
                <td>{PERSON_TYPES[p.type]}</td>
                <td className={`money${p.balance < 0 ? ' red' : ''}`} title={balanceText(p.balance)}>{fmt(Math.abs(p.balance))}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={3} className="empty">No one.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr><td colSpan={2}>Total</td><td className="num">{fmt(total)}</td></tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

// ---------- Small pieces ----------

function Money({ label, value, red }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className={`value${(red && value) || value < 0 ? ' red' : ''}`}>Rs {fmt(value)}</span>
    </div>
  );
}

// Category, person and (optionally) mode under an entry's description; reason if cancelled.
function EntrySub({ e, showMode }) {
  const sub = [e.category_name, e.person_name].filter(Boolean).join(' · ');
  return (
    <>
      {sub && <span className="cell-sub">{sub}</span>}
      {showMode && e.mode !== 'cash' && <> <span className={`tag ${e.mode}`}>{MODE_LABEL[e.mode]}</span></>}
      {e.voided && <span className="void-note">Cancelled: {e.void_reason}</span>}
    </>
  );
}
