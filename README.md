# Day Book

Digital version of a restaurant's handwritten day book: daily money in / money out,
automatic balances, credit tracking, cheques, staff advances, and reports.

See **CLAUDE.md** for setup, business rules, API and remaining tasks.

## Deploy (short version)
1. Create a PostgreSQL database (Neon, Supabase, Railway, or your VPS).
2. `cd frontend && npm install && npm run build`
3. `cd backend && npm install && npm run migrate && npm run seed && npm start`
   The backend serves the built frontend, so you only deploy one Node app.
4. Log in with OWNER_USERNAME / OWNER_PASSWORD from `.env`, then change the password
   and set the book's start date and opening balance in Settings.
