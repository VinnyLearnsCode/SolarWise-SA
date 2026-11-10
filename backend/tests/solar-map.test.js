const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = require('../app');

const mapDataDirectory = path.join(__dirname, '..', '..', 'frontend', 'data', 'solar-map');

test('solar map boundary files include nine provinces and all 213 local municipalities', () => {
  const provinces = JSON.parse(fs.readFileSync(path.join(mapDataDirectory, 'provinces.geojson'), 'utf8'));
  const index = JSON.parse(fs.readFileSync(path.join(mapDataDirectory, 'municipality-index.json'), 'utf8'));
  const expectedProvinces = [
    'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo',
    'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'
  ];

  assert.deepEqual(provinces.features.map((feature) => feature.properties.name).sort(), expectedProvinces.sort());
  assert.equal(index.length, 213);
  assert.equal(new Set(index.map((municipality) => `${municipality.province}|${municipality.name}`)).size, 213);
  let boundaryCount = 0;
  for (const province of expectedProvinces) {
    const slug = province.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const collection = JSON.parse(fs.readFileSync(path.join(mapDataDirectory, 'municipalities', `${slug}.geojson`), 'utf8'));
    assert.ok(collection.features.length > 0, `${province} has local municipal boundaries`);
    assert.ok(collection.features.every((feature) => feature.properties.province === province));
    assert.ok(collection.features.every((feature) => Array.isArray(feature.properties.representativePoint)
      && feature.properties.representativePoint.length === 2));
    boundaryCount += collection.features.length;
  }
  assert.equal(boundaryCount, 213);
});

test('solar map page and boundary data are publicly served with Leaflet styling allowed', async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const pageResponse = await fetch(`${baseUrl}/html/solar-map.html`);
  assert.equal(pageResponse.status, 200);
  const page = await pageResponse.text();
  assert.match(page, /javascript\/pages\/solar-map\.js/);
  assert.match(page, /leaflet@1\.9\.4\/dist\/leaflet\.css/);
  assert.match(pageResponse.headers.get('content-security-policy'), /style-src[^;]*https:\/\/cdn\.jsdelivr\.net/);
  const boundaryResponse = await fetch(`${baseUrl}/data/solar-map/provinces.geojson`);
  assert.equal(boundaryResponse.status, 200);
  assert.equal((await boundaryResponse.json()).features.length, 9);
  const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`);
  assert.match(await sitemapResponse.text(), /\/html\/solar-map\.html/);
});

test('solar map irradiation endpoint serves PVGIS model metadata', async (context) => {
  const server = app.listen(0);
  const originalFetch = global.fetch;
  const previous = {
    retries: process.env.PVGIS_RETRIES,
    delay: process.env.PVGIS_RETRY_DELAY_MS
  };
  process.env.PVGIS_RETRIES = '0';
  process.env.PVGIS_RETRY_DELAY_MS = '0';
  global.fetch = async () => new Response(JSON.stringify({
    outputs: { monthly: [
      { year: 2005, month: 1, 'H(h)_m': 100 },
      { year: 2005, month: 2, 'H(h)_m': 200 }
    ] }
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  context.after(() => {
    global.fetch = originalFetch;
    if (previous.retries === undefined) delete process.env.PVGIS_RETRIES;
    else process.env.PVGIS_RETRIES = previous.retries;
    if (previous.delay === undefined) delete process.env.PVGIS_RETRY_DELAY_MS;
    else process.env.PVGIS_RETRY_DELAY_MS = previous.delay;
    return new Promise((resolve) => server.close(resolve));
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/solar-irradiation?latitude=-24&longitude=25`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.source, 'European Commission Joint Research Centre PVGIS');
  assert.equal(body.annualKwhM2, 300);
  assert.equal(body.plane, 'horizontal');

  const invalid = await originalFetch(`http://127.0.0.1:${server.address().port}/api/solar-irradiation?latitude=0&longitude=25`);
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR');
});

test('solar map financial endpoint reuses verified PVGIS generation and stated calculator assumptions', async (context) => {
  const server = app.listen(0);
  const originalFetch = global.fetch;
  const previous = {
    retries: process.env.PVGIS_RETRIES,
    delay: process.env.PVGIS_RETRY_DELAY_MS
  };
  process.env.PVGIS_RETRIES = '0';
  process.env.PVGIS_RETRY_DELAY_MS = '0';
  let requestUrl;
  global.fetch = async (url) => {
    requestUrl = new URL(url);
    return new Response(JSON.stringify({
      outputs: { totals: { fixed: { E_y: 10000 } }, monthly: { fixed: [] } }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  context.after(() => {
    global.fetch = originalFetch;
    if (previous.retries === undefined) delete process.env.PVGIS_RETRIES;
    else process.env.PVGIS_RETRIES = previous.retries;
    if (previous.delay === undefined) delete process.env.PVGIS_RETRY_DELAY_MS;
    else process.env.PVGIS_RETRY_DELAY_MS = previous.delay;
    return new Promise((resolve) => server.close(resolve));
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/solar-map/financial-estimate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      latitude: -24.1234,
      longitude: 17.4321,
      monthlyBill: 3000,
      monthlyConsumption: 600,
      tariff: 3,
      systemKw: 5,
      installationCost: 140000,
      orientation: 180,
      tilt: 25
    })
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.result.generation.annualKwh, 10000);
  assert.equal(body.result.financial.annualSavings, 21600);
  assert.equal(body.result.financial.paybackYears, 6.9);
  assert.equal(body.assumptions.selfConsumption, 0.75);
  assert.equal(body.assumptions.annualTariffIncrease, 0.08);
  assert.equal(requestUrl.searchParams.get('aspect'), '180');
  assert.equal(requestUrl.searchParams.get('angle'), '25');

  const invalid = await originalFetch(`http://127.0.0.1:${server.address().port}/api/solar-map/financial-estimate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ latitude: -24, longitude: 25 })
  });
  assert.equal(invalid.status, 400);
});
