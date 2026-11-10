const test = require('node:test');
const assert = require('node:assert/strict');
const { energyCost, monthlyFixedCharges, simulate } = require('../../frontend/javascript/calculators/tariff-math');

test('tiered tariff bills each consumption block at its published rate', () => {
  const tariff = {
    energyBlocks: [
      { upToKwh: 350, ratePerKwh: 2.7237 },
      { upToKwh: 500, ratePerKwh: 3.3318 },
      { upToKwh: null, ratePerKwh: 3.7964 }
    ]
  };
  assert.equal(energyCost(600, tariff), 350 * 2.7237 + 150 * 3.3318 + 100 * 3.7964);
  assert.equal(energyCost(350, tariff), 350 * 2.7237);
  assert.equal(energyCost(0, tariff), 0);
});

test('solar reduces grid energy charges but leaves recurring fixed charges unchanged', () => {
  const result = simulate({
    monthlyConsumptionKwh: 600,
    monthlySolarGenerationKwh: 400,
    selfConsumptionPercent: 75
  }, {
    energyBlocks: [
      { upToKwh: 300, ratePerKwh: 2 },
      { upToKwh: null, ratePerKwh: 3 }
    ],
    fixedMonthlyCharge: 20,
    fixedCharges: [
      { name: 'Service', amount: 10, frequency: 'perMonth' },
      { name: 'Network', amount: 1, frequency: 'perDay' },
      { name: 'Connection', amount: 500, frequency: 'once' }
    ]
  });
  assert.equal(result.solarUsedKwh, 300);
  assert.equal(result.remainingGridUsageKwh, 300);
  assert.equal(result.fixedMonthly, 60);
  assert.equal(result.currentMonthlyBill, 1560);
  assert.equal(result.afterSolarMonthlyBill, 660);
  assert.equal(result.monthlySavings, 900);
  assert.equal(result.annualSavings, 10800);
});

test('flat tariff savings are capped at the energy charge avoided', () => {
  const result = simulate({
    monthlyConsumptionKwh: 250,
    monthlySolarGenerationKwh: 400,
    selfConsumptionPercent: 100
  }, { energyChargePerKwh: 3.5 });
  assert.equal(result.solarUsedKwh, 250);
  assert.equal(result.monthlySavings, 875);
  assert.equal(result.afterSolarMonthlyBill, 0);
});

test('daily fixed charges are projected over a 30-day month', () => {
  assert.equal(monthlyFixedCharges({
    fixedMonthlyCharge: 20,
    fixedCharges: [{ name: 'Network', amount: 2, frequency: 'perDay' }]
  }), 80);
});

test('invalid tier schedules and assumptions are rejected', () => {
  assert.throws(() => energyCost(50, {
    energyBlocks: [{ upToKwh: 100, ratePerKwh: 2 }]
  }), /final tariff block must be unlimited/);
  assert.throws(() => simulate({
    monthlyConsumptionKwh: 10,
    monthlySolarGenerationKwh: 5,
    selfConsumptionPercent: 101
  }, { energyChargePerKwh: 2 }), /between 0 and 100/);
});
