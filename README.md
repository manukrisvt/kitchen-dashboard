# Kitchen Dashboard

A wall-display dashboard for an iPad mounted in the kitchen. Shows the time,
weather, today's calendar events, and the next 7 days — all on one screen, no
scrolling, readable from across the room.

## Stack

- **Frontend:** React + Vite + Tailwind (dark kiosk layout, PWA)
- **Backend:** Node.js + Express — serves the API *and* the built static files
  from a single URL/port
- **Calendar:** Google Calendar "Secret address in iCal format" (no OAuth, no
  API key — just a private URL)
- **Weather:** Open-Meteo (free, no API key), fixed to lat 35.08 / lon -80.67

## Setup

### 1. Get your Google Calendar iCal URL

1. Go to [calendar.google.com](https://calendar.google.com) on a desktop
2. Open the **Settings** (gear icon → Settings)
3. Select your calendar in the left sidebar (e.g. under "Settings for my calendars")
4. Scroll to **"Integrate calendar"**
5. Copy the **"Secret address in iCal format"** URL — it looks like:
   `https://calendar.google.com/calendar/ical/XXXX/private/basic.ics`

> ⚠️ Treat this URL like a password — anyone with it can read your calendar.
> If it ever leaks, use the "Reset" button next to it in Google Calendar settings.

### 2. Configure environment variables

Create a `.env` file (or export in your shell):

```
CALENDAR_ICS_URL=https://calendar.google.com/calendar/ical/XXXX/private/basic.ics
PORT=3000
```

### 3. Run locally

```bash
npm install
npm run build
npm start
# open http://localhost:3000
```

For frontend development with hot reload:

```bash
npm install
node server/index.js   # backend on :3000 (in one terminal)
npm run dev            # Vite dev server on :5173, proxies /api to :3000
```

### 4. Deploy to Railway

1. Push this folder to a Git repo
2. In Railway: **New Project → Deploy from GitHub repo**
3. Add the environment variable `CALENDAR_ICS_URL` in the Railway dashboard
4. Railway auto-detects the Dockerfile and builds it. `PORT` is provided by Railway.

## iPad installation

1. Open the deployed URL in Safari on the iPad
2. Tap **Share → Add to Home Screen**
3. Launch from the home screen — it runs fullscreen with no Safari chrome
4. In iPad **Settings → Display & Brightness → Auto-Lock**, set to *Never*
   (the app also requests a Screen Wake Lock where supported, but the OS
   setting is the reliable path)

## Behavior

- Clock updates every second
- Events poll every 5 minutes (server caches the ICS for 5 min)
- Weather polls every 15 minutes (server caches for 15 min)
- If an API call fails, the last-known data stays on screen with a small
  amber warning dot — the screen never blanks
- The layout shifts a few pixels every 15 minutes to reduce burn-in on an
  always-on display

## Photo background

The dashboard rotates through family photos as its background (cross-fade every
5 minutes, dark overlay keeps text readable).

- **Local:** drop photos into `public/photos/` (jpg/jpeg/png/webp)
- **Deployed:** photos are served from the repo — commit them and push:
  ```bash
  ./scripts/sync-photos.sh ~/Pictures/KitchenDashboard   # copy from a folder
  git add public/photos && git commit -m "photos" && git push
  ```
- To pull from Apple Photos: create an album, select all, **File → Export**,
  export to a folder, then run the sync script. (Apple doesn't allow web apps
  to read the Photos library directly.)
- No photos? The dashboard uses the plain dark background — everything still works.

## API

| Route | Description |
|---|---|
| `GET /api/events` | Events for today + next 7 days, grouped by local date, all-day events sorted first |
| `GET /api/weather` | Current temp + condition code, today's high/low, next 3 days' high/low (°F) |
| `GET /*` | The built React app |
