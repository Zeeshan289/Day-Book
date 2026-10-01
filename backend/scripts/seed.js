// Creates the settings row, default categories, and the first owner account.
// Safe to run more than once: it skips anything that already exists.
import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

const RECEIPTS = ['Cash Sale', 'Credit Sale', 'Customer Payment', 'Bank Withdrawal', 'Other Income'];
const PAYMENTS = [
  'Kitchen Supplies', 'Meat & Fish', 'Drinks & Ice', 'Crockery & Utensils', 'Staff Salary', 'Salary Advance',
  'Utility Bills', 'Rent', 'Repairs', 'Charity', 'Bank Deposit', 'Supplier Payment', 'Other Expense',
];

await pool.query(
  `INSERT INTO settings (id, business_name) VALUES (1, $1) ON CONFLICT (id) DO NOTHING`,
  [process.env.BUSINESS_NAME || 'My Restaurant']
);

for (const name of RECEIPTS) {
  await pool.query(`INSERT INTO categories (name, type) VALUES ($1, 'receipt') ON CONFLICT DO NOTHING`, [name]);
}
for (const name of PAYMENTS) {
  await pool.query(`INSERT INTO categories (name, type) VALUES ($1, 'payment') ON CONFLICT DO NOTHING`, [name]);
}

const { rows: [{ n }] } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
if (n === 0) {
  const username = (process.env.OWNER_USERNAME || 'owner').toLowerCase();
  const password = process.env.OWNER_PASSWORD || 'change-this-password';
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (name, username, password_hash, role) VALUES ($1, $2, $3, 'owner')`,
    [process.env.OWNER_NAME || 'Owner', username, hash]
  );
  console.log(`Owner account created. Username: ${username}`);
} else {
  console.log('Users already exist, no owner created.');
}

console.log('Seed finished.');
await pool.end();
