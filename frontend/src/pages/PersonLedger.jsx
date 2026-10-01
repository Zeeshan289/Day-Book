import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, useLoad } from '../api.js';
import { useAuth } from '../auth.jsx';
import EntryForm from '../components/EntryForm.jsx';
import Modal from '../components/Modal.jsx';
import PersonForm from '../components/PersonForm.jsx';
import { balanceText, fmt, MODE_LABEL, niceDate, personSide, PERSON_TYPES, statementBalanceText } from '../money.js';

const SHORT_DATE = { day: 'numeric', month: 'short', year: 'numeric' };

// from/to as a query string, e.g. "from=2026-09-01&to=2026-09-30" ('' when not filtered).
export function rangeQuery(from, to) {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  return q.toString();
}

export default function PersonLedger() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const qs = rangeQuery(from, to);

  const { user } = useAuth();
  const isOwner = user.role === 'owner';
  const settings = useLoad(() => api('/settings'), []);
  const ledger = useLoad(() => api(`/people/${id}/ledger?${qs}`), [id, qs]);
  const categories = useLoad(() => api('/categories'), []);
  const people = useLoad(() => api('/people'), []);
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(null); // 'receipt' or 'payment' while the payment form is open
  const [error, setError] = useState('');

  function setRange(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  async function setActive(active) {
    if (!active && !window.confirm(
      `Are you sure you want to deactivate ${ledger.data.person.name}? They will not be offered for new entries. Their past entries stay.`
    )) return;
    setError('');
    try {
      await api(`/people/${id}`, { method: 'PATCH', body: { active } });
      ledger.reload();
    } catch (err) {
      setError(err.message);
    }
  }

  if (ledger.error && !ledger.loading) {
    return (
      <>
        <p><Link to="/people">All people</Link></p>
        <p className="error" role="alert">{ledger.error}</p>
      </>
    );
  }
  // Only show data for this person and these dates (not the previous ones while loading).
  const d = ledger.data;
  if (!d || String(d.person.id) !== id || (d.from || '') !== from || (d.to || '') !== to) {
    return <p className="muted">Loading…</p>;
  }

  const { person, entries } = d;
  const today = settings.data?.today;
  const filtered = Boolean(from || to);

  return (
    <>
      <p className="no-print"><Link to="/people">All people</Link></p>

      <div className="page-head">
        <div>
          <h1>{person.name} {!person.active && <span className="tag inactive">Inactive</span>}</h1>
          <p className="sub">
            {PERSON_TYPES[person.type]}
            {person.phone && <> · {person.phone}</>}
            {person.notes && <> · {person.notes}</>}
          </p>
        </div>
        <div className="row-actions no-print">
          {person.active && today && (
            <>
              <button className="btn primary" onClick={() => setPaying('receipt')}>Receive payment</button>
              <button className="btn primary" onClick={() => setPaying('payment')}>Make payment</button>
            </>
          )}
          <Link className="btn" to={`/people/${id}/statement${qs ? `?${qs}` : ''}`}>Print statement</Link>
          {isOwner && (
            <>
              <button className="btn" onClick={() => setEditing(true)}>Edit details</button>
              {person.active
                ? <button className="btn danger" onClick={() => setActive(false)}>Deactivate</button>
                : <button className="btn" onClick={() => setActive(true)}>Activate</button>}
            </>
          )}
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="stats">
        <Stat label="Balance now" value={person.balance} />
        <Stat label={filtered ? 'At start of period' : 'Opening balance'} value={d.opening} />
        <Stat label={filtered ? 'At end of period' : 'Balance after last entry'} value={d.closing} />
        <div className="stat">
          <span className="label">Entries</span>
          <span className="value">{entries.filter((e) => !e.voided).length}</span>
        </div>
      </div>

      <div className="toolbar no-print">
        <label className="field">
          <span>From</span>
          <input type="date" value={from} max={to || today} onChange={(e) => setRange('from', e.target.value)} />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" value={to} min={from} max={today} onChange={(e) => setRange('to', e.target.value)} />
        </label>
        {filtered && <button className="btn ghost" onClick={() => setParams({}, { replace: true })}>Show all dates</button>}
      </div>

      <section className="panel">
        <p className="muted small-print">
          Given: money or goods you gave them (they owe more). Received: money or goods you got from them (they owe less).
        </p>
        <PersonTable data={d} />
      </section>

      {editing && (
        <Modal title="Edit person" onClose={() => setEditing(false)}>
          <PersonForm
            person={person}
            onSaved={() => { setEditing(false); ledger.reload(); }}
            onCancel={() => setEditing(false)}
          />
        </Modal>
      )}

      {paying && (
        <Modal
          title={paying === 'receipt' ? `Receive payment from ${person.name}` : `Make payment to ${person.name}`}
          onClose={() => setPaying(null)}
        >
          {(categories.error || people.error) && (
            <p className="error" role="alert">Could not load the categories or people list. Reload the page to try again.</p>
          )}
          <EntryForm
            date={today}
            canPickDate={isOwner}
            categories={categories.data || []}
            people={people.data || []}
            preset={{
              type: paying,
              mode: 'cash',
              person_id: String(person.id),
              description: paying === 'receipt' ? `Payment from ${person.name}` : `Payment to ${person.name}`,
            }}
            onSaved={() => { setPaying(null); ledger.reload(); }}
            onCancel={() => setPaying(null)}
          />
        </Modal>
      )}
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className={`value${value < -0.005 ? ' red' : ''}`}>{balanceText(value)}</span>
    </div>
  );
}

