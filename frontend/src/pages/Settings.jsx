import { useState } from 'react';
import { api, useLoad } from '../api.js';
import { useAuth } from '../auth.jsx';
import Modal from '../components/Modal.jsx';
import { fmt } from '../money.js';

export default function Settings() {
  const { user } = useAuth();
  const isOwner = user.role === 'owner';

  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
      </div>
      <ChangePassword />
      {isOwner && (
        <>
          <BusinessSettings />
          <Categories />
          <Users me={user} />
          <RecentChanges />
        </>
      )}
    </>
  );
}

// ---------- Everyone: change own password ----------

function ChangePassword() {
  const [f, setF] = useState({ current_password: '', new_password: '', confirm: '' });
  const [msg, setMsg] = useState({ error: '', ok: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (f.new_password !== f.confirm) return setMsg({ error: 'The new passwords do not match.', ok: '' });
    setMsg({ error: '', ok: '' });
    setBusy(true);
    try {
      const d = await api('/auth/change-password', { method: 'POST', body: { current_password: f.current_password, new_password: f.new_password } });
      // Old logins stop working after a password change; keep this one with the new token.
      localStorage.setItem('token', d.token);
      setF({ current_password: '', new_password: '', confirm: '' });
      setMsg({ error: '', ok: 'Password changed.' });
    } catch (err) {
      setMsg({ error: err.message, ok: '' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Change your password</h2>
      <form className="stack" onSubmit={submit}>
        <div className="form-grid">
          <label className="field">
            <span>Current password</span>
            <input type="password" autoComplete="current-password" value={f.current_password} onChange={set('current_password')} required />
          </label>
          <label className="field">
            <span>New password <small>(at least 6 characters)</small></span>
            <input type="password" autoComplete="new-password" minLength={6} value={f.new_password} onChange={set('new_password')} required />
          </label>
          <label className="field">
            <span>New password again</span>
            <input type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} required />
          </label>
        </div>
        {msg.error && <p className="error" role="alert">{msg.error}</p>}
        {msg.ok && <p className="notice" role="status">{msg.ok}</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
        </div>
      </form>
    </section>
  );
}

// ---------- Owner: business name, start date, opening balances ----------

function BusinessSettings() {
  const settings = useLoad(() => api('/settings'), []);
  if (settings.error) return <section className="panel"><h2>Business</h2><p className="error" role="alert">{settings.error}</p></section>;
  if (!settings.data) return <section className="panel"><h2>Business</h2><p className="muted">Loading…</p></section>;
  return <BusinessForm initial={settings.data} />;
}

function BusinessForm({ initial }) {
  const [f, setF] = useState({
    business_name: initial.business_name,
    start_date: initial.start_date,
    opening_cash: String(initial.opening_cash),
    opening_bank: String(initial.opening_bank),
  });
  const [msg, setMsg] = useState({ error: '', ok: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setMsg({ error: '', ok: '' });
    setBusy(true);
    try {
      await api('/settings', { method: 'PUT', body: f });
      window.dispatchEvent(new Event('settings:changed')); // top bar shows the new name
      setMsg({ error: '', ok: 'Settings saved. Balances are worked out again from the new figures.' });
    } catch (err) {
      setMsg({ error: err.message, ok: '' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Business</h2>
      <form className="stack" onSubmit={submit}>
        <div className="form-grid">
          <label className="field">
            <span>Business name</span>
            <input value={f.business_name} onChange={set('business_name')} required />
          </label>
          <label className="field">
            <span>Book starts on</span>
            <input type="date" value={f.start_date} onChange={set('start_date')} required />
          </label>
          <label className="field">
            <span>Opening cash (Rs)</span>
            <input type="number" step="0.01" inputMode="decimal" value={f.opening_cash} onChange={set('opening_cash')} />
          </label>
          <label className="field">
            <span>Opening bank (Rs)</span>
            <input type="number" step="0.01" inputMode="decimal" value={f.opening_bank} onChange={set('opening_bank')} />
          </label>
        </div>
        <p className="muted">Opening cash and bank are the amounts in hand on the day the book starts.</p>
        {msg.error && <p className="error" role="alert">{msg.error}</p>}
        {msg.ok && <p className="notice" role="status">{msg.ok}</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
        </div>
      </form>
    </section>
  );
}

// ---------- Owner: categories ----------

function Categories() {
  const cats = useLoad(() => api('/categories'), []);
  const [name, setName] = useState('');
  const [type, setType] = useState('payment');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/categories', { method: 'POST', body: { name, type } });
      setName('');
      cats.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function update(c, body) {
    setError('');
    try {
      await api(`/categories/${c.id}`, { method: 'PATCH', body });
      cats.reload();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  const list = cats.data || [];

  return (
    <section className="panel">
      <h2>Categories</h2>
      <form className="toolbar" onSubmit={add}>
        <label className="field grow">
          <span>New category</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field">
          <span>Side</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="receipt">Money in</option>
            <option value="payment">Money out</option>
          </select>
        </label>
        <button className="btn primary" disabled={busy}>Add category</button>
      </form>
      {(error || cats.error) && <p className="error" role="alert">{error || cats.error}</p>}

      {!cats.data && !cats.error && <p className="muted">Loading…</p>}
      {cats.data && (
        <div className="two-col">
          <CategoryList title="Money in" items={list.filter((c) => c.type === 'receipt')} onUpdate={update} />
          <CategoryList title="Money out" items={list.filter((c) => c.type === 'payment')} onUpdate={update} />
        </div>
      )}
    </section>
  );
}

function CategoryList({ title, items, onUpdate }) {
  const [editing, setEditing] = useState(null); // category id being renamed
  const [draft, setDraft] = useState('');

  async function saveName(e, c) {
    e.preventDefault();
    if (await onUpdate(c, { name: draft })) setEditing(null);
  }

  return (
    <div>
      <h3>{title}</h3>
      <ul className="cat-list">
        {items.map((c) => (
          <li key={c.id} className={c.active ? undefined : 'inactive'}>
            {editing === c.id ? (
              <form className="row-actions" onSubmit={(e) => saveName(e, c)}>
                <input aria-label="Category name" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus required />
                <button className="btn small primary">Save</button>
                <button type="button" className="btn small ghost" onClick={() => setEditing(null)}>Cancel</button>
              </form>
            ) : (
              <>
                <span className="name">{c.name}</span>
                <span className="row-actions">
                  <button className="btn small ghost" onClick={() => { setEditing(c.id); setDraft(c.name); }}>Rename</button>
                  <button className="btn small" onClick={() => onUpdate(c, { active: !c.active })}>
                    {c.active ? 'Deactivate' : 'Activate'}
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
        {!items.length && <li className="muted">No categories yet.</li>}
      </ul>
    </div>
  );
}

// ---------- Owner: users ----------

function Users({ me }) {
  const users = useLoad(() => api('/users'), []);
  const [f, setF] = useState({ name: '', username: '', password: '', role: 'cashier' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetFor, setResetFor] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function add(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/users', { method: 'POST', body: f });
      setF({ name: '', username: '', password: '', role: 'cashier' });
      users.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setActive(u, active) {
    setError('');
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body: { active } });
      users.reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="panel">
      <h2>Users</h2>
      <form className="stack" onSubmit={add}>
        <div className="form-grid">
          <label className="field">
            <span>Name</span>
            <input value={f.name} onChange={set('name')} required />
          </label>
          <label className="field">
            <span>Username</span>
            <input value={f.username} onChange={set('username')} autoComplete="off" required />
          </label>
          <label className="field">
            <span>Password <small>(at least 6 characters)</small></span>
            <input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" minLength={6} required />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={f.role} onChange={set('role')}>
              <option value="cashier">Cashier</option>
              <option value="owner">Owner</option>
            </select>
          </label>
        </div>
        <div className="actions">
          <button className="btn primary" disabled={busy}>{busy ? 'Adding…' : 'Add user'}</button>
        </div>
      </form>
      {(error || users.error) && <p className="error" role="alert">{error || users.error}</p>}

      <div className="table-wrap spaced">
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Username</th><th>Role</th><th><span className="visually-hidden">Actions</span></th></tr>
          </thead>
          <tbody>
            {users.data?.map((u) => (
              <tr key={u.id} className={u.active ? undefined : 'inactive'}>
                <td>
                  {u.name} {u.id === me.id && <small className="muted">(you)</small>}
                  {!u.active && <> <span className="tag inactive">Inactive</span></>}
                </td>
                <td>{u.username}</td>
                <td>{u.role === 'owner' ? 'Owner' : 'Cashier'}</td>
                <td>
                  <div className="row-actions">
                    <button className="btn small ghost" onClick={() => setResetFor(u)}>Reset password</button>
                    {u.id !== me.id && (
                      <button className="btn small" onClick={() => setActive(u, !u.active)}>
                        {u.active ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.data && !users.data.length && <tr><td colSpan={4} className="empty">No users yet.</td></tr>}
            {!users.data && !users.error && <tr><td colSpan={4} className="empty">Loading…</td></tr>}
          </tbody>
        </table>
      </div>

      {resetFor && <ResetPassword user={resetFor} onClose={() => setResetFor(null)} />}
    </section>
  );
}

function ResetPassword({ user, onClose }) {
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState({ error: '', ok: '' });
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setMsg({ error: '', ok: '' });
    setBusy(true);
    try {
      await api(`/users/${user.id}`, { method: 'PATCH', body: { password } });
      setPassword('');
      setMsg({ error: '', ok: `Password for ${user.name} has been changed.` });
    } catch (err) {
      setMsg({ error: err.message, ok: '' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Reset password for ${user.name}`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>New password <small>(at least 6 characters)</small></span>
          <input type="password" autoComplete="new-password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
        </label>
        {msg.error && <p className="error" role="alert">{msg.error}</p>}
        {msg.ok && <p className="notice" role="status">{msg.ok}</p>}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Set new password'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Owner: recent changes (audit log) ----------

const ACTION_LABEL = { create: 'Added', update: 'Changed', void: 'Cancelled', status: 'Status changed' };

function describe(a) {
  const d = a.new_data || a.old_data || {};
  if (a.table_name === 'entries') {
    const text = `Entry: ${d.description}, Rs ${fmt(d.amount)} on ${d.entry_date}`;
    return a.action === 'void' ? `${text}. Reason: ${d.void_reason}` : text;
  }
  if (a.table_name === 'cheques') {
    const text = `Cheque #${d.cheque_no} (${d.party_name}), Rs ${fmt(d.amount)}`;
    return a.action === 'status' ? `${text}: ${a.old_data?.status} → ${d.status}` : text;
  }
  if (a.table_name === 'settings') return 'Business settings';
  const what = { users: 'User', people: 'Person', categories: 'Category' }[a.table_name] || a.table_name;
  const name = d.name ? `${what}: ${d.name}` : `${what} #${a.record_id}`;
  return d.password_changed ? `${name} (password changed)` : name;
}

function RecentChanges() {
  const log = useLoad(() => api('/audit'), []);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Recent changes</h2>
        <button className="btn small ghost" onClick={log.reload} disabled={log.loading}>Refresh</button>
      </div>
      {log.error && <p className="error" role="alert">{log.error}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr>
          </thead>
          <tbody>
            {log.data?.map((a) => (
              <tr key={a.id}>
                <td className="nowrap">{new Date(a.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td>{a.user_name || 'Unknown'}</td>
                <td>{ACTION_LABEL[a.action] || a.action}</td>
                <td className="audit-change">{describe(a)}</td>
              </tr>
            ))}
            {log.data && !log.data.length && <tr><td colSpan={4} className="empty">No changes yet.</td></tr>}
            {!log.data && !log.error && <tr><td colSpan={4} className="empty">Loading…</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
