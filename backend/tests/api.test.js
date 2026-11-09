const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app');

test('health endpoint responds without a database connection', async (context) => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = '';
  const server = app.listen(0);
  context.after(() => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    return new Promise((resolve) => server.close(resolve));
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');

  const readiness = await fetch(`${base}/api/health/ready`);
  assert.equal(readiness.status, 503);
  assert.equal((await readiness.json()).database.status, 'not_configured');

  const solar = await fetch(`${base}/api/calculations/solar`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      monthlyBill: 2500, monthlyConsumption: 600, tariff: 3.5,
      systemKw: 5, installationCost: 140000
    })
  });
  assert.equal(solar.status, 200);
  assert.equal((await solar.json()).result.currency, 'ZAR');

  const loan = await fetch(`${base}/api/calculations/loan`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ systemCost: 12000, deposit: 2000, annualInterestRate: 0, termMonths: 10 })
  });
  assert.equal(loan.status, 200);
  assert.equal((await loan.json()).result.monthlyRepayment, 1000);

  const savings = await fetch(`${base}/api/calculations/affordability`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ currentSavings: 0, monthlySaving: 500, targetCost: 6000 })
  });
  assert.equal(savings.status, 200);
  assert.equal((await savings.json()).result.monthsToTarget, 12);

  const usage = await fetch(`${base}/api/calculations/usage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tariff: 3, appliances: [{ name: 'Kettle', watts: 2000, quantity: 1, hoursPerDay: 0.2, daysPerMonth: 30 }]
    })
  });
  assert.equal(usage.status, 200);
  assert.equal((await usage.json()).result.monthlyKwh, 12);

  const battery = await fetch(`${base}/api/calculations/battery`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hours: 5, appliances: [{ watts: 100, quantity: 2, hours: 5 }] })
  });
  assert.equal(battery.status, 200);
  assert.ok((await battery.json()).result.recommendedBatteryKwh > 1);

  const invalid = await fetch(`${base}/api/calculations/solar`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ monthlyBill: -1 })
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR');
});
