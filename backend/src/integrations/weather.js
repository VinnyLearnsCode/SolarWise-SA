const { cached } = require('./cache');
const { fetchWithRetry } = require('./retry');
const { getPrisma } = require('../utils/prisma');

const MAX_STALE_WEATHER_MS = 6 * 60 * 60 * 1000;
const MET_NORWAY_CACHE_TTL_MS = 3 * 60 * 60 * 1000;

async function getWeather(latitude, longitude, dependencies = {}) {
  const cacheLatitude = Number(latitude.toFixed(3));
  const cacheLongitude = Number(longitude.toFixed(3));
  const key = `weather:${cacheLatitude}:${cacheLongitude}`;
  const cacheTtlMs = positiveSetting('OPEN_METEO_CACHE_TTL_MS', 60 * 60 * 1000, 60_000, 24 * 60 * 60 * 1000);
  const prisma = dependencies.prisma || (process.env.DATABASE_URL ? getPrisma() : null);
  return cached(key, (weather) => weather.source === 'MET Norway Locationforecast'
    ? MET_NORWAY_CACHE_TTL_MS
    : cacheTtlMs, async () => {
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
        const storedTtlMs = storedWeather?.payload.source === 'MET Norway Locationforecast'
          ? MET_NORWAY_CACHE_TTL_MS
          : cacheTtlMs;
        if (storedWeather && isWithinAge(storedWeather.observedAt, storedTtlMs)) {
          return { ...storedWeather.payload, cached: true };
        }
      } catch (error) {
        console.warn(`Stored weather cache read failed: ${error.message}`);
      }
    }

    let upstreamError;
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
      upstreamError = error;
      console.warn(`Open-Meteo request failed: ${error.cause?.code || error.code || error.message}`);
    }

    try {
      const fallbackWeather = await fetchMetNorwayForecast(latitude, longitude, dependencies);
      if (prisma) {
        try {
          await saveStoredWeather(prisma, cacheLatitude, cacheLongitude, fallbackWeather);
        } catch (error) {
          console.warn(`Stored weather cache write failed: ${error.message}`);
        }
      }
      return fallbackWeather;
    } catch (error) {
      console.warn(`MET Norway fallback failed: ${error.cause?.code || error.code || error.message}`);
    }

    if (storedWeather && isWithinAge(storedWeather.observedAt, MAX_STALE_WEATHER_MS)) {
      return {
        ...storedWeather.payload,
        cached: true,
        stale: true,
        cacheExpiredAt: new Date(storedWeather.observedAt).toISOString()
      };
    }

    const rateLimited = upstreamError?.upstreamStatus === 429 || upstreamError?.status === 429;
    const unavailable = new Error(rateLimited
      ? 'Weather services are temporarily unavailable because Open-Meteo is rate-limiting requests.'
      : 'Weather services could not be reached. Please retry later.');
    unavailable.status = 503;
    unavailable.code = rateLimited ? 'UPSTREAM_RATE_LIMITED' : 'UPSTREAM_UNAVAILABLE';
    throw unavailable;
  }, MAX_STALE_WEATHER_MS);
}

async function fetchMetNorwayForecast(latitude, longitude, dependencies) {
  const base = (process.env.MET_NORWAY_BASE_URL
    || 'https://api.met.no/weatherapi/locationforecast/2.0/compact').replace(/\/$/, '');
  const url = new URL(base);
  url.search = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude)
  }).toString();
  const response = await (dependencies.fetchWeatherFallback || fetchWithRetry)(url, {
    retries: 1,
    timeoutMs: 8000,
    retriesEnv: 'MET_NORWAY_RETRIES',
    timeoutEnv: 'MET_NORWAY_TIMEOUT_MS',
    delayEnv: 'MET_NORWAY_RETRY_DELAY_MS',
    headers: {
      'User-Agent': `SolarWiseSA/1.0 (${process.env.PUBLIC_SITE_URL || 'https://github.com/VinnyLearnsCode/SolarWise-SA'})`,
      Accept: 'application/json'
    }
  });
  if (!response.ok) throw serviceError('MET Norway', response.status);
  return normalizeMetNorwayForecast(await response.json());
}

