const test = require('node:test');
const assert = require('node:assert/strict');
const { annualGenerationKwh, assessSolar } = require('../src/calculations/solar');
const { affordability, loan } = require('../src/calculations/finance');
const { applianceUsage, batterySizing } = require('../src/calculations/energy');

test('annual solar generation applies the configured performance ratio', () => {
  assert.equal(annualGenerationKwh(1, 5, 0.8), 1460);
});

test('solar assessment returns transparent, bounded first-year savings', () => {
  const result = assessSolar({
    monthlyBill: 2500, monthlyConsumption: 600, tariff: 3.5,
    systemKw: 5, installationCost: 140000, irradiation: 5
  });
  assert.equal(result.generation.annualKwh, 7118);
  assert.ok(result.financial.annualSavings <= 30000);
  assert.ok(result.financial.remainingMonthlyBill >= 0);
  assert.equal(result.impact.estimatedAnnualEmissionsAvoidedKg, null);
  assert.equal(result.assumptions.annualDegradation, 0.005);
  assert.equal(result.currency, 'ZAR');
});

test('short system lifespan does not claim unsupported 10-year savings', () => {
  const result = assessSolar({
    monthlyBill: 1000, monthlyConsumption: 300, tariff: 3,
    systemKw: 2, installationCost: 60000, lifespanYears: 5
  });
  assert.equal(result.financial.savings10Years, null);
});

test('affordability handles zero monthly saving and starting balance', () => {
  assert.equal(affordability({ currentSavings: 10000, monthlySaving: 0, targetCost: 9000 }).monthsToTarget, 0);
  assert.equal(affordability({ currentSavings: 0, monthlySaving: 0, targetCost: 9000 }).monthsToTarget, null);
});

test('loan amortization has no interest for a zero-rate loan', () => {
  const result = loan({ systemCost: 12000, deposit: 2000, annualInterestRate: 0, termMonths: 10, monthlySavings: 1000 });
  assert.equal(result.monthlyRepayment, 1000);
  assert.equal(result.totalInterest, 0);
  assert.equal(result.netMonthlyImpact, 0);
});

test('appliance and battery calculations use appliance-specific runtimes', () => {
  const usage = applianceUsage([{ name: 'Kettle', watts: 2000, quantity: 1, hoursPerDay: 0.2, daysPerMonth: 30 }], 3);
  assert.equal(usage.monthlyKwh, 12);
  assert.equal(usage.estimatedMonthlyCost, 36);
  const backup = batterySizing([{ watts: 100, quantity: 2, hours: 5 }], 5);
  assert.equal(backup.usableEnergyKwh, 1);
  assert.ok(backup.recommendedBatteryKwh > 1);
  assert.ok(backup.recommendedInverterKw >= 0.25);
});
