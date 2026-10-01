-- Day Book schema. Safe to run more than once.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'cashier')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Set when a password changes. Logins (tokens) from before this time stop working.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- One row only: business info and the balance the book starts with.
CREATE TABLE IF NOT EXISTS settings (
  id            INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  business_name TEXT NOT NULL DEFAULT 'My Restaurant',
  start_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  opening_cash  NUMERIC(14,2) NOT NULL DEFAULT 0,
  opening_bank  NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
  id     SERIAL PRIMARY KEY,
  name   TEXT NOT NULL,
  type   TEXT NOT NULL CHECK (type IN ('receipt', 'payment')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (name, type)
);

-- Employees, credit customers, suppliers.
CREATE TABLE IF NOT EXISTS people (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('employee', 'customer', 'supplier', 'other')),
  phone      TEXT,
  notes      TEXT,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- What a person owed (or was owed) before their entries in this book. Owner only.
-- Positive = they owe us, negative = we owe them. opening_date is the date it was owed on.
ALTER TABLE people ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE people ADD COLUMN IF NOT EXISTS opening_date DATE;

-- Every line written in the day book.
-- mode: cash / bank change the balance. credit is recorded but does not move money.
CREATE TABLE IF NOT EXISTS entries (
  id          SERIAL PRIMARY KEY,
  entry_date  DATE NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('receipt', 'payment')),
  description TEXT NOT NULL,
  category_id INT REFERENCES categories(id),
  person_id   INT REFERENCES people(id),
  qty         NUMERIC(12,3),
  rate        NUMERIC(14,2),
  amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  mode        TEXT NOT NULL CHECK (mode IN ('cash', 'bank', 'credit')),
  note        TEXT,
  voided      BOOLEAN NOT NULL DEFAULT FALSE,
  void_reason TEXT,
  created_by  INT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS entries_date_idx   ON entries (entry_date);
CREATE INDEX IF NOT EXISTS entries_person_idx ON entries (person_id);

CREATE TABLE IF NOT EXISTS cheques (
  id          SERIAL PRIMARY KEY,
  cheque_no   TEXT NOT NULL,
  bank_name   TEXT,
  party_name  TEXT NOT NULL,
  person_id   INT REFERENCES people(id),
  amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  direction   TEXT NOT NULL CHECK (direction IN ('received', 'issued')),
  cheque_date DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cleared', 'bounced', 'cancelled')),
  entry_id    INT REFERENCES entries(id),
  note        TEXT,
  created_by  INT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cheques_date_idx ON cheques (cheque_date);

-- Every change is recorded here. Nothing is silently deleted.
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id),
  action     TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id  INT,
  old_data   JSONB,
  new_data   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_record_idx ON audit_log (table_name, record_id);
