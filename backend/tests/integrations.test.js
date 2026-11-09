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
    await assert.rejects(getWeather(-24.9876, 16.9876), (error) => {
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
