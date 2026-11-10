const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseTariffCsv, importTariffCsv } = require('../src/controllers/admin');
const app = require('../app');

const header = 'municipality,province,name,customerCategory,effectiveFrom,lastVerifiedAt,fixedMonthlyCharge,energyChargePerKwh,sourceUrl,feedInRatePerKwh,timeOfUseRates';
const validRow = '"City of Johannesburg",Gauteng,"Residential, standard",Residential,2026-07-01,2026-11-10,250,3.4567,https://www.example.gov.za/tariffs,,';

test('tariff worksheet includes every map municipality without prefilled rates', () => {
  const template = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'data', 'tariff-import-template.csv'), 'utf8');
  const rows = template.trim().split(/\r?\n/);
  assert.equal(rows.length, 214);
  assert.equal(rows[0], header);
  assert.ok(rows.some((row) => row.startsWith('City of Johannesburg,Gauteng,')));
  assert.ok(rows.every((row, index) => index === 0 || row.endsWith(',,,,,,,,,') || row.split(',').length === 11));
});

test('tariff CSV parser supports quoted commas and optional values', () => {
  const [record] = parseTariffCsv(`${header}\r\n${validRow}`);
  assert.equal(record.municipality, 'City of Johannesburg');
  assert.equal(record.name, 'Residential, standard');
  assert.equal(record.energyChargePerKwh, 3.4567);
  assert.equal(record.effectiveFrom.toISOString(), '2026-07-01T00:00:00.000Z');
  assert.equal(record.sourceLine, 2);
});

test('tariff CSV parser ignores untouched municipality worksheet rows', () => {
  const blankRow = ['Abaqulusi', 'KwaZulu-Natal', ...Array(9).fill('')].join(',');
  const records = parseTariffCsv(`${header}\n${blankRow}\n${validRow}`);
  assert.equal(records.length, 1);
  assert.equal(records[0].sourceLine, 3);
});

test('tariff CSV parser rejects missing headers, malformed dates, and insecure sources', () => {
  assert.throws(() => parseTariffCsv('municipality,province\nCity of Johannesburg,Gauteng'), /Missing columns/);
  assert.throws(() => parseTariffCsv(`${header}\n${validRow.replace('2026-07-01', '2026-02-30')}`), /not a valid date/);
  assert.throws(() => parseTariffCsv(`${header}\n${validRow.replace('https://', 'http://')}`), /HTTPS/);
});

test('tariff CSV importer creates missing canonical municipalities and skips existing tariff records', async () => {
  const state = { municipalities: [], tariffs: [] };
  const province = { id: 'gauteng', name: 'Gauteng' };
  const database = {
    $transaction: (callback) => callback({
      province: {
        findMany: async () => [province]
      },
      municipality: {
        findMany: async () => state.municipalities,
        createMany: async ({ data }) => {
          for (const item of data) {
            if (!state.municipalities.some((municipality) => municipality.name === item.name)) {
              state.municipalities.push({ id: item.name, ...item });
            }
          }
          return { count: data.length };
        }
      },
      electricityTariff: {
        findMany: async () => state.tariffs,
        createMany: async ({ data }) => {
          state.tariffs.push(...data);
          return { count: data.length };
        }
      }
    })
  };
  const first = await importTariffCsv(`${header}\n${validRow}`, database);
  assert.deepEqual(first, { imported: 1, skippedDuplicates: 0, municipalitiesCreated: 1 });
  const changedRate = validRow.replace('3.4567', '3.5000');
  await assert.rejects(
    importTariffCsv(`${header}\n${changedRate}`, database),
    /already exist with different values/
  );
  const second = await importTariffCsv(`${header}\n${validRow}`, database);
  assert.deepEqual(second, { imported: 0, skippedDuplicates: 1, municipalitiesCreated: 0 });
});

test('tariff CSV import endpoint requires administrator authentication', async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/tariffs/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ csv: 'x'.repeat(40000) })
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'UNAUTHORIZED');
});
