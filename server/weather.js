// Open-Meteo proxy — free, no API key. Charlotte, NC area (35.08, -80.67)
const LAT = 35.08;
const LON = -80.67;
const URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto&forecast_days=4`;

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
let cache = null;

export async function getWeather() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.data;
  }

  const res = await fetch(URL);
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);
  const json = await res.json();

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
