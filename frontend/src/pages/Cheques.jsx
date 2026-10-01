import { useState } from 'react';
import { api, useLoad } from '../api.js';
import { useAuth } from '../auth.jsx';
import Modal from '../components/Modal.jsx';
import { fmt, niceDate } from '../money.js';

const SHORT_DATE = { day: 'numeric', month: 'short', year: 'numeric' };
const STATUS_LABEL = { pending: 'Pending', cleared: 'Cleared', bounced: 'Bounced', cancelled: 'Cancelled' };
const DIRECTION_LABEL = { received: 'Received', issued: 'Issued' };

// Whole days from `a` to `b` (both 'YYYY-MM-DD').
function daysBetween(a, b) {
  const t = (d) => Date.UTC(...d.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)));
  return Math.round((t(b) - t(a)) / 86400000);
}

// Pending cheques due within 3 days, or already past their date.
function dueInfo(c, today) {
  if (c.status !== 'pending' || !today) return null;
  const days = daysBetween(today, c.cheque_date);
  if (days < 0) return { cls: 'overdue', text: `Overdue by ${-days} day${days === -1 ? '' : 's'}` };
  if (days === 0) return { cls: 'due', text: 'Due today' };
  if (days <= 3) return { cls: 'due', text: `Due in ${days} day${days === 1 ? '' : 's'}` };
  return null;
}

