// Open-Meteo proxy — free, no API key. Indian Trail, NC (1311 Tollcross Rd area)
const LAT = 35.0724;
const LON = -80.6206;
const URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto&forecast_days=4`;

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
let cache = null;

export async function getWeather() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.data;
  }

  // Open-Meteo rate-limits (429) shared datacenter IPs; identify ourselves and retry with backoff
  let json = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(URL, {
      headers: {
        'User-Agent': 'kitchen-dashboard/1.0 (personal household display)',
        Accept: 'application/json'
      }
    });
    if (res.ok) {
      json = await res.json();
      break;
    }
    if (res.status !== 429) throw new Error(`Open-Meteo returned ${res.status}`);
    // 429: wait and retry (1s, 3s)
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1) * (attempt + 1)));
  }
  if (!json) throw new Error('Open-Meteo rate limited (429) after retries');

  const daily = json.daily;
  const data = {
    location: 'Indian Trail, NC',
    current: {
      temp: Math.round(json.current.temperature_2m),
      code: json.current.weather_code
    },
    today: {
      high: Math.round(daily.temperature_2m_max[0]),
      low: Math.round(daily.temperature_2m_min[0])
    },
    next3: [1, 2, 3].map((i) => ({
      date: daily.time[i],
      high: Math.round(daily.temperature_2m_max[i]),
      low: Math.round(daily.temperature_2m_min[i])
    })),
    fetchedAt: new Date().toISOString()
  };

  cache = { data, fetchedAt: Date.now() };
  return data;
}
