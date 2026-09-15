import ical from 'node-ical';

const ICS_URL = process.env.CALENDAR_ICS_URL;
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
  if (!ICS_URL) {
    throw new Error('CALENDAR_ICS_URL is not set');
  }
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.data;
  }

  const raw = await ical.async.fromURL(ICS_URL);

  // Window: today 00:00 through end of day 7 (i.e. 8 days total)
  const { start: rangeStart } = dayRange(0);
  const { end: rangeEnd } = dayRange(7);

  const events = [];
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

      events.push({
        title: item.summary || 'Untitled',
        start: start.toISOString(),
        end: end.toISOString(),
        allDay,
        location: item.location || ''
      });
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
