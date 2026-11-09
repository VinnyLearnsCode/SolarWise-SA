const test = require('node:test');
const assert = require('node:assert/strict');
const { getWeather } = require('../src/integrations/weather');

test('weather network failures are surfaced as upstream-unavailable errors', async () => {
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  const previous = {
    retries: process.env.OPEN_METEO_RETRIES,
    delay: process.env.OPEN_METEO_RETRY_DELAY_MS
  };
  process.env.OPEN_METEO_RETRIES = '0';
  process.env.OPEN_METEO_RETRY_DELAY_MS = '0';
  global.fetch = async () => {
    throw new Error('simulated network failure');
  };
  console.warn = () => {};
  try {
    await assert.rejects(getWeather(-24.9876, 16.9876, {
      fetchWeatherFallback: async () => new Response('fallback unavailable', { status: 503 })
    }), (error) => {
      assert.equal(error.status, 503);
      assert.equal(error.code, 'UPSTREAM_UNAVAILABLE');
      return true;
    });
  } finally {
    global.fetch = originalFetch;
    console.warn = originalWarn;
    if (previous.retries === undefined) delete process.env.OPEN_METEO_RETRIES;
    else process.env.OPEN_METEO_RETRIES = previous.retries;
    if (previous.delay === undefined) delete process.env.OPEN_METEO_RETRY_DELAY_MS;
    else process.env.OPEN_METEO_RETRY_DELAY_MS = previous.delay;
  }
});

