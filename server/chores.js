import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR lets Railway volumes (or any persistent disk) own the DB location.
// Defaults to server/data — mount a volume there (or set DATA_DIR to the mount path).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'chores.db');
const SEED_PATH = path.join(__dirname, 'chores.seed.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS chores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    interval_days INTEGER NOT NULL,
    last_completed TEXT NOT NULL,
    category TEXT DEFAULT ''
  )
`);

// Seed from JSON config on first run (table empty)
const count = db.prepare('SELECT COUNT(*) AS n FROM chores').get().n;
if (count === 0) {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const insert = db.prepare(
    'INSERT INTO chores (name, interval_days, last_completed, category) VALUES (?, ?, ?, ?)'
  );
  // Seed as if completed "interval_days" ago → everything starts due today-ish.
  // Use a fixed epoch so first boot shows a mix of due/not-due rather than all overdue.
  const epoch = new Date('2026-09-01T12:00:00');
  const tx = db.transaction((rows) => {
    for (const r of rows) {
      const last = new Date(epoch);
      last.setDate(last.getDate() + Math.floor(Math.random() * r.interval_days));
      insert.run(r.name, r.interval_days, last.toISOString(), r.category || '');
    }
  });
  tx(seed);
  console.log(`Seeded ${seed.length} chores from chores.seed.json`);
}

export default db;
