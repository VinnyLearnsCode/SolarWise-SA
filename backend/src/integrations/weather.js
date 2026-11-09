const { cached } = require('./cache');
const { fetchWithRetry } = require('./retry');

async function getWeather(latitude, longitude) {
  const key = `weather:${latitude.toFixed(3)}:${longitude.toFixed(3)}`;
  const cacheTtlMs = positiveSetting('OPEN_METEO_CACHE_TTL_MS', 15 * 60 * 1000, 60_000, 24 * 60 * 60 * 1000);
  return cached(key, cacheTtlMs, async () => {
    const base = (process.env.OPEN_METEO_BASE_URL || 'https://api.open-meteo.com/v1').replace(/\/$/, '');
    const url = new URL(`${base}/forecast`);
    url.search = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: 'temperature_2m,relative_humidity_2m,precipitation,cloud_cover,wind_speed_10m',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,cloud_cover_mean,shortwave_radiation_sum',
      past_days: '7',
      forecast_days: '7',
      timezone: 'auto'
    }).toString();

    try {
      const response = await fetchWithRetry(url);
      if (!response.ok) throw serviceError('Open-Meteo', response.status);
      const data = await response.json();
      validateWeatherPayload(data);
      return {
        source: 'Open-Meteo',
        dataType: 'forecast and recent observations',
        retrievedAt: new Date().toISOString(),
        data
      };
    } catch (error) {
      console.warn(`Open-Meteo request failed after retries: ${error.message}`);
      const unavailable = new Error('Open-Meteo could not be reached. Please retry later.');
      unavailable.status = 503;
      unavailable.code = 'UPSTREAM_UNAVAILABLE';
      throw unavailable;
    }
  });
}

function validateWeatherPayload(data) {
  if (!data || typeof data !== 'object'
    || !data.current || typeof data.current !== 'object'
    || !data.daily || !Array.isArray(data.daily.time)
    || !Number.isFinite(data.current.temperature_2m)
    || !Number.isFinite(data.current.cloud_cover)) {
    throw new Error('Open-Meteo returned an unexpected response shape.');
  }
}

function positiveSetting(name, fallback, min, max) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
}

function serviceError(source, status) {
  const error = new Error(`${source} is temporarily unavailable (HTTP ${status}).`);
  error.status = 503;
  error.code = 'UPSTREAM_UNAVAILABLE';
  return error;
}
module.exports = { getWeather };
