import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEvents } from './events.js';
import { getWeather } from './weather.js';
import choresDb from './chores.js';
import { getPhotoList, photoPath } from './photos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ---------- Chores ----------
function daysUntilDue(chore) {
  const due = new Date(chore.last_completed);
  due.setDate(due.getDate() + chore.interval_days);
  const msPerDay = 86400000;
  // Round so "due today" shows 0, a chore due tomorrow shows 1, etc.
  return Math.ceil((due.getTime() - Date.now()) / msPerDay);
}

function withDue(chore) {
  return { ...chore, days_until_due: daysUntilDue(chore) };
}

app.get('/api/chores', async (req, res) => {
  const rows = (await choresDb.all()).map(withDue);
  rows.sort((a, b) => a.days_until_due - b.days_until_due); // most urgent first
  res.json({ chores: rows });
});

app.post('/api/chores/:id/complete', async (req, res) => {
  const now = new Date().toISOString();
  const chore = await choresDb.complete(req.params.id, now);
  if (!chore) return res.status(404).json({ error: 'Chore not found' });
  res.json(withDue(chore));
});

app.post('/api/chores', async (req, res) => {
  const { name, interval_days, category } = req.body;
  if (!name || !Number.isFinite(interval_days) || interval_days <= 0) {
    return res.status(400).json({ error: 'name and positive interval_days required' });
  }
  // New chore counts as just completed → countdown starts now
  const chore = await choresDb.insert(name, Math.round(interval_days), new Date().toISOString(), category || '');
  res.status(201).json(withDue(chore));
});

app.put('/api/chores/:id', async (req, res) => {
  const existing = await choresDb.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Chore not found' });
  const { name = existing.name, interval_days = existing.interval_days, category = existing.category } = req.body;
  if (!name || !Number.isFinite(interval_days) || interval_days <= 0) {
    return res.status(400).json({ error: 'name and positive interval_days required' });
  }
  const chore = await choresDb.update(req.params.id, name, Math.round(interval_days), category || '');
  res.json(withDue(chore));
});

app.delete('/api/chores/:id', async (req, res) => {
  const ok = await choresDb.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Chore not found' });
  res.json({ ok: true });
});


app.get('/api/events', async (req, res) => {
  try {
    const data = await getEvents();
    res.json(data);
  } catch (err) {
    console.error('events error:', err.message);
    res.status(502).json({ error: 'Failed to fetch calendar' });
  }
});

app.get('/api/weather', async (req, res) => {
  try {
    const data = await getWeather();
    res.json(data);
  } catch (err) {
    console.error('weather error:', err);
    res.status(502).json({ error: 'Failed to fetch weather', detail: err.message });
  }
});

// ---------- Photos ----------
app.get('/api/photos', (req, res) => {
  res.json(getPhotoList());
});

app.get('/api/photos/:filename', (req, res) => {
  const filePath = photoPath(req.params.filename);
  if (!filePath) return res.status(404).json({ error: 'Not found' });
  res.sendFile(filePath);
});

// Serve the built React app for all other routes
const dist = path.join(__dirname, '..', 'dist');
app.use(express.static(dist));
app.get('*', (req, res) => {
  res.sendFile(path.join(dist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Kitchen dashboard listening on http://localhost:${PORT}`);
});
