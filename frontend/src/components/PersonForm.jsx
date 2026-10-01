import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PERSON_TYPES } from '../money.js';

// Add a new person, or edit one (owner only) when `person` is given.
// Only the owner sees (and can send) the opening balance.
export default function PersonForm({ person, onSaved, onCancel }) {
  const { user } = useAuth();
  const isOwner = user.role === 'owner';
  const opening = person?.opening_balance || 0;
  const [f, setF] = useState({
    name: person?.name || '',
    type: person?.type || 'customer',
    phone: person?.phone || '',
    notes: person?.notes || '',
    // Opening balance as an amount plus who owes it, so nobody has to type a minus sign.
    opening_amount: opening ? String(Math.abs(opening)) : '',
    opening_side: opening < 0 ? 'we_owe' : 'they_owe',
    opening_date: person?.opening_date || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const body = { name: f.name, type: f.type, phone: f.phone, notes: f.notes };
    if (isOwner) {
      const amount = Number(f.opening_amount || 0);
      body.opening_balance = f.opening_side === 'we_owe' ? -amount : amount;
      body.opening_date = f.opening_date || null;
    }
    try {
      const saved = person
        ? await api(`/people/${person.id}`, { method: 'PATCH', body })
        : await api('/people', { method: 'POST', body });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="form-grid">
        <label className="field">
          <span>Name</span>
          <input value={f.name} onChange={set('name')} required autoFocus />
        </label>
        <label className="field">
          <span>Type</span>
          <select value={f.type} onChange={set('type')}>
            {Object.entries(PERSON_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Phone <small>(optional)</small></span>
          <input type="tel" value={f.phone} onChange={set('phone')} />
        </label>
        <label className="field">
          <span>Notes <small>(optional)</small></span>
          <input value={f.notes} onChange={set('notes')} />
        </label>
      </div>

      {isOwner && (
        <fieldset className="opening">
          <legend>Opening balance <small>(what was owed before this book)</small></legend>
          <div className="form-grid">
            <label className="field">
              <span>Amount (Rs)</span>
              <input type="number" step="0.01" min="0" inputMode="decimal" value={f.opening_amount} onChange={set('opening_amount')} placeholder="0" />
            </label>
            <label className="field">
              <span>Who owes</span>
              <select value={f.opening_side} onChange={set('opening_side')}>
                <option value="they_owe">They owe us</option>
                <option value="we_owe">We owe them</option>
              </select>
            </label>
            <label className="field">
              <span>As of date <small>(empty = book start)</small></span>
              <input type="date" value={f.opening_date} onChange={set('opening_date')} />
            </label>
          </div>
        </fieldset>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : person ? 'Save changes' : 'Add person'}
        </button>
      </div>
    </form>
  );
}