function normalizeMetNorwayForecast(forecast) {
  const timeseries = forecast?.properties?.timeseries;
  if (!Array.isArray(timeseries) || timeseries.length === 0) {
    throw new Error('MET Norway returned an unexpected response shape.');
  }

  const now = Date.now();
  const currentEntry = timeseries.reduce((closest, entry) => {
    const distance = Math.abs(new Date(entry.time).getTime() - now);
    return distance < closest.distance ? { entry, distance } : closest;
  }, { entry: null, distance: Infinity }).entry;
  const currentDetails = currentEntry?.data?.instant?.details;
  if (!currentDetails || !Number.isFinite(currentDetails.air_temperature)
    || !Number.isFinite(currentDetails.cloud_area_fraction)) {
    throw new Error('MET Norway returned an unexpected current forecast.');
  }

  const dailyValues = new Map();
  for (const entry of timeseries) {
    const details = entry.data?.instant?.details;
    if (!details || !Number.isFinite(details.air_temperature)) continue;
    const day = entry.time.slice(0, 10);
    if (!dailyValues.has(day)) {
      dailyValues.set(day, { temperatures: [], clouds: [], precipitation: 0 });
    }
    const values = dailyValues.get(day);
    values.temperatures.push(details.air_temperature);
    if (Number.isFinite(details.cloud_area_fraction)) values.clouds.push(details.cloud_area_fraction);
    const precipitation = entry.data?.next_1_hours?.details?.precipitation_amount
      ?? entry.data?.next_6_hours?.details?.precipitation_amount;
    if (Number.isFinite(precipitation)) values.precipitation += precipitation;
  }

  const days = [...dailyValues.entries()].sort(([first], [second]) => first.localeCompare(second));
  const currentPrecipitation = currentEntry.data?.next_1_hours?.details?.precipitation_amount
    ?? currentEntry.data?.next_6_hours?.details?.precipitation_amount;
  return {
    source: 'MET Norway Locationforecast',
    dataType: 'weather forecast',
    retrievedAt: new Date().toISOString(),
    data: {
      current: {
        temperature_2m: currentDetails.air_temperature,
        relative_humidity_2m: currentDetails.relative_humidity,
        precipitation: Number.isFinite(currentPrecipitation) ? currentPrecipitation : null,
        cloud_cover: currentDetails.cloud_area_fraction,
        wind_speed_10m: Number.isFinite(currentDetails.wind_speed)
          ? currentDetails.wind_speed * 3.6
          : null
      },
      daily: {
        time: days.map(([day]) => day),
        temperature_2m_max: days.map(([, values]) => Math.max(...values.temperatures)),
        temperature_2m_min: days.map(([, values]) => Math.min(...values.temperatures)),
        precipitation_sum: days.map(([, values]) => values.precipitation),
        cloud_cover_mean: days.map(([, values]) => values.clouds.length
          ? values.clouds.reduce((sum, cloud) => sum + cloud, 0) / values.clouds.length
          : null)
      }
    }
  };
}

async function readStoredWeather(prisma, latitude, longitude) {
  const record = await prisma.weatherObservation.findFirst({
    where: { latitude, longitude, sourceName: { in: ['Open-Meteo', 'MET Norway Locationforecast'] } },
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
    data: { latitude, longitude, observedAt, sourceName: payload.source, payload }
  });
  await prisma.weatherObservation.deleteMany({
    where: {
      latitude,
      longitude,
      sourceName: payload.source,
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
module.exports = {
  getWeather,
  MAX_STALE_WEATHER_MS,
  MET_NORWAY_CACHE_TTL_MS,
  normalizeMetNorwayForecast
};
