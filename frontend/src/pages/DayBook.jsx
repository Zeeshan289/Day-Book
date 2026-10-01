import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, useLoad } from '../api.js';
import { useAuth } from '../auth.jsx';
import Amount from '../components/Amount.jsx';
import EntryForm from '../components/EntryForm.jsx';
import Modal from '../components/Modal.jsx';
import { addDays, fmt, isRealDate, MODE_LABEL, niceDate } from '../money.js';

const MIN_LINES = 12; // each page shows at least this many ruled lines

// Same rule as the server: owner can change anything,
// cashier only their own entries from today that are not cancelled.
function canModify(entry, user, today) {
  if (entry.voided) return false;
  if (user.role === 'owner') return true;
  return entry.created_by === user.id && entry.entry_date === today;
}

export default function DayBook() {
  const { date: dateParam } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOwner = user.role === 'owner';

  const settings = useLoad(() => api('/settings'), []);
  const today = settings.data?.today;
  const date = dateParam || today;
  // A date in the address that is not real, or is after today, goes back to today's page.
  const badDate = Boolean(dateParam) && (!isRealDate(dateParam) || (today && dateParam > today));

  const book = useLoad(
    () => (date && today && !badDate ? api(`/daybook/${date}`) : Promise.resolve(null)),
    [date, today, badDate]
  );
  const categories = useLoad(() => api('/categories'), []);
  const people = useLoad(() => api('/people'), []);

  const [open, setOpen] = useState(null); // entry shown in the modal

  if (settings.error) return <p className="error" role="alert">{settings.error}</p>;
  if (!settings.data) return <p className="muted">Loading…</p>;
  if (badDate) return <Navigate to="/" replace />;

  const startDate = settings.data.start_date;
  const goTo = (d) => d && navigate(`/day/${d}`);
  const canAdd = isOwner || date === today;
  const d = book.data?.date === date ? book.data : null;
  // The entry form needs these lists; say so if they did not load.
  const listsError = [categories.error && 'categories', people.error && 'people list'].filter(Boolean).join(' and ');

  function saved(entry) {
    setOpen(null);
    // Owner may have saved to another date: go there so they can see it.
    if (entry && entry.entry_date !== date) goTo(entry.entry_date);
    else book.reload();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="print-only muted">{settings.data.business_name}: day book</p>
          <h1>{niceDate(date)}</h1>
          {date === today && <p className="sub">Today</p>}
        </div>
        <div className="date-bar no-print">
          <button className="btn" onClick={() => goTo(addDays(date, -1))} disabled={date <= startDate}>
            Previous day
          </button>
          <label className="visually-hidden" htmlFor="pick-date">Pick a date</label>
          <input
            id="pick-date" type="date" value={date} min={startDate} max={today}
            onChange={(e) => goTo(e.target.value)}
          />
          <button className="btn" onClick={() => goTo(addDays(date, 1))} disabled={date >= today}>
            Next day
          </button>
          {date !== today && <button className="btn" onClick={() => goTo(today)}>Today</button>}
          <button className="btn ghost" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      {book.error && <p className="error" role="alert">{book.error}</p>}

      {d && (
        <div className="stats" aria-label="Balances for the day">
          <Stat label="Opening cash" value={d.opening.cash} />
          <Stat label="Opening bank" value={d.opening.bank} />
          <Stat label="Closing cash" value={d.closing.cash} />
          <Stat label="Closing bank" value={d.closing.bank} />
          <Stat label="Credit sales" value={d.totals.receipt.credit} red />
          <Stat label="Credit purchases" value={d.totals.payment.credit} red />
        </div>
      )}

      {canAdd && d && (
        <section className="panel new-entry no-print">
          <h2>New entry</h2>
          {listsError && <p className="error" role="alert">Could not load the {listsError}. Reload the page to try again.</p>}
          <EntryForm
            date={date}
            canPickDate={isOwner}
            categories={categories.data || []}
            people={people.data || []}
            onSaved={saved}
          />
        </section>
      )}

      {d ? (
        <Spread book={d} onOpen={setOpen} isClickable={(e) => isOwner || canModify(e, user, today)} />
      ) : (
        !book.error && <p className="muted">Loading…</p>
      )}

      {open && (
        <EntryDialog
          entry={open}
          editable={canModify(open, user, today)}
          isOwner={isOwner}
          categories={categories.data || []}
          people={people.data || []}
          onClose={() => setOpen(null)}
          onSaved={saved}
        />
      )}
    </>
  );
}

