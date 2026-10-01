import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, useLoad } from '../api.js';
import { fmt, niceDate, PERSON_TYPES } from '../money.js';
import { PersonTable, rangeQuery } from './PersonLedger.jsx';

const DATE = { day: 'numeric', month: 'long', year: 'numeric' };

// A clean, printable statement of account for one person.
// Shown without the app's top bar (see App.jsx). Cancelled entries are left out.
export default function Statement() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const qs = rangeQuery(from, to);

  const settings = useLoad(() => api('/settings'), []);
  const ledger = useLoad(() => api(`/people/${id}/ledger?${qs}`), [id, qs]);
  const back = `/people/${id}${qs ? `?${qs}` : ''}`;

  const error = settings.error || ledger.error;
  if (error) {
    return (
      <div className="statement">
        <p><Link to={back}>Back to ledger</Link></p>
        <p className="error" role="alert">{error}</p>
      </div>
    );
  }
  if (!settings.data || !ledger.data) return <div className="boot">Preparing the statement…</div>;

  const business = settings.data.business_name;
  const today = settings.data.today;
  const { person, closing } = ledger.data;

  let period = `All entries up to ${niceDate(today, DATE)}`;
  if (from && to) period = `${niceDate(from, DATE)} to ${niceDate(to, DATE)}`;
  else if (from) period = `${niceDate(from, DATE)} to ${niceDate(today, DATE)}`;
  else if (to) period = `Up to ${niceDate(to, DATE)}`;

  let owed = 'Nothing is owed. The account is settled.';
  if (closing > 0.005) owed = `${person.name} owes ${business} Rs ${fmt(closing)}.`;
  if (closing < -0.005) owed = `${business} owes ${person.name} Rs ${fmt(-closing)}.`;

  return (
    <div className="statement">
      <div className="statement-bar no-print">
        <Link className="btn ghost" to={back}>Back to ledger</Link>
        <button className="btn primary" onClick={() => window.print()}>Print</button>
      </div>

      <article className="statement-page">
        <header className="statement-head">
          <p className="statement-business">{business}</p>
          <h1>Statement of account</h1>
          <dl className="statement-meta">
            <div>
              <dt>For</dt>
              <dd>
                {person.name} <span className="muted">({PERSON_TYPES[person.type]})</span>
                {person.phone && <><br />{person.phone}</>}
              </dd>
            </div>
            <div><dt>Period</dt><dd>{period}</dd></div>
            <div><dt>Printed on</dt><dd>{niceDate(today, DATE)}</dd></div>
          </dl>
        </header>

        <PersonTable data={ledger.data} forStatement />

        <p className={`statement-owed${closing < -0.005 ? ' red' : ''}`}>{owed}</p>
        <p className="muted small-print">
          Given: money or goods {business} gave. Received: money or goods {business} received.
        </p>
      </article>
    </div>
  );
}
