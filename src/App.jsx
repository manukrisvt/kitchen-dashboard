import { useEffect, useState, useRef, useCallback } from 'react';
import { weatherIcon } from './weatherIcons.js';

const EVENTS_POLL_MS = 5 * 60 * 1000;
const WEATHER_POLL_MS = 15 * 60 * 1000;
const BURNIN_INTERVAL_MS = 15 * 60 * 1000;

function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTime(d) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtEventTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function dayName(iso, todayKey) {
  const d = new Date(iso + 'T12:00:00');
  const key = localDateKey(d);
  if (key === todayKey) return 'Today';
  if (key === addDays(todayKey, 1)) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'long' });
}

function addDays(dateKey, n) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return localDateKey(dt);
}

// ---- Data-fetching hook: keeps last-known data on error, tracks staleness ----
// Fast retry (60s) while a source has never loaded; normal interval once it has.
function usePolling(url, intervalMs) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  const fetchNow = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      setData(json);
      setUpdatedAt(new Date());
      setError(false);
    } catch {
      setError(true); // keep last-known data
    }
  }, [url]);

  useEffect(() => {
    fetchNow();
    const id = setInterval(fetchNow, data ? intervalMs : 60 * 1000);
    return () => clearInterval(id);
  }, [fetchNow, intervalMs, data]);

  return { data, error, updatedAt, refetch: fetchNow };
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ---- Wake lock: keep iPad screen awake, graceful fallback ----
function useWakeLock() {
  useEffect(() => {
    let lock = null;
    let retryId = null;

    const request = async () => {
      try {
        if ('wakeLock' in navigator && !lock) {
          lock = await navigator.wakeLock.request('screen');
          lock.addEventListener('release', () => (lock = null));
        }
      } catch {
        /* not supported / denied — fall back to user keeping screen on */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') request();
    };

    request();
    document.addEventListener('visibilitychange', onVisible);
    // Re-request periodically in case it was silently released
    retryId = setInterval(request, 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(retryId);
      if (lock) lock.release();
    };
  }, []);
}

// ---- Burn-in mitigation: nudge layout a few px every 15 min ----
function useBurnInShift() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const id = setInterval(() => {
      setOffset({
        x: Math.floor(Math.random() * 9) - 4, // -4..4 px
        y: Math.floor(Math.random() * 9) - 4
      });
    }, BURNIN_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  return offset;
}

function StaleDot({ show }) {
  if (!show) return null;
  return (
    <span
      title="Last update failed — showing last-known data"
      className="inline-block w-3 h-3 rounded-full bg-amber-400 animate-pulse"
    />
  );
}

function UpdatedStamp({ updatedAt, error, label }) {
  if (!updatedAt) return null;
  return (
    <span className="text-slate-500 text-[clamp(0.7rem,1vw,0.95rem)] flex items-center gap-2 shrink-0">
      <StaleDot show={error} />
      {label} {fmtTime(updatedAt)}
    </span>
  );
}

// ---------- Top strip ----------
function TopStrip({ now, weather, weatherError }) {
  const w = weather ? weatherIcon(weather.current.code) : null;
  return (
    <header className="flex items-end justify-between px-[2.5vw] pt-[1.5vh] pb-[1vh] shrink-0 gap-4">
      <div className="flex items-baseline gap-[1.5vw] min-w-0">
        <span className="text-[clamp(3rem,7vw,7rem)] leading-none font-semibold tracking-tight tabular-nums">
          {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </span>
        <span className="text-[clamp(1.2rem,2.2vw,2rem)] text-slate-400 font-medium truncate">
          {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
      </div>
      <div className="flex items-center gap-[1vw] shrink-0">
        {weather && (
          <span className="text-[clamp(2.2rem,4.5vw,4rem)] leading-none" role="img" aria-label={w.label}>
            {w.icon}
          </span>
        )}
        {weather && (
          <span className="text-[clamp(2.2rem,4.5vw,4rem)] font-semibold tabular-nums leading-none">
            {weather.current.temp}°
          </span>
        )}
        {weather && (
          <span className="text-[clamp(0.9rem,1.4vw,1.4rem)] text-slate-400 leading-tight">
            {weather.location}
            <br />
            {w.label}
            <br />
            H {weather.today.high}° · L {weather.today.low}°
          </span>
        )}
        <StaleDot show={weatherError} />
      </div>
    </header>
  );
}

// ---------- Today column ----------
function TodayColumn({ events, eventsError, updatedAt, now }) {
  const todayKey = localDateKey(now);
  const todays = (events?.days?.[todayKey] || []).slice();

  // Split: all-day pinned top, then timed sorted by start (server already sorts)
  const allDay = todays.filter((e) => e.allDay);
  const timed = todays.filter((e) => !e.allDay);

  return (
    <section className="w-[58%] min-w-0 h-full flex flex-col px-[2.5vw] pb-[2vh]">
      <div className="flex items-center justify-between mb-[1vh] shrink-0">
        <h2 className="text-[clamp(1.5rem,2.6vw,2.5rem)] font-bold text-accent tracking-wide">TODAY</h2>
        <UpdatedStamp updatedAt={updatedAt} error={eventsError} label="Updated" />
      </div>
      <div className="flex-1 overflow-hidden flex flex-col gap-[1.2vh]">
        {allDay.map((e, i) => (
          <div key={`ad-${i}`} className="bg-ink-800 rounded-2xl px-[1.5vw] py-[1vh] border-l-8 border-accent-warm shrink-0">
            <p className="text-[clamp(1.3rem,2.4vw,2.2rem)] font-semibold truncate">{e.title}</p>
            {e.location && <p className="text-[clamp(0.9rem,1.5vw,1.4rem)] text-slate-400 truncate">{e.location}</p>}
          </div>
        ))}
        {timed.length + allDay.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[clamp(1.8rem,3.5vw,3rem)] text-slate-500 font-medium">Nothing today 🎉</p>
          </div>
        )}
        {timed.map((e, i) => (
          <div key={`t-${i}`} className="bg-ink-800 rounded-2xl px-[1.5vw] py-[1.2vh] flex items-center gap-[1.5vw] shrink-0">
            <span className="text-[clamp(1.3rem,2.4vw,2.2rem)] font-semibold text-accent tabular-nums w-[9vw] shrink-0">
              {fmtEventTime(e.start)}
            </span>
            <div className="min-w-0">
              <p className="text-[clamp(1.3rem,2.4vw,2.2rem)] font-semibold truncate">{e.title}</p>
              {e.location && <p className="text-[clamp(0.9rem,1.5vw,1.4rem)] text-slate-400 truncate">{e.location}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- Chores panel: only due-soon or overdue ----------
function ChoresPanel({ chores, onDone, now }) {
  const visible = (chores || []).filter((c) => c.days_until_due <= 7);
  if (visible.length === 0) return null; // no clutter when nothing is due

  return (
    <div className="shrink-0 mt-[1vh] pt-[1vh] border-t border-ink-700">
      <h3 className="text-[clamp(1rem,1.6vw,1.5rem)] font-bold text-accent-warm tracking-wide mb-[0.5vh]">CHORES</h3>
      <div className="flex flex-col gap-[0.5vh]">
        {visible.map((c) => {
          const overdue = c.days_until_due < 0;
          return (
            <div key={c.id} className="flex items-center gap-[1vw] min-w-0">
              <span className="text-[clamp(0.9rem,1.5vw,1.4rem)] flex-1 min-w-0 truncate">{c.name}</span>
              <span
                className={`text-[clamp(0.75rem,1.1vw,1rem)] tabular-nums shrink-0 ${overdue ? 'text-red-400 font-bold' : 'text-slate-400'}`}
              >
                {overdue
                  ? `${Math.abs(c.days_until_due)} day${Math.abs(c.days_until_due) === 1 ? '' : 's'} OVERDUE`
                  : c.days_until_due === 0
                    ? 'due today'
                    : `due in ${c.days_until_due} day${c.days_until_due === 1 ? '' : 's'}`}
              </span>
              <button
                onClick={() => onDone(c.id)}
                className="shrink-0 bg-accent text-ink-950 font-bold text-[clamp(0.85rem,1.2vw,1.1rem)] rounded-xl px-[1.2vw] py-[0.8vh] active:scale-95 transition-transform"
                aria-label={`Mark ${c.name} done`}
              >
                Done
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Next 7 days column ----------
function Next7Column({ events, weather, weatherError, weatherUpdatedAt, chores, onChoreDone, now }) {
  const todayKey = localDateKey(now);
  const dayKeys = Array.from({ length: 8 }, (_, i) => addDays(todayKey, i)).slice(1); // next 7 days

  return (
    <section className="w-[42%] min-w-0 h-full flex flex-col px-[2.5vw] pb-[2vh] border-l border-ink-700">
      <h2 className="text-[clamp(1.2rem,2vw,1.9rem)] font-bold text-slate-300 tracking-wide mb-[1vh] shrink-0">NEXT 7 DAYS</h2>
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-[1vh]">
        {dayKeys.map((key) => {
          const evs = events?.days?.[key] || [];
          return (
            <div key={key} className="flex gap-[1vw] items-start min-w-0">
              <span className="text-[clamp(0.9rem,1.5vw,1.4rem)] font-semibold text-slate-400 w-[8vw] shrink-0">
                {dayName(key, todayKey)}
              </span>
              <div className="min-w-0 flex-1">
                {evs.length === 0 ? (
                  <p className="text-[clamp(0.9rem,1.5vw,1.4rem)] text-slate-600">—</p>
                ) : (
                  evs.slice(0, 3).map((e, i) => (
                    <p key={i} className="text-[clamp(0.9rem,1.5vw,1.4rem)] truncate">
                      {!e.allDay && (
                        <span className="text-accent tabular-nums mr-2">{fmtEventTime(e.start)}</span>
                      )}
                      {e.title}
                    </p>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
      {weather && (
        <div className="shrink-0 mt-[1vh] pt-[1vh] border-t border-ink-700 flex items-center justify-between">
          {weather.next3.map((d) => {
            const dt = new Date(d.date + 'T12:00:00');
            return (
              <div key={d.date} className="text-center">
                <p className="text-[clamp(0.8rem,1.2vw,1.1rem)] text-slate-400">{dt.toLocaleDateString([], { weekday: 'short' })}</p>
                <p className="text-[clamp(0.9rem,1.5vw,1.4rem)] font-semibold tabular-nums">
                  {d.high}° <span className="text-slate-500">{d.low}°</span>
                </p>
              </div>
            );
          })}
          <UpdatedStamp updatedAt={weatherUpdatedAt} error={weatherError} label="Wx" />
        </div>
      )}
      <ChoresPanel chores={chores} onDone={onChoreDone} now={now} />
    </section>
  );
}

// ---- Photo background: cross-fades through family photos with a dark overlay ----
const PHOTO_ROTATE_MS = 5 * 60 * 1000; // new photo every 5 minutes

function usePhotoBackground() {
  const [photo, setPhoto] = useState(null);
  const [next, setNext] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let photos = [];
    let idx = 0;

    const pick = () => {
      if (photos.length === 0) return null;
      idx = (idx + 1 + Math.floor(Math.random() * (photos.length - 1))) % photos.length;
      return photos[idx];
    };

    const load = async () => {
      try {
        const res = await fetch('/api/photos');
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled || !json.photos?.length) return;
        photos = json.photos;
        setPhoto((cur) => cur ?? pick());
      } catch { /* no photos — plain background is fine */ }
    };

    load();
    const rotateId = setInterval(() => {
      const p = pick();
      if (p && !cancelled) {
        // Preload, then swap so the fade is seamless
        const img = new Image();
        img.onload = () => !cancelled && setPhoto(p);
        img.src = p;
      }
    }, PHOTO_ROTATE_MS);
    return () => {
      cancelled = true;
      clearInterval(rotateId);
    };
  }, []);

  return photo;
}

function PhotoBackground({ photo }) {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {photo && (
        <img
          src={photo}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-[3000ms] opacity-100"
        />
      )}
      {/* Dark overlay keeps all text readable over any photo */}
      <div className="absolute inset-0 bg-ink-950/80" />
      <div className="absolute inset-0 bg-gradient-to-b from-ink-950/60 via-transparent to-ink-950/60" />
    </div>
  );
}

export default function App() {
  const now = useClock();
  const events = usePolling('/api/events', EVENTS_POLL_MS);
  const weather = usePolling('/api/weather', WEATHER_POLL_MS);
  const chores = usePolling('/api/chores', EVENTS_POLL_MS);
  useWakeLock();
  const offset = useBurnInShift();
  const photo = usePhotoBackground();

  const handleChoreDone = async (id) => {
    // Optimistic: remove locally, then fire request; refetch on failure
    try {
      await fetch(`/api/chores/${id}/complete`, { method: 'POST' });
      chores.refetch();
    } catch {
      chores.refetch();
    }
  };

  return (
    <div className="relative h-full w-full bg-ink-950">
      <PhotoBackground photo={photo} />
      <div
        className="relative burnin-shift h-full w-full flex flex-col"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        <TopStrip now={now} weather={weather.data} weatherError={weather.error} />
        <main className="flex-1 flex min-h-0">
          <TodayColumn events={events.data} eventsError={events.error} updatedAt={events.updatedAt} now={now} />
          <Next7Column
            events={events.data}
            weather={weather.data}
            weatherError={weather.error}
            weatherUpdatedAt={weather.updatedAt}
            chores={chores.data?.chores}
            onChoreDone={handleChoreDone}
            now={now}
          />
        </main>
      </div>
    </div>
  );
}
