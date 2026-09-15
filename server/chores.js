import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = path.join(__dirname, 'chores.seed.json');

// Postgres when DATABASE_URL is set (Railway), SQLite locally otherwise.
const USE_PG = Boolean(process.env.DATABASE_URL);

let db; // better-sqlite3 instance (local only)
let pg;  // pg Pool (production)

if (USE_PG) {
  const { Pool } = await import('pg');
  pg = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? undefined : { rejectUnauthorized: false },
    max: 5
  });
} else {
  const { default: Database } = await import('better-sqlite3');
  const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(path.join(DATA_DIR, 'chores.db'));
  db.pragma('journal_mode = WAL');
}

const SCHEMA = USE_PG
  ? `CREATE TABLE IF NOT EXISTS chores (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      interval_days INTEGER NOT NULL,
      last_completed TEXT NOT NULL,
      category TEXT DEFAULT ''
    )`
  : `CREATE TABLE IF NOT EXISTS chores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      interval_days INTEGER NOT NULL,
      last_completed TEXT NOT NULL,
      category TEXT DEFAULT ''
    )`;

if (USE_PG) {
  await pg.query(SCHEMA);
} else {
  db.exec(SCHEMA);
}

// Seed from JSON config on first run (table empty)
async function seedIfEmpty() {
  const count = USE_PG
    ? (await pg.query('SELECT COUNT(*)::int AS n FROM chores')).rows[0].n
    : db.prepare('SELECT COUNT(*) AS n FROM chores').get().n;
  if (count > 0) return;

  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const epoch = new Date('2026-09-01T12:00:00');
  for (const r of seed) {
    const last = new Date(epoch);
    last.setDate(last.getDate() + Math.floor(Math.random() * r.interval_days));
    const lastISO = last.toISOString();
    if (USE_PG) {
      await pg.query(
        'INSERT INTO chores (name, interval_days, last_completed, category) VALUES ($1, $2, $3, $4)',
        [r.name, r.interval_days, lastISO, r.category || '']
      );
    } else {
      db.prepare('INSERT INTO chores (name, interval_days, last_completed, category) VALUES (?, ?, ?, ?)')
        .run(r.name, r.interval_days, lastISO, r.category || '');
    }
  }
  console.log(`Seeded ${seed.length} chores from chores.seed.json`);
}
await seedIfEmpty();

// Thin async adapter so routes don't care which backend is active
export const choresDb = {
  async all() {
    if (USE_PG) return (await pg.query('SELECT * FROM chores')).rows;
    return db.prepare('SELECT * FROM chores').all();
  },
  async get(id) {
    if (USE_PG) return (await pg.query('SELECT * FROM chores WHERE id = $1', [id])).rows[0] || null;
    return db.prepare('SELECT * FROM chores WHERE id = ?').get(id) || null;
  },
  async insert(name, interval_days, last_completed, category) {
    if (USE_PG) {
      const r = await pg.query(
        'INSERT INTO chores (name, interval_days, last_completed, category) VALUES ($1, $2, $3, $4) RETURNING *',
        [name, interval_days, last_completed, category]
      );
      return r.rows[0];
    }
    const info = db
      .prepare('INSERT INTO chores (name, interval_days, last_completed, category) VALUES (?, ?, ?, ?)')
      .run(name, interval_days, last_completed, category);
    return db.prepare('SELECT * FROM chores WHERE id = ?').get(info.lastInsertRowid);
  },
  async complete(id, last_completed) {
    if (USE_PG) {
      const r = await pg.query('UPDATE chores SET last_completed = $1 WHERE id = $2 RETURNING *', [last_completed, id]);
      return r.rows[0] || null;
    }
    const result = db.prepare('UPDATE chores SET last_completed = ? WHERE id = ?').run(last_completed, id);
    return result.changes === 0 ? null : db.prepare('SELECT * FROM chores WHERE id = ?').get(id);
  },
  async update(id, name, interval_days, category) {
    if (USE_PG) {
      const r = await pg.query(
        'UPDATE chores SET name = $1, interval_days = $2, category = $3 WHERE id = $4 RETURNING *',
        [name, interval_days, category, id]
      );
      return r.rows[0] || null;
    }
    const result = db.prepare('UPDATE chores SET name = ?, interval_days = ?, category = ? WHERE id = ?')
      .run(name, interval_days, category, id);
    return result.changes === 0 ? null : db.prepare('SELECT * FROM chores WHERE id = ?').get(id);
  },
  async remove(id) {
    if (USE_PG) {
      const r = await pg.query('DELETE FROM chores WHERE id = $1', [id]);
      return r.rowCount > 0;
    }
    return db.prepare('DELETE FROM chores WHERE id = ?').run(id).changes > 0;
  }
};

export default choresDb;
