# Day Book: project guide for Claude Code

A web app that replaces a restaurant's handwritten **Day Book** (daily cash book).
One business only (not multi-tenant). Staff enter money in / money out each day;
the app calculates totals and balances automatically.

## Stack
- `backend/`: Node.js (ES modules) + Express 4 + PostgreSQL (`pg`), JWT auth, bcryptjs.
- `frontend/`: React 18 + Vite 5 + react-router-dom 6. Plain CSS (no UI library).
- In production the backend also serves `frontend/dist` (one server, one domain).

## Run locally
```bash
cd backend && cp .env.example .env   # fill DATABASE_URL, JWT_SECRET, OWNER_PASSWORD
npm install && npm run migrate && npm run seed && npm run dev   # API on :4000
cd ../frontend && npm install && npm run dev                     # UI on :5173 (proxies /api)
```

## Status
- **Backend: DONE and tested** against PostgreSQL 16. Don't rewrite it; extend only if needed.
  `backend/scripts/smoke-test.mjs` checks the main flows (fresh test DB only).
- **Frontend: DONE.** All pages in `src/pages/`, `styles.css` and the components are built
  (the "Frontend tasks" list below is kept as the spec).

## Business rules (important, keep these)
1. **Two sides**: every entry is `type` = `receipt` (money in) or `payment` (money out).
2. **Mode**: `cash`, `bank`, or `credit`.
   - cash/bank entries change the balance.
   - credit entries are recorded (shown in **red**, like red ink in the paper book) but
     do NOT change cash/bank balance. Credit entries must have a `person_id`.
3. **Balance is never stored**; it's calculated:
   opening(date) = settings.opening_cash/bank + all cash/bank entries from `start_date` to the day before.
   closing = opening + receipts − payments (cash and bank tracked separately).
4. **Nothing is deleted.** Entries are "voided" (cancelled) with a reason. Voided entries
   stay visible (struck through) but are excluded from all totals. Every create/update/void
   is written to `audit_log` (also changes to users, people and categories; never password hashes).
5. **Roles**:
   - `owner`: everything, any date, edit/void any entry, settings, users, categories, cheque status.
   - `cashier`: can add entries for **today only**, edit/void only **their own entries from today**,
     add people and cheques. Cannot open Settings sections for users/categories/audit.
6. **Person balance** (people ledger): positive = they owe us / we advanced them money;
   negative = we owe them. Receipt+credit = +, receipt cash/bank = −, payment cash/bank = +, payment+credit = −.
   balance = `people.opening_balance` + all non-voided entries. The opening balance (with `opening_date`,
   default = book start) is what was owed before this book; **only the owner** can set or change it.
   In a person's ledger the columns are "Given" (+) and "Received" (−), from the business's side.
7. **qty × rate**: if both are given, the server sets amount = qty × rate.
8. "Today" comes from the server (`GET /api/settings` returns `today`, timezone `APP_TIMEZONE`).
   Use it instead of the browser date.

