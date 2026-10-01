import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { api, useLoad } from '../api.js';
import { useAuth } from '../auth.jsx';

const LINKS = [
  { to: '/', label: 'Day book', end: true },
  { to: '/ledgers', label: 'Ledgers' },
  { to: '/reports', label: 'Reports' },
  { to: '/people', label: 'People' },
  { to: '/cheques', label: 'Cheques' },
  { to: '/settings', label: 'Settings' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const settings = useLoad(() => api('/settings'), []);

  // Settings page sends this after saving, so the business name here stays up to date.
  const { reload } = settings;
  useEffect(() => {
    window.addEventListener('settings:changed', reload);
    return () => window.removeEventListener('settings:changed', reload);
  }, [reload]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">{settings.data?.business_name || 'Day Book'}</span>
          <span className="brand-sub">Day book</span>
        </div>
        <nav className="nav" aria-label="Main">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="who">
          <span>{user.name} <small>({user.role})</small></span>
          <button className="btn-link" onClick={logout}>Log out</button>
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