// The ledger table: opening row, entries with running balance, closing row.
// Used on this page and on the printed statement (which leaves out cancelled entries and links).
export function PersonTable({ data, forStatement = false }) {
  const { person, from, opening, closing } = data;
  const rows = forStatement ? data.entries.filter((e) => !e.voided) : data.entries;
  const live = data.entries.filter((e) => !e.voided);
  const total = (side) => live.filter((e) => personSide(e) === side).reduce((s, e) => s + e.amount, 0);
  const openingDate = from || person.opening_date;
  const balanceOf = forStatement ? statementBalanceText : balanceText;

  return (
    <div className="table-wrap">
      <table className="table person-ledger stack-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th className="num">Given</th>
            <th className="num">Received</th>
            <th className="num">Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr className="opening-row">
            <td className="c-date nowrap">{openingDate ? niceDate(openingDate, SHORT_DATE) : ''}</td>
            <td className="c-desc">{from ? 'Balance at start of period' : 'Opening balance'}</td>
            <td className="c-in" />
            <td className="c-out" />
            <td className={`c-bal num${opening < -0.005 ? ' red' : ''}`}>{balanceOf(opening)}</td>
          </tr>
          {rows.map((e) => {
            const side = personSide(e);
            const amount = <span className={e.mode === 'credit' ? 'red' : undefined}>{fmt(e.amount)}</span>;
            return (
              <tr key={e.id} className={e.voided ? 'voided' : undefined} title={e.voided ? `Cancelled: ${e.void_reason}` : undefined}>
                <td className="c-date nowrap">
                  {forStatement
                    ? niceDate(e.entry_date, SHORT_DATE)
                    : <Link to={`/day/${e.entry_date}`}>{niceDate(e.entry_date, SHORT_DATE)}</Link>}
                </td>
                <td className="c-desc">
                  {e.description}
                  {e.category_name && <span className="muted"> · {e.category_name}</span>}
                  {e.mode !== 'cash' && <> <span className={`tag ${e.mode}`}>{MODE_LABEL[e.mode]}</span></>}
                  {e.voided && <span className="void-note">Cancelled: {e.void_reason}</span>}
                </td>
                <td className="c-in money" data-label="Given">{side === 'given' ? amount : ''}</td>
                <td className="c-out money" data-label="Received">{side === 'received' ? amount : ''}</td>
                <td className={`c-bal num${e.running < -0.005 ? ' red' : ''}`}>{balanceOf(e.running)}</td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={5} className="empty">No entries in these dates.</td></tr>}
        </tbody>
        <tfoot>
          <tr>
            <td className="c-desc" colSpan={2}>Closing balance</td>
            <td className="c-in num" data-label="Given">{fmt(total('given'))}</td>
            <td className="c-out num" data-label="Received">{fmt(total('received'))}</td>
            <td className={`c-bal num${closing < -0.005 ? ' red' : ''}`}>{balanceOf(closing)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