## API (all under `/api`, JSON, `Authorization: Bearer <token>` except login)
| Method | Path | Notes |
|---|---|---|
| POST | /auth/login | `{username,password}` → `{token,user}` |
| GET | /auth/me | current user |
| POST | /auth/change-password | `{current_password,new_password}` → `{ok,token}`; other logins of this user stop working, keep the new token |
| GET | /settings | `{business_name,start_date,opening_cash,opening_bank,today}` |
| PUT | /settings | owner |
| GET | /daybook/:date | `{date,opening:{cash,bank},totals:{receipt:{cash,bank,credit,count},payment:{…}},closing:{cash,bank},entries:[…]}` (entries include voided ones) |
| GET | /entries?from&to[&type&mode&category_id&person_id&q&include_voided=1] | list (max 5000). With `&export=1`: `{entries,truncated,limit}`, max 50000 |
| POST | /entries | create |
| PUT | /entries/:id | update |
| POST | /entries/:id/void | `{reason}` |
| GET | /entries/:id/history | owner; audit rows for one entry |
| GET | /categories | all (`type`, `active`) |
| POST / PATCH | /categories, /categories/:id | owner; `{name,type}` / `{name?,active?}` |
| GET | /people?type&q&active=1 | includes `balance` (opening balance + entries) |
| POST | /people | `{name,type,phone,notes,opening_balance?,opening_date?}`; type: employee/customer/supplier/other. A non-zero `opening_balance` needs the owner (403 for cashiers) |
| PATCH | /people/:id | owner; same fields plus `active` |
| GET | /people/:id/ledger?from&to | `{person, from, to, opening, closing, entries:[…, effect, running]}`. `opening` = balance before `from` (opening balance + earlier entries); `person.balance` = balance now. from/to are optional |
| GET | /ledgers/book?mode=cash\|bank&from&to | `{mode,from,to,opening,totals:{in,out},closing,entries:[…, running]}`; `from` is moved up to the book's start date |
| GET | /ledgers/category/:id?from&to | `{category,from,to,total,credit,count,entries:[…, running]}` (credit entries count, as in reports) |
| GET | /ledgers/balances | `{receivables, payables, total_receivable, total_payable}` people with a non-zero balance; `total_payable` is a positive number |
| GET | /cheques?status&direction | |
| POST | /cheques | `{cheque_no,bank_name,party_name,person_id,amount,direction:'received'|'issued',cheque_date,note}` |
| PUT | /cheques/:id | owner |
| POST | /cheques/:id/status | owner; `{status, add_entry?, category_id?}`; cleared + add_entry creates a bank entry dated today. If the linked entry was voided, the link is dropped and status can change again |
| GET | /reports/summary?from&to | `{opening,totals,closing,byCategory,byDay}` |
| GET/POST/PATCH | /users, /users/:id | owner; a new `password` logs that user out everywhere |
| GET | /audit | owner, last 200 changes |

Entry object fields: `id, entry_date, type, description, category_id, category_name, person_id,
person_name, qty, rate, amount, mode, note, voided, void_reason, created_by, created_by_name, created_at`.
Numbers come back as JS numbers, dates as `'YYYY-MM-DD'` strings.

## Ledger screens (added after the first version)
- **`pages/Ledgers.jsx`** (`/ledgers`, in the top bar): tabs Cash book, Bank book, Category ledger,
  Receivables / payables. Tab, dates and category are kept in the address (`?tab&from&to&category`).
  Voided entries are listed struck through but never counted. "Print" prints the current tab.
- **`pages/PersonLedger.jsx`** (`/people/:id?from&to`): date filter, opening row, entries with running balance,
  closing row; "Receive payment" / "Make payment" open `EntryForm` with `preset` (cash, this person, right side);
  "Print statement" opens **`pages/Statement.jsx`** (`/people/:id/statement?from&to`), a clean page without
  the top bar: business name, person, period, and the table without cancelled entries.
- `components/PersonForm.jsx` shows the opening balance fields (amount + "They owe us / We owe them" + date)
  to the owner only.

## Frontend tasks (build in this order)
1. **`src/styles.css`**: follow "Design direction" below. Must be responsive down to 360px,
   visible keyboard focus, `prefers-reduced-motion` respected, and a print stylesheet
   (print shows only the ledger spread and totals).
   Class names already used by finished components: `shell, topbar, brand, brand-name, brand-sub,
   nav, active, who, btn-link, main, boot, modal-backdrop, modal, wide, modal-head, icon-btn,
   entry-form, side-toggle, on, in, out, field, span-2, span-all, computed, error, actions,
   btn, primary, ghost, rs, ps`.
