import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useLoad } from '../api.js';
import PersonForm from '../components/PersonForm.jsx';
import { balanceText, PERSON_TYPES } from '../money.js';

export default function People() {
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState('');

  const people = useLoad(() => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (q.trim()) params.set('q', q.trim());
    return api(`/people?${params}`);
  }, [type, q]);

  function saved(p) {
    setAdding(false);
    setAdded(`${p.name} was added.`);
    people.reload();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>People</h1>
          <p className="sub">Staff, credit customers and suppliers, with what they owe or are owed.</p>
        </div>
        {!adding && <button className="btn primary" onClick={() => { setAdding(true); setAdded(''); }}>Add person</button>}
      </div>

      {adding && (
        <section className="panel">
          <h2>New person</h2>
          <PersonForm onSaved={saved} onCancel={() => setAdding(false)} />
        </section>
      )}
      {added && <p className="notice" role="status">{added}</p>}

      <div className="toolbar">
        <label className="field">
          <span>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All</option>
            {Object.entries(PERSON_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field grow">
          <span>Search by name</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {people.error && <p className="error" role="alert">{people.error}</p>}

      <section className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Phone</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {people.data?.map((p) => (
                <tr key={p.id} className={p.active ? undefined : 'inactive'}>
                  <td>
                    <Link to={`/people/${p.id}`}>{p.name}</Link>
                    {!p.active && <> <span className="tag inactive">Inactive</span></>}
                  </td>
                  <td>{PERSON_TYPES[p.type]}</td>
                  <td>{p.phone}</td>
                  <td className={`num${p.balance < -0.005 ? ' red' : ''}`}>{balanceText(p.balance)}</td>
                </tr>
              ))}
              {people.data && !people.data.length && (
                <tr><td colSpan={4} className="empty">No one found.</td></tr>
              )}
              {!people.data && !people.error && (
                <tr><td colSpan={4} className="empty">Loading…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
