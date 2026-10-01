import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('auth:logout', onLogout);
    if (localStorage.getItem('token')) {
      api('/auth/me').then((d) => setUser(d.user)).catch(() => {}).finally(() => setReady(true));
    } else {
      setReady(true);
    }
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  async function login(username, password) {
    const d = await api('/auth/login', { method: 'POST', body: { username, password } });
    localStorage.setItem('token', d.token);
    setUser(d.user);
  }

  function logout() {
    localStorage.removeItem('token');
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
