const test = require('node:test');
const assert = require('node:assert/strict');
const { getSolarPotential, getSolarIrradiation } = require('../src/integrations/pvgis');

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
    assert.equal(requestUrl.searchParams.get('aspect'), '180');
    assert.equal(requestUrl.searchParams.get('angle'), '30');
    assert.equal(result.data.outputs.totals.fixed.E_y, 5200);
    assert.equal(result.orientation, 180);
    assert.equal(result.tilt, 30);
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

test('PVGIS uses the requested roof orientation and tilt in distinct cached models', async () => {
  const originalFetch = global.fetch;
  const previous = {
    retries: process.env.PVGIS_RETRIES,
    delay: process.env.PVGIS_RETRY_DELAY_MS,
    timeout: process.env.PVGIS_TIMEOUT_MS
  };
  const requestUrls = [];
  process.env.PVGIS_RETRIES = '0';
  process.env.PVGIS_RETRY_DELAY_MS = '0';
  process.env.PVGIS_TIMEOUT_MS = '5000';
  global.fetch = async (url) => {
    requestUrls.push(new URL(url));
    return new Response(JSON.stringify({
      outputs: { totals: { fixed: { E_y: 5200 } }, monthly: { fixed: [] } }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const north = await getSolarPotential(-26.2041, 28.0473, 7, 180, 25);
    const east = await getSolarPotential(-26.2041, 28.0473, 7, -90, 15);
    assert.equal(requestUrls.length, 2);
    assert.equal(requestUrls[0].searchParams.get('aspect'), '180');
    assert.equal(requestUrls[0].searchParams.get('angle'), '25');
    assert.equal(requestUrls[1].searchParams.get('aspect'), '-90');
    assert.equal(requestUrls[1].searchParams.get('angle'), '15');
    assert.equal(north.orientation, 180);
    assert.equal(north.tilt, 25);
    assert.equal(east.orientation, -90);
    assert.equal(east.tilt, 15);
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

test('PVGIS returns mean annual global horizontal irradiation from its monthly radiation series', async () => {
  const originalFetch = global.fetch;
  const previous = {
    retries: process.env.PVGIS_RETRIES,
    delay: process.env.PVGIS_RETRY_DELAY_MS,
    timeout: process.env.PVGIS_TIMEOUT_MS
  };
  let requestUrl;
  process.env.PVGIS_RETRIES = '0';
  process.env.PVGIS_RETRY_DELAY_MS = '0';
  process.env.PVGIS_TIMEOUT_MS = '5000';
  global.fetch = async (url) => {
    requestUrl = new URL(url);
    return new Response(JSON.stringify({
      inputs: { meteo_data: { year_min: 2005, year_max: 2006, radiation_db: 'PVGIS-SARAH3' } },
      outputs: {
        monthly: [
          { year: 2005, month: 1, 'H(h)_m': 100 },
          { year: 2005, month: 2, 'H(h)_m': 200 },
          { year: 2006, month: 1, 'H(h)_m': 150 },
          { year: 2006, month: 2, 'H(h)_m': 250 }
        ]
      }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const result = await getSolarIrradiation(-24.1234, 17.2345);
    assert.equal(requestUrl.pathname, '/api/v5_3/MRcalc');
    assert.equal(requestUrl.searchParams.get('horirrad'), '1');
    assert.equal(requestUrl.searchParams.get('lat'), '-24.1234');
    assert.equal(result.annualKwhM2, 350);
    assert.equal(result.dailyAverageKwhM2, 350 / 365);
    assert.deepEqual(result.years, { from: 2005, to: 2006, count: 2 });
    assert.equal(result.plane, 'horizontal');
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
