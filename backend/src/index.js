import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { requireAuth, requireOwner } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import categoryRoutes from './routes/categories.js';
import peopleRoutes from './routes/people.js';
import entryRoutes from './routes/entries.js';
import daybookRoutes from './routes/daybook.js';
import reportRoutes from './routes/reports.js';
import chequeRoutes from './routes/cheques.js';
import ledgerRoutes from './routes/ledgers.js';
import settingsRoutes, { auditRouter } from './routes/settings.js';

if (!process.env.JWT_SECRET || !process.env.DATABASE_URL) {
  console.error('Missing JWT_SECRET or DATABASE_URL. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/users', requireAuth, requireOwner, userRoutes);
app.use('/api/categories', requireAuth, categoryRoutes);
app.use('/api/people', requireAuth, peopleRoutes);
app.use('/api/entries', requireAuth, entryRoutes);
app.use('/api/daybook', requireAuth, daybookRoutes);
app.use('/api/reports', requireAuth, reportRoutes);
app.use('/api/cheques', requireAuth, chequeRoutes);
app.use('/api/ledgers', requireAuth, ledgerRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);
app.use('/api/audit', requireAuth, requireOwner, auditRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// In production, serve the built frontend from the same server.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server. Try again.' : err.message });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`Day Book API running on http://localhost:${port}`));
