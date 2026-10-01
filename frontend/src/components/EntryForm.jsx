import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmt } from '../money.js';

const BLANK = {
  type: 'payment', description: '', category_id: '', person_id: '',
  qty: '', rate: '', amount: '', mode: 'cash', note: '',
};

function fromEntry(e) {
  const out = { ...BLANK };
  for (const k of Object.keys(BLANK)) out[k] = e[k] === null || e[k] === undefined ? '' : String(e[k]);
  return out;
}

// `preset` fills in a new entry (e.g. { type: 'receipt', person_id: '5' }); values must be strings.
export default function EntryForm({ entry, preset, date, canPickDate, categories, people, onSaved, onCancel }) {
  const [f, setF] = useState(() => (entry ? fromEntry(entry) : { ...BLANK, ...preset }));
  const [entryDate, setEntryDate] = useState(entry?.entry_date || date);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!entry) setEntryDate(date); }, [date, entry]);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const setType = (type) => setF((s) => ({ ...s, type, category_id: '' }));

  const hasQtyRate = f.qty !== '' && f.rate !== '';
  const computed = hasQtyRate ? Math.round(Number(f.qty) * Number(f.rate) * 100) / 100 : null;
  const cats = categories.filter((c) => c.type === f.type && (c.active || String(c.id) === f.category_id));
  const peopleList = people.filter((p) => p.active || String(p.id) === f.person_id);

  function pickCategory(e) {
    const id = e.target.value;
    const cat = categories.find((c) => String(c.id) === id);
    // "Credit Sale" style categories switch the mode to credit automatically.
    setF((s) => ({ ...s, category_id: id, mode: cat && /credit/i.test(cat.name) ? 'credit' : s.mode }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = { ...f, entry_date: entryDate, amount: computed ?? f.amount };
      const saved = entry
        ? await api(`/entries/${entry.id}`, { method: 'PUT', body })
        : await api('/entries', { method: 'POST', body });
      if (!entry) setF((s) => ({ ...BLANK, type: s.type }));
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="entry-form" onSubmit={submit}>
      <div className="side-toggle" role="group" aria-label="Money in or out">
        <button type="button" className={f.type === 'receipt' ? 'on in' : ''} onClick={() => setType('receipt')}>
          Money in
        </button>
        <button type="button" className={f.type === 'payment' ? 'on out' : ''} onClick={() => setType('payment')}>
          Money out
        </button>
      </div>

      <label className="field span-2">
        <span>What is it for?</span>
        <input value={f.description} onChange={set('description')} placeholder={f.type === 'receipt' ? 'e.g. Cash sale' : 'e.g. Fine flour, 4 bags'} required />
      </label>

      <label className="field">
        <span>Category</span>
        <select value={f.category_id} onChange={pickCategory}>
          <option value="">None</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>

      <label className="field">
        <span>Paid by</span>
        <select value={f.mode} onChange={set('mode')}>
          <option value="cash">Cash</option>
          <option value="bank">Bank</option>
          <option value="credit">Credit (not paid yet)</option>
        </select>
      </label>

      <label className="field">
        <span>Qty <small>(optional)</small></span>
        <input type="number" step="any" min="0" inputMode="decimal" value={f.qty} onChange={set('qty')} />
      </label>

      <label className="field">
        <span>Rate <small>(optional)</small></span>
        <input type="number" step="any" min="0" inputMode="decimal" value={f.rate} onChange={set('rate')} />
      </label>

      <label className="field">
        <span>Amount (Rs)</span>
        {hasQtyRate
          ? <output className="computed">{fmt(computed)}</output>
          : <input type="number" step="0.01" min="0" inputMode="decimal" value={f.amount} onChange={set('amount')} required />}
      </label>

      <label className="field">
        <span>Person {f.mode === 'credit' ? <small>(required)</small> : <small>(optional)</small>}</span>
        <select value={f.person_id} onChange={set('person_id')} required={f.mode === 'credit'}>
          <option value="">None</option>
          {peopleList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>

      {canPickDate && (
        <label className="field">
          <span>Date</span>
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
        </label>
      )}

      <label className="field span-2">
        <span>Note <small>(optional)</small></span>
        <input value={f.note} onChange={set('note')} />
      </label>

      {error && <p className="error span-all" role="alert">{error}</p>}

      <div className="actions span-all">
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Close</button>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : entry ? 'Save changes' : f.type === 'receipt' ? 'Add money in' : 'Add money out'}
        </button>
      </div>
    </form>
  );
}