export default function Cheques() {
  const { user } = useAuth();
  const isOwner = user.role === 'owner';
  const [status, setStatus] = useState('');
  const [direction, setDirection] = useState('');
  const [adding, setAdding] = useState(false);
  const [clearing, setClearing] = useState(null); // cheque being marked cleared
  const [error, setError] = useState('');

  const settings = useLoad(() => api('/settings'), []);
  const today = settings.data?.today;
  const cheques = useLoad(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (direction) params.set('direction', direction);
    return api(`/cheques?${params}`);
  }, [status, direction]);
  const people = useLoad(() => api('/people?active=1'), []);
  const categories = useLoad(() => api('/categories'), []);

  async function setChequeStatus(c, newStatus) {
    const label = STATUS_LABEL[newStatus].toLowerCase();
    if (!window.confirm(`Mark cheque #${c.cheque_no} (Rs ${fmt(c.amount)}) as ${label}?`)) return;
    setError('');
    try {
      await api(`/cheques/${c.id}/status`, { method: 'POST', body: { status: newStatus } });
      cheques.reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cheques</h1>
          <p className="sub">Cheques received and issued. Pending ones due within 3 days are highlighted.</p>
        </div>
        {!adding && <button className="btn primary" onClick={() => setAdding(true)}>Add cheque</button>}
      </div>

      {adding && (
        <section className="panel">
          <h2>New cheque</h2>
          <ChequeForm
            people={people.data || []}
            today={today}
            onSaved={() => { setAdding(false); cheques.reload(); }}
            onCancel={() => setAdding(false)}
          />
        </section>
      )}

      <div className="toolbar">
        <label className="field">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Direction</span>
          <select value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="">All</option>
            {Object.entries(DIRECTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>

      {(error || cheques.error) && <p className="error" role="alert">{error || cheques.error}</p>}

      <section className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cheque date</th>
                <th>Cheque</th>
                <th>From / to</th>
                <th>Direction</th>
                <th className="num">Amount</th>
                <th>Status</th>
                {isOwner && <th><span className="visually-hidden">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {cheques.data?.map((c) => {
                const due = dueInfo(c, today);
                return (
                  <tr key={c.id} className={due?.cls}>
                    <td className="nowrap">
                      {niceDate(c.cheque_date, SHORT_DATE)}
                      {due && <span className="due-note">{due.text}</span>}
                    </td>
                    <td>
                      #{c.cheque_no}
                      {c.bank_name && <span className="muted"> · {c.bank_name}</span>}
                      {c.note && <span className="due-note muted">{c.note}</span>}
                    </td>
                    <td>
                      {c.party_name}
                      {c.person_name && c.person_name !== c.party_name && <span className="muted"> ({c.person_name})</span>}
                    </td>
                    <td>{DIRECTION_LABEL[c.direction]}</td>
                    <td className="money">{fmt(c.amount)}</td>
                    <td>
                      <span className={`tag ${c.status}`}>{STATUS_LABEL[c.status]}</span>
                      {c.entry_id && <span className="due-note muted">In day book</span>}
                    </td>
                    {isOwner && (
                      <td>
                        {c.status === 'pending' && (
                          <div className="row-actions">
                            <button className="btn small" onClick={() => { setError(''); setClearing(c); }}>Cleared</button>
                            <button className="btn small danger" onClick={() => setChequeStatus(c, 'bounced')}>Bounced</button>
                            <button className="btn small" onClick={() => setChequeStatus(c, 'cancelled')}>Cancelled</button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {cheques.data && !cheques.data.length && (
                <tr><td colSpan={isOwner ? 7 : 6} className="empty">No cheques found.</td></tr>
              )}
              {!cheques.data && !cheques.error && (
                <tr><td colSpan={isOwner ? 7 : 6} className="empty">Loading…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {clearing && (
        <ClearDialog
          cheque={clearing}
          categories={categories.data || []}
          onClose={() => setClearing(null)}
          onDone={() => { setClearing(null); cheques.reload(); }}
        />
      )}
    </>
  );
}

function ChequeForm({ people, today, onSaved, onCancel }) {
  const [f, setF] = useState({
    direction: 'received', cheque_no: '', bank_name: '', party_name: '', person_id: '',
    amount: '', cheque_date: today || '', note: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  // Picking a person fills in the party name if it is still empty.
  function pickPerson(e) {
    const id = e.target.value;
    const p = people.find((x) => String(x.id) === id);
    setF((s) => ({ ...s, person_id: id, party_name: s.party_name || p?.name || '' }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/cheques', { method: 'POST', body: f });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="form-grid">
        <label className="field">
          <span>Direction</span>
          <select value={f.direction} onChange={set('direction')}>
            <option value="received">Received (money coming in)</option>
            <option value="issued">Issued (money going out)</option>
          </select>
        </label>
        <label className="field">
          <span>Cheque number</span>
          <input value={f.cheque_no} onChange={set('cheque_no')} required />
        </label>
        <label className="field">
          <span>Bank <small>(optional)</small></span>
          <input value={f.bank_name} onChange={set('bank_name')} />
        </label>
        <label className="field">
          <span>Person <small>(optional)</small></span>
          <select value={f.person_id} onChange={pickPerson}>
            <option value="">None</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{f.direction === 'received' ? 'From' : 'To'}</span>
          <input value={f.party_name} onChange={set('party_name')} required />
        </label>
        <label className="field">
          <span>Amount (Rs)</span>
          <input type="number" step="0.01" min="0" inputMode="decimal" value={f.amount} onChange={set('amount')} required />
        </label>
        <label className="field">
          <span>Cheque date</span>
          <input type="date" value={f.cheque_date} onChange={set('cheque_date')} required />
        </label>
        <label className="field">
          <span>Note <small>(optional)</small></span>
          <input value={f.note} onChange={set('note')} />
        </label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Add cheque'}</button>
      </div>
    </form>
  );
}

function ClearDialog({ cheque, categories, onClose, onDone }) {
  const type = cheque.direction === 'received' ? 'receipt' : 'payment';
  const [addEntry, setAddEntry] = useState(!cheque.entry_id);
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api(`/cheques/${cheque.id}/status`, {
        method: 'POST',
        body: { status: 'cleared', add_entry: addEntry, category_id: addEntry && categoryId ? categoryId : undefined },
      });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Cheque cleared" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p>
          Cheque #{cheque.cheque_no} {cheque.direction === 'received' ? 'from' : 'to'} {cheque.party_name},
          Rs {fmt(cheque.amount)}.
        </p>
        {!cheque.entry_id && (
          <label className="field check">
            <input type="checkbox" checked={addEntry} onChange={(e) => setAddEntry(e.target.checked)} />
            <span>Add to today&apos;s day book as a bank {type === 'receipt' ? 'receipt' : 'payment'}?</span>
          </label>
        )}
        {addEntry && (
          <label className="field">
            <span>Category <small>(optional)</small></span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">None</option>
              {categories.filter((c) => c.type === type && c.active).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Mark as cleared'}</button>
        </div>
      </form>
    </Modal>
  );
}
