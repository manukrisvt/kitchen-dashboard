import ical from 'node-ical';

// Supports one or more calendars:
//   CALENDAR_ICS_URL="https://.../basic.ics"
//   CALENDAR_ICS_URL="https://.../basic.ics,https://.../basic.ics"
//   CALENDAR_ICS_URL_2, CALENDAR_ICS_URL_3, ... also work
const ICS_URLS = [
  process.env.CALENDAR_ICS_URL,
  process.env.CALENDAR_ICS_URL_2,
  process.env.CALENDAR_ICS_URL_3,
  process.env.CALENDAR_ICS_URL_4
]
  .filter(Boolean)
  .flatMap((v) => v.split(','))
  .map((v) => v.trim())
  .filter(Boolean);

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let cache = null; // { data, fetchedAt }

function dayRange(offsetDays = 0) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + offsetDays);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function overlapsRange(ev, rangeStart, rangeEnd) {
  const s = ev.allDay ? ev.start : ev.start;
  const e = ev.end || ev.start;
  return s < rangeEnd && e >= rangeStart;
}

function toLocalISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function getEvents() {
  if (ICS_URLS.length === 0) {
    throw new Error('CALENDAR_ICS_URL is not set');
  }
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.data;
  }

  // Fetch all calendars in parallel; a failing calendar doesn't kill the rest
  const results = await Promise.allSettled(ICS_URLS.map((url) => ical.async.fromURL(url)));
  const raws = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (raws.length === 0) {
    throw new Error('All calendar fetches failed');
  }
  for (const r of results) {
    if (r.status === 'rejected') console.error('calendar fetch failed:', r.reason?.message);
  }

  // Window: today 00:00 through end of day 7 (i.e. 8 days total)
  const { start: rangeStart } = dayRange(0);
  const { end: rangeEnd } = dayRange(7);

  const events = [];
  const seen = new Set(); // dedupe by uid+start across calendars

  for (const raw of raws) {
    for (const key of Object.keys(raw)) {
      const item = raw[key];
      if (item.type !== 'VEVENT') continue;

      // Expand recurring events into occurrences within the window
      let occurrences;
      if (item.rrule && typeof item.rrule.between === 'function') {
        occurrences = item.rrule.between(rangeStart, rangeEnd, true) || [];
      } else {
        occurrences = [item.start];
      }

      for (const occStart of occurrences) {
        const allDay = item.datetype === 'date';
        const duration = item.end && item.start ? item.end.getTime() - item.start.getTime() : 0;
        const start = occStart;
        const end = item.end ? new Date(occStart.getTime() + duration) : occStart;

        if (!(start < rangeEnd && end >= rangeStart)) continue;

        // Dedupe: same event shared across calendars (uid + occurrence start)
        const dedupeKey = `${item.uid || item.summary}|${start.toISOString()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        events.push({
          title: item.summary || 'Untitled',
          start: start.toISOString(),
          end: end.toISOString(),
          allDay,
          location: item.location || ''
        });
      }
    }
  }

  // Group by local day
  const days = {};
  for (const ev of events) {
    const d = new Date(ev.start);
    const key = toLocalISODate(d);
    if (!days[key]) days[key] = [];
    days[key].push(ev);
  }
  for (const key of Object.keys(days)) {
    days[key].sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1; // all-day pinned first
      return new Date(a.start) - new Date(b.start);
    });
  }

  const data = { days, fetchedAt: new Date().toISOString() };
  cache = { data, fetchedAt: Date.now() };
  return data;
}
