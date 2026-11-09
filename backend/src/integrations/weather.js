const { cached } = require('./cache');
const { fetchWithRetry } = require('./retry');
const { getPrisma } = require('../utils/prisma');

const MAX_STALE_WEATHER_MS = 6 * 60 * 60 * 1000;

async function getWeather(latitude, longitude, dependencies = {}) {
  const cacheLatitude = Number(latitude.toFixed(3));
  const cacheLongitude = Number(longitude.toFixed(3));
  const key = `weather:${cacheLatitude}:${cacheLongitude}`;
  const cacheTtlMs = positiveSetting('OPEN_METEO_CACHE_TTL_MS', 60 * 60 * 1000, 60_000, 24 * 60 * 60 * 1000);
  const prisma = dependencies.prisma || (process.env.DATABASE_URL ? getPrisma() : null);
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

    let storedWeather = null;
    if (prisma) {
      try {
        storedWeather = await readStoredWeather(prisma, cacheLatitude, cacheLongitude);
        if (storedWeather && isWithinAge(storedWeather.observedAt, cacheTtlMs)) {
          return { ...storedWeather.payload, cached: true };
        }
      } catch (error) {
        console.warn(`Stored weather cache read failed: ${error.message}`);
      }
    }

    try {
      const response = await (dependencies.fetchWeather || fetchWithRetry)(url);
      if (!response.ok) throw serviceError('Open-Meteo', response.status);
      const data = await response.json();
      validateWeatherPayload(data);
      const weather = {
        source: 'Open-Meteo',
        dataType: 'forecast and recent observations',
        retrievedAt: new Date().toISOString(),
        data
      };
      if (prisma) {
        try {
          await saveStoredWeather(prisma, cacheLatitude, cacheLongitude, weather);
        } catch (error) {
          console.warn(`Stored weather cache write failed: ${error.message}`);
        }
      }
      return weather;
    } catch (error) {
      const reason = error.cause?.code || error.code || error.message;
      console.warn(`Open-Meteo request failed after retries: ${reason}`);
      if (storedWeather && isWithinAge(storedWeather.observedAt, MAX_STALE_WEATHER_MS)) {
        return {
          ...storedWeather.payload,
          cached: true,
          stale: true,
          cacheExpiredAt: new Date(storedWeather.observedAt).toISOString()
        };
      }
      const rateLimited = error.upstreamStatus === 429 || error.status === 429;
      const unavailable = new Error('Open-Meteo could not be reached. Please retry later.');
      if (rateLimited) {
        unavailable.message = 'Open-Meteo is rate-limiting requests. Please retry later.';
      }
      unavailable.status = 503;
      unavailable.code = rateLimited ? 'UPSTREAM_RATE_LIMITED' : 'UPSTREAM_UNAVAILABLE';
      throw unavailable;
    }
  }, MAX_STALE_WEATHER_MS);
}

async function readStoredWeather(prisma, latitude, longitude) {
  const record = await prisma.weatherObservation.findFirst({
    where: { latitude, longitude, sourceName: 'Open-Meteo' },
    orderBy: { observedAt: 'desc' },
    select: { observedAt: true, payload: true }
  });
  if (!record || !record.payload || typeof record.payload !== 'object') return null;
  validateWeatherPayload(record.payload.data);
  return { observedAt: record.observedAt, payload: record.payload };
}

async function saveStoredWeather(prisma, latitude, longitude, payload) {
  const observedAt = new Date(payload.retrievedAt);
  await prisma.weatherObservation.create({
    data: { latitude, longitude, observedAt, sourceName: 'Open-Meteo', payload }
  });
  await prisma.weatherObservation.deleteMany({
    where: {
      latitude,
      longitude,
      sourceName: 'Open-Meteo',
      observedAt: { lt: new Date(observedAt.getTime() - 7 * 24 * 60 * 60 * 1000) }
    }
  });
}

function isWithinAge(timestamp, maxAgeMs) {
  const age = Date.now() - new Date(timestamp).getTime();
  return Number.isFinite(age) && age >= 0 && age <= maxAgeMs;
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
  error.upstreamStatus = status;
  error.code = 'UPSTREAM_UNAVAILABLE';
  return error;
}
module.exports = { getWeather, MAX_STALE_WEATHER_MS };
