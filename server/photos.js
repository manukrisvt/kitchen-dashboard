import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USE_PG = Boolean(process.env.DATABASE_URL);
const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_BYTES = 8 * 1024 * 1024; // 8MB per photo

let pg = null;
let db = null; // SQLite fallback (local dev)

const PG_SCHEMA = `CREATE TABLE IF NOT EXISTS photos (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;
const SQLITE_SCHEMA = `CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

if (USE_PG) {
  const { Pool } = await import('pg');
  pg = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? undefined : { rejectUnauthorized: false },
    max: 5
  });
  await pg.query(PG_SCHEMA);
} else {
  const { default: Database } = await import('better-sqlite3');
  const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(path.join(DATA_DIR, 'photos.db'));
  db.exec(SQLITE_SCHEMA);
}

export const photosDb = {
  async list() {
    if (USE_PG) return (await pg.query('SELECT id, filename, mime, size FROM photos ORDER BY id')).rows;
    return db.prepare('SELECT id, filename, mime, size FROM photos ORDER BY id').all();
  },
  async get(id) {
    if (USE_PG) return (await pg.query('SELECT * FROM photos WHERE id = $1', [id])).rows[0] || null;
    return db.prepare('SELECT * FROM photos WHERE id = ?').get(id) || null;
  },
  async insert(filename, mime, size, buffer) {
    if (USE_PG) {
      const r = await pg.query(
        'INSERT INTO photos (filename, mime, size, data) VALUES ($1, $2, $3, $4) RETURNING id',
        [filename, mime, size, buffer]
      );
      return r.rows[0].id;
    }
    const info = db
      .prepare('INSERT INTO photos (filename, mime, size, data) VALUES (?, ?, ?, ?)')
      .run(filename, mime, size, buffer);
    return info.lastInsertRowid;
  },
  async remove(id) {
    if (USE_PG) return (await pg.query('DELETE FROM photos WHERE id = $1', [id])).rowCount > 0;
    return db.prepare('DELETE FROM photos WHERE id = ?').run(id).changes > 0;
  }
};

export function isAllowedPhoto(filename) {
  return EXTENSIONS.has(path.extname(filename).toLowerCase());
}

export function maxPhotoBytes() {
  return MAX_BYTES;
}

export default photosDb;