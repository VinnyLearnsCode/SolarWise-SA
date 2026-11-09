const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchWithRetry } = require('../src/integrations/retry');

test('fetchWithRetry applies its configured timeout', async () => {
  const originalFetch = global.fetch;
  const previous = {
    retries: process.env.OPEN_METEO_RETRIES,
    timeout: process.env.OPEN_METEO_TIMEOUT_MS
  };
  let attempts = 0;
  process.env.OPEN_METEO_RETRIES = '0';
  process.env.OPEN_METEO_TIMEOUT_MS = '1000';
  global.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    attempts += 1;
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });

  try {
    await assert.rejects(fetchWithRetry('https://weather.invalid'));
    assert.equal(attempts, 1);
  } finally {
    global.fetch = originalFetch;
    if (previous.retries === undefined) delete process.env.OPEN_METEO_RETRIES;
    else process.env.OPEN_METEO_RETRIES = previous.retries;
    if (previous.timeout === undefined) delete process.env.OPEN_METEO_TIMEOUT_MS;
    else process.env.OPEN_METEO_TIMEOUT_MS = previous.timeout;
  }
});
