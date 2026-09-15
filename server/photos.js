import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Photos live in public/photos at build time, or PHOTOS_DIR to serve from a volume
const PHOTOS_DIR = process.env.PHOTOS_DIR || path.join(__dirname, '..', 'public', 'photos');
const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

let cache = null;
const CACHE_TTL = 60 * 1000; // rescan the folder once a minute

export function getPhotoList() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.data;
  }
  let files = [];
  try {
    files = fs
      .readdirSync(PHOTOS_DIR)
      .filter((f) => EXTENSIONS.has(path.extname(f).toLowerCase()))
      .sort();
  } catch {
    // folder missing or unreadable — no photos, dashboard still works
  }
  const data = { photos: files.map((f) => `/api/photos/${encodeURIComponent(f)}`) };
  cache = { data, fetchedAt: Date.now() };
  return data;
}

export function photoPath(filename) {
  // Prevent path traversal: only allow plain filenames that exist in the list
  const list = getPhotoList().photos;
  const wanted = `/api/photos/${encodeURIComponent(filename)}`;
  if (!list.includes(wanted)) return null;
  return path.join(PHOTOS_DIR, filename);
}