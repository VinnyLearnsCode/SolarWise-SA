const test = require('node:test');
const assert = require('node:assert/strict');
const { getSolarPotential } = require('../src/integrations/pvgis');

test('PVGIS retries transient server failures and returns the modeled result', async () => {
  const originalFetch = global.fetch;
  const previous = {
    retries: process.env.PVGIS_RETRIES,
    delay: process.env.PVGIS_RETRY_DELAY_MS,
    timeout: process.env.PVGIS_TIMEOUT_MS
  };
  let attempts = 0;
  let requestUrl;
  process.env.PVGIS_RETRIES = '1';
  process.env.PVGIS_RETRY_DELAY_MS = '0';
  process.env.PVGIS_TIMEOUT_MS = '5000';
  global.fetch = async (url) => {
    attempts += 1;
    requestUrl = new URL(url);
    if (attempts === 1) return new Response('temporary error', { status: 503 });
    return new Response(JSON.stringify({
      outputs: { totals: { fixed: { E_y: 5200 } }, monthly: { fixed: [] } }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const result = await getSolarPotential(-26.2041, 28.0473, 5);
    assert.equal(attempts, 2);
    assert.equal(requestUrl.pathname, '/api/v5_3/PVcalc');
    assert.equal(requestUrl.searchParams.get('peakpower'), '5');
    assert.equal(result.data.outputs.totals.fixed.E_y, 5200);
    assert.equal(result.source, 'European Commission Joint Research Centre PVGIS');
  } finally {
    global.fetch = originalFetch;
    if (previous.retries === undefined) delete process.env.PVGIS_RETRIES;
    else process.env.PVGIS_RETRIES = previous.retries;
    if (previous.delay === undefined) delete process.env.PVGIS_RETRY_DELAY_MS;
    else process.env.PVGIS_RETRY_DELAY_MS = previous.delay;
    if (previous.timeout === undefined) delete process.env.PVGIS_TIMEOUT_MS;
    else process.env.PVGIS_TIMEOUT_MS = previous.timeout;
  }
});

test('PVGIS reports a clear unavailable error after exhausted network retries', async () => {
  const originalFetch = global.fetch;
  const previous = {
    retries: process.env.PVGIS_RETRIES,
    delay: process.env.PVGIS_RETRY_DELAY_MS,
    timeout: process.env.PVGIS_TIMEOUT_MS
  };
  let attempts = 0;
  process.env.PVGIS_RETRIES = '1';
  process.env.PVGIS_RETRY_DELAY_MS = '0';
  process.env.PVGIS_TIMEOUT_MS = '5000';
  global.fetch = async () => {
    attempts += 1;
    throw new Error('simulated network failure');
  };

  try {
    await assert.rejects(getSolarPotential(-25.7312, 27.1234, 8), (error) => {
      assert.equal(error.status, 503);
      assert.equal(error.code, 'UPSTREAM_UNAVAILABLE');
      assert.match(error.message, /PVGIS could not be reached/);
      return true;
    });
    assert.equal(attempts, 2);
  } finally {
    global.fetch = originalFetch;
    if (previous.retries === undefined) delete process.env.PVGIS_RETRIES;
    else process.env.PVGIS_RETRIES = previous.retries;
    if (previous.delay === undefined) delete process.env.PVGIS_RETRY_DELAY_MS;
    else process.env.PVGIS_RETRY_DELAY_MS = previous.delay;
    if (previous.timeout === undefined) delete process.env.PVGIS_TIMEOUT_MS;
    else process.env.PVGIS_TIMEOUT_MS = previous.timeout;
  }
});