test('weather retries a transient upstream response and returns validated data', async () => {
  const originalFetch = global.fetch;
  const previous = {
    retries: process.env.OPEN_METEO_RETRIES,
    delay: process.env.OPEN_METEO_RETRY_DELAY_MS
  };
  let attempts = 0;
  process.env.OPEN_METEO_RETRIES = '1';
  process.env.OPEN_METEO_RETRY_DELAY_MS = '0';
  global.fetch = async () => {
    attempts += 1;
    if (attempts === 1) return new Response('temporary error', { status: 503 });
    return new Response(JSON.stringify({
      current: { temperature_2m: 20, cloud_cover: 10 },
      daily: { time: ['2026-11-08'] }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const result = await getWeather(-23.5432, 30.4321);
    assert.equal(attempts, 2);
    assert.equal(result.source, 'Open-Meteo');
    assert.equal(result.data.current.temperature_2m, 20);
    assert.equal(result.cached, false);
  } finally {
    global.fetch = originalFetch;
    if (previous.retries === undefined) delete process.env.OPEN_METEO_RETRIES;
    else process.env.OPEN_METEO_RETRIES = previous.retries;
    if (previous.delay === undefined) delete process.env.OPEN_METEO_RETRY_DELAY_MS;
    else process.env.OPEN_METEO_RETRY_DELAY_MS = previous.delay;
  }
});

test('weather serves a recent persisted forecast when Open-Meteo rate-limits the request', async () => {
  const originalWarn = console.warn;
  const previousCacheTtl = process.env.OPEN_METEO_CACHE_TTL_MS;
  process.env.OPEN_METEO_CACHE_TTL_MS = String(60 * 60 * 1000);
  console.warn = () => {};
  const observedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const payload = {
    source: 'Open-Meteo',
    dataType: 'forecast and recent observations',
    retrievedAt: observedAt.toISOString(),
    data: {
      current: { temperature_2m: 18, cloud_cover: 25 },
      daily: { time: ['2026-11-09'] }
    }
  };
  let calls = 0;
  const prisma = {
    weatherObservation: {
      findFirst: async () => ({ observedAt, payload }),
      create: async () => { throw new Error('unexpected cache write'); },
      deleteMany: async () => ({ count: 0 })
    }
  };

  try {
    const result = await getWeather(-29.1234, 17.1234, {
      prisma,
      fetchWeather: async () => {
        calls += 1;
        return new Response('rate limited', { status: 429 });
      },
      fetchWeatherFallback: async () => new Response('fallback unavailable', { status: 503 })
    });
    assert.equal(calls, 1);
    assert.equal(result.data.current.temperature_2m, 18);
    assert.equal(result.cached, true);
    assert.equal(result.stale, true);
  } finally {
    console.warn = originalWarn;
    if (previousCacheTtl === undefined) delete process.env.OPEN_METEO_CACHE_TTL_MS;
    else process.env.OPEN_METEO_CACHE_TTL_MS = previousCacheTtl;
  }
});

test('weather rejects persisted forecasts older than the stale cutoff', async () => {
  const originalWarn = console.warn;
  const previousCacheTtl = process.env.OPEN_METEO_CACHE_TTL_MS;
  process.env.OPEN_METEO_CACHE_TTL_MS = String(60 * 60 * 1000);
  console.warn = () => {};
  const observedAt = new Date(Date.now() - 7 * 60 * 60 * 1000);
  const payload = {
    source: 'Open-Meteo',
    retrievedAt: observedAt.toISOString(),
    data: {
      current: { temperature_2m: 18, cloud_cover: 25 },
      daily: { time: ['2026-11-09'] }
    }
  };
  let calls = 0;
  const prisma = {
    weatherObservation: {
      findFirst: async () => ({ observedAt, payload })
    }
  };

  try {
    await assert.rejects(getWeather(-28.7634, 17.6532, {
      prisma,
      fetchWeather: async () => {
        calls += 1;
        return new Response('rate limited', { status: 429 });
      },
      fetchWeatherFallback: async () => new Response('fallback unavailable', { status: 503 })
    }), (error) => {
      assert.equal(error.status, 503);
      assert.equal(error.code, 'UPSTREAM_RATE_LIMITED');
      return true;
    });
    assert.equal(calls, 1);
  } finally {
    console.warn = originalWarn;
    if (previousCacheTtl === undefined) delete process.env.OPEN_METEO_CACHE_TTL_MS;
    else process.env.OPEN_METEO_CACHE_TTL_MS = previousCacheTtl;
  }
});

test('weather falls back to MET Norway when Open-Meteo rate-limits requests', async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  const now = new Date();
  const forecast = {
    properties: {
      timeseries: [
        {
          time: now.toISOString(),
          data: {
            instant: { details: {
              air_temperature: 16,
              cloud_area_fraction: 22,
              relative_humidity: 70,
              wind_speed: 3
            } },
            next_1_hours: { details: { precipitation_amount: 0.2 } }
          }
        },
        {
          time: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          data: {
            instant: { details: { air_temperature: 20, cloud_area_fraction: 40 } },
            next_1_hours: { details: { precipitation_amount: 1.5 } }
          }
        }
      ]
    }
  };
  let primaryCalls = 0;
  let fallbackOptions;

  try {
    const result = await getWeather(-26.2041, 28.0473, {
      fetchWeather: async () => {
        primaryCalls += 1;
        return new Response('rate limited', { status: 429 });
      },
      fetchWeatherFallback: async (_url, options) => {
        fallbackOptions = options;
        return new Response(JSON.stringify(forecast), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
    });

    assert.equal(primaryCalls, 1);
    assert.equal(result.source, 'MET Norway Locationforecast');
    assert.equal(result.dataType, 'weather forecast');
    assert.equal(result.data.current.temperature_2m, 16);
    assert.equal(result.data.current.wind_speed_10m, 10.8);
    assert.equal(result.data.daily.time.length, 2);
    assert.equal(result.data.daily.temperature_2m_max[1], 20);
    assert.match(fallbackOptions.headers['User-Agent'], /^SolarWiseSA\/1\.0/);
  } finally {
    console.warn = originalWarn;
  }
});

test('weather reuses a fresh persisted forecast without calling Open-Meteo', async () => {
  const previousCacheTtl = process.env.OPEN_METEO_CACHE_TTL_MS;
  process.env.OPEN_METEO_CACHE_TTL_MS = String(60 * 60 * 1000);
  const observedAt = new Date(Date.now() - 30 * 60 * 1000);
  const payload = {
    source: 'Open-Meteo',
    retrievedAt: observedAt.toISOString(),
    data: {
      current: { temperature_2m: 17, cloud_cover: 20 },
      daily: { time: ['2026-11-09'] }
    }
  };
  const prisma = {
    weatherObservation: {
      findFirst: async () => ({ observedAt, payload })
    }
  };
  let calls = 0;

  try {
    const result = await getWeather(-27.1824, 16.8724, {
      prisma,
      fetchWeather: async () => {
        calls += 1;
        throw new Error('unexpected upstream call');
      }
    });

    assert.equal(result.data.current.temperature_2m, 17);
    assert.equal(result.cached, true);
    assert.equal(calls, 0);
  } finally {
    if (previousCacheTtl === undefined) delete process.env.OPEN_METEO_CACHE_TTL_MS;
    else process.env.OPEN_METEO_CACHE_TTL_MS = previousCacheTtl;
  }
});

test('weather reuses persisted MET Norway forecasts for three hours', async () => {
  const previousCacheTtl = process.env.OPEN_METEO_CACHE_TTL_MS;
  process.env.OPEN_METEO_CACHE_TTL_MS = String(60 * 60 * 1000);
  const observedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const payload = {
    source: 'MET Norway Locationforecast',
    retrievedAt: observedAt.toISOString(),
    data: {
      current: { temperature_2m: 15, cloud_cover: 18 },
      daily: { time: ['2026-11-09'] }
    }
  };
  const prisma = {
    weatherObservation: {
      findFirst: async () => ({ observedAt, payload })
    }
  };
  let upstreamCalls = 0;

  try {
    const result = await getWeather(-25.7631, 21.1452, {
      prisma,
      fetchWeather: async () => {
        upstreamCalls += 1;
        throw new Error('unexpected Open-Meteo call');
      },
      fetchWeatherFallback: async () => {
        upstreamCalls += 1;
        throw new Error('unexpected MET Norway call');
      }
    });

    assert.equal(result.source, 'MET Norway Locationforecast');
    assert.equal(result.cached, true);
    assert.equal(upstreamCalls, 0);
  } finally {
    if (previousCacheTtl === undefined) delete process.env.OPEN_METEO_CACHE_TTL_MS;
    else process.env.OPEN_METEO_CACHE_TTL_MS = previousCacheTtl;
  }
});

test('weather persists successful forecasts for reuse across service restarts', async () => {
  const previousCacheTtl = process.env.OPEN_METEO_CACHE_TTL_MS;
  process.env.OPEN_METEO_CACHE_TTL_MS = String(60 * 60 * 1000);
  let saved;
  let deleted;
  const prisma = {
    weatherObservation: {
      findFirst: async () => null,
      create: async ({ data }) => { saved = data; },
      deleteMany: async ({ where }) => { deleted = where; return { count: 0 }; }
    }
  };

  try {
    const result = await getWeather(-31.1234, 18.1234, {
      prisma,
      fetchWeather: async () => new Response(JSON.stringify({
        current: { temperature_2m: 20, cloud_cover: 12 },
        daily: { time: ['2026-11-09'] }
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    });
    assert.equal(result.cached, false);
    assert.equal(saved.sourceName, 'Open-Meteo');
    assert.equal(saved.latitude, -31.123);
    assert.equal(saved.longitude, 18.123);
    assert.deepEqual(saved.payload.data, result.data);
    assert.equal(deleted.sourceName, 'Open-Meteo');
    assert.ok(deleted.observedAt.lt instanceof Date);
  } finally {
    if (previousCacheTtl === undefined) delete process.env.OPEN_METEO_CACHE_TTL_MS;
    else process.env.OPEN_METEO_CACHE_TTL_MS = previousCacheTtl;
  }
});
