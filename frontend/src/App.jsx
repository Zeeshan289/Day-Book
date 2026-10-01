import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import DayBook from './pages/DayBook.jsx';
import Ledgers from './pages/Ledgers.jsx';
import Reports from './pages/Reports.jsx';
import People from './pages/People.jsx';
import PersonLedger from './pages/PersonLedger.jsx';
import Statement from './pages/Statement.jsx';
import Cheques from './pages/Cheques.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="boot">Opening the book…</div>;
  if (!user) return <Login />;

  return (
    <Routes>
      {/* Printable statement: a clean page without the top bar. */}
      <Route path="/people/:id/statement" element={<Statement />} />

      <Route element={<Layout><Outlet /></Layout>}>
        <Route path="/" element={<DayBook />} />
        <Route path="/day/:date" element={<DayBook />} />
        <Route path="/ledgers" element={<Ledgers />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/people" element={<People />} />
        <Route path="/people/:id" element={<PersonLedger />} />
        <Route path="/cheques" element={<Cheques />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