function Stat({ label, value, red }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className={`value${red && value ? ' red' : ''}${value < 0 ? ' neg' : ''}`}>Rs {fmt(value)}</span>
    </div>
  );
}

// ---------- The ledger spread: Receipts on the left page, Payments on the right ----------

function Spread({ book, onOpen, isClickable }) {
  const receipts = book.entries.filter((e) => e.type === 'receipt');
  const payments = book.entries.filter((e) => e.type === 'payment');
  const bf = book.opening.cash + book.opening.bank;
  const cf = book.closing.cash + book.closing.bank;
  const { receipt: r, payment: p } = book.totals;

  // Both pages add up to the same total, like the paper book.
  const receiptTotal = bf + r.cash + r.bank;
  const paymentTotal = p.cash + p.bank + cf;

  // Pad both pages to the same number of lines (b/f and c/f take one line each).
  const lines = Math.max(MIN_LINES, receipts.length + 1, payments.length + 1);

  return (
    <div className="spread">
      <Sheet title="Receipts" total={receiptTotal}>
        <tr className="bf">
          <td className="desc">Balance b/f</td>
          <td className="mode" />
          <Amount value={bf} />
        </tr>
        {receipts.map((e) => <Row key={e.id} entry={e} onOpen={onOpen} clickable={isClickable(e)} />)}
        <Filler count={lines - 1 - receipts.length} />
      </Sheet>

      <Sheet title="Payments" total={paymentTotal}>
        {payments.map((e) => <Row key={e.id} entry={e} onOpen={onOpen} clickable={isClickable(e)} />)}
        <Filler count={lines - 1 - payments.length} />
        <tr className="cf">
          <td className="desc">Balance c/f</td>
          <td className="mode" />
          <Amount value={cf} />
        </tr>
      </Sheet>
    </div>
  );
}

function Sheet({ title, total, children }) {
  return (
    <section className="sheet" aria-label={title}>
      <h2>{title}</h2>
      <table className="ledger">
        <colgroup>
          <col />
          <col className="c-mode" />
          <col className="c-rs" />
          <col className="c-ps" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Description</th>
            <th scope="col"><span className="visually-hidden">Mode</span></th>
            <th scope="col" className="rs">Rs.</th>
            <th scope="col" className="ps">Ps.</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
        <tfoot>
          <tr>
            <td className="desc">Total</td>
            <td className="mode" />
            <Amount value={total} />
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

function Row({ entry: e, onOpen, clickable }) {
  const sub = [
    e.category_name,
    e.person_name,
    e.qty !== null && e.rate !== null ? `${fmt(e.qty)} × ${fmt(e.rate)}` : null,
  ].filter(Boolean).join(' · ');

  const classes = [e.mode === 'credit' && 'credit', e.voided && 'voided', clickable && 'clickable'].filter(Boolean).join(' ');
  const open = () => onOpen(e);

  return (
    <tr
      className={classes || undefined}
      title={e.voided ? `Cancelled: ${e.void_reason}` : e.note || undefined}
      {...(clickable && {
        tabIndex: 0,
        onClick: open,
        onKeyDown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } },
      })}
    >
      <td className="desc">
        <span className="main-text">{e.description}</span>
        {sub && <span className="sub">{sub}</span>}
        {e.voided && <span className="void-note">Cancelled: {e.void_reason}</span>}
      </td>
      <td className="mode">
        {e.mode !== 'cash' && <span className={`tag ${e.mode}`}>{MODE_LABEL[e.mode]}</span>}
      </td>
      <Amount value={e.amount} />
    </tr>
  );
}

function Filler({ count }) {
  return Array.from({ length: Math.max(0, count) }, (_, i) => (
    <tr key={`f${i}`} className="filler" aria-hidden="true">
      <td className="desc" />
      <td className="mode" />
      <Amount value={null} />
    </tr>
  ));
}

// ---------- Modal: edit, cancel, history ----------