2. **`pages/Login.jsx`**: username + password, uses `useAuth().login`, shows error message.
3. **`pages/DayBook.jsx`** (home, routes `/` and `/day/:date`):
   - Date bar: previous day, date picker, next day (not past today), "Today" button. Navigate to `/day/:date`.
   - Balance strip: opening cash/bank, closing cash/bank, credit sales and credit purchases for the day.
   - `EntryForm` (new entry). Show it only if owner, or if the date is today. Owner gets `canPickDate`.
   - **The ledger spread** (main visual): two facing pages side by side, "Receipts" left, "Payments" right,
     stacked on mobile. Each is a ruled table with columns: Description (with category and person as
     small secondary text), mode tag (only for Bank/Credit), and amount split into **Rs.** and **Ps.**
     columns using `<Amount/>`.
     - Receipts page first row: "Balance b/f" = opening cash + bank.
     - Payments page last row: "Balance c/f" = closing cash + bank.
     - Both page totals are equal (receipts total = b/f + cash/bank receipts; payments total = cash/bank payments + c/f).
     - Credit rows in red ink, not counted in totals. Voided rows struck through with the reason on hover/tap.
     - Pad each page with empty ruled lines (at least 12 rows) so it feels like the paper book.
   - Clicking a row the user may edit opens `Modal` with `EntryForm` (edit mode) plus a "Cancel entry"
     action that asks for a reason and calls `/entries/:id/void`. Owner also sees "History" (`/entries/:id/history`).
   - "Print" button → `window.print()`.
4. **`pages/Reports.jsx`**: from/to (default: first of month → today). Show money in, money out, net,
   credit sales, opening/closing. Tables: by category (receipts and payments separately), by day
   (each date links to `/day/:date`). "Download CSV" exports `/entries?from&to` (escape commas/quotes).
5. **`pages/People.jsx`** + **`pages/PersonLedger.jsx`**: list with type filter and search, balance shown
   with `balanceText()` from `money.js`; add-person form; ledger page shows entries with running balance.
   Owner can edit/deactivate a person.
6. **`pages/Cheques.jsx`**: filter by status/direction, add-cheque form, highlight pending cheques
   that are due within 3 days or overdue. Owner buttons: Cleared (confirm "Add to today's day book?" and
   optional category), Bounced, Cancelled.
7. **`pages/Settings.jsx`**: everyone: change password. Owner only: business settings (name, start date,
   opening cash, opening bank), categories (add, rename, activate/deactivate, grouped money in / money out),
   users (add cashier/owner, reset password, activate/deactivate), recent changes (`/audit`).

## Design direction (keep it; don't switch to a generic dashboard look)
The design is based on the printed day book the restaurant already uses. Only the ledger spread is
"special"; everything else stays quiet and simple.
- Colours: page background `#EEF1F4` (cool desk grey), paper `#FFFFFF`, ruled lines `#D6DEE7`,
  header band `#5B4632` (brown, like the book's column headers), ink `#1E3A8A` (blue pen, used for amounts
  and entered text in the ledger), red ink `#C0322B` (credit entries, errors), text `#1D232B`, muted `#66707C`.
- Fonts: "Barlow Condensed" 600/700 for page titles and the "Receipts"/"Payments" page headings;
  "Barlow" 400/500/600 for everything else. Numbers use `font-variant-numeric: tabular-nums`.
  (Already loaded in `index.html`.)
- Ledger column headers sit on the brown band with white text, like the printed book.
- Buttons: primary = brown band colour. Sentence case everywhere. No all-caps labels, no gradients,
  no decorative icons. Button text says what happens ("Add money out", "Save changes", "Cancel entry").
- Error messages come from the API in plain English. Show them as-is.

## Code style
- Plain, readable code with short comments. The owner of this project prefers simple English.
- Use `api()` and `useLoad()` from `src/api.js` for all requests. Don't add state libraries.
- Keep money formatting in `money.js`.

## Later (version 2 ideas, not now)
Photo scan of old paper pages (AI fills entries for review), salary module that deducts advances,
WhatsApp daily summary to the owner, multi-branch.
