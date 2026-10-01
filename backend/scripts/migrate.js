import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../db/schema.sql');
await pool.query(fs.readFileSync(file, 'utf8'));
console.log('Database tables are ready.');
await pool.end();