function EntryDialog({ entry, editable, isOwner, categories, people, onClose, onSaved }) {
  const [view, setView] = useState(editable ? 'edit' : 'history');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function cancelEntry(ev) {
    ev.preventDefault();
    setError('');
    setBusy(true);
    try {
      const e = await api(`/entries/${entry.id}/void`, { method: 'POST', body: { reason } });
      onSaved(e);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const title = entry.voided ? 'Cancelled entry' : editable ? 'Edit entry' : 'Entry';

  return (
    <Modal title={title} onClose={onClose} wide={view === 'history'}>
      {entry.voided && (
        <p><strong>{entry.description}</strong>, Rs {fmt(entry.amount)}. <span className="red">Cancelled: {entry.void_reason}</span></p>
      )}

      {view === 'edit' && (
        <>
          <EntryForm
            entry={entry}
            categories={categories}
            people={people}
            canPickDate={isOwner}
            onSaved={onSaved}
            onCancel={onClose}
          />
          <div className="modal-section actions">
            {isOwner && <button className="btn ghost" onClick={() => setView('history')}>History</button>}
            <button className="btn danger" onClick={() => setView('void')}>Cancel entry</button>
          </div>
        </>
      )}

      {view === 'void' && (
        <form className="stack" onSubmit={cancelEntry}>
          <p>
            Cancel <strong>{entry.description}</strong> (Rs {fmt(entry.amount)})? It stays in the book, struck through,
            and is left out of all totals.
          </p>
          <label className="field">
            <span>Why is it being cancelled?</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus required />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <button type="button" className="btn ghost" onClick={() => setView('edit')}>Keep entry</button>
            <button className="btn primary" disabled={busy}>{busy ? 'Cancelling…' : 'Cancel entry'}</button>
          </div>
        </form>
      )}

      {view === 'history' && (
        <>
          {isOwner ? <History entryId={entry.id} categories={categories} people={people} /> : null}
          <div className="modal-section actions">
            {editable && <button className="btn ghost" onClick={() => setView('edit')}>Back to edit</button>}
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </>
      )}
    </Modal>
  );
}

const FIELD_LABELS = {
  entry_date: 'Date', type: 'Side', description: 'Description', category_id: 'Category', person_id: 'Person',
  qty: 'Qty', rate: 'Rate', amount: 'Amount', mode: 'Mode', note: 'Note',
};

function History({ entryId, categories, people }) {
  const rows = useLoad(() => api(`/entries/${entryId}/history`), [entryId]);

  const show = (k, v) => {
    if (v === null || v === undefined || v === '') return '(empty)';
    if (k === 'category_id') return categories.find((c) => c.id === v)?.name || `#${v}`;
    if (k === 'person_id') return people.find((p) => p.id === v)?.name || `#${v}`;
    if (k === 'type') return v === 'receipt' ? 'Money in' : 'Money out';
    if (k === 'mode') return MODE_LABEL[v] || v;
    if (k === 'amount' || k === 'rate') return `Rs ${fmt(v)}`;
    return String(v);
  };

  function describe(a) {
    if (a.action === 'create') return `Added: ${a.new_data.description}, Rs ${fmt(a.new_data.amount)} (${MODE_LABEL[a.new_data.mode]})`;
    if (a.action === 'void') return `Cancelled: ${a.new_data.void_reason}`;
    const changes = Object.keys(FIELD_LABELS)
      .filter((k) => String(a.old_data?.[k] ?? '') !== String(a.new_data?.[k] ?? ''))
      .map((k) => `${FIELD_LABELS[k]}: ${show(k, a.old_data?.[k])} → ${show(k, a.new_data?.[k])}`);
    return changes.length ? changes.join('; ') : 'Saved with no changes';
  }

  if (rows.error) return <p className="error" role="alert">{rows.error}</p>;
  if (!rows.data) return <p className="muted">Loading…</p>;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>When</th><th>Who</th><th>What changed</th></tr>
        </thead>
        <tbody>
          {rows.data.map((a) => (
            <tr key={a.id}>
              <td className="nowrap">{new Date(a.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</td>
              <td>{a.user_name || 'Unknown'}</td>
              <td>{describe(a)}</td>
            </tr>
          ))}
          {!rows.data.length && <tr><td colSpan={3} className="empty">No history yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
