const DEFAULTS = Object.freeze({
  performanceRatio: 0.78,
  annualDegradation: 0.005,
  maintenanceRate: 0.01,
  systemLifeYears: 25,
  tariffEscalation: 0.08,
  gridEmissionsKgPerKwh: null,
  selfConsumption: 0.75
});

function annualGenerationKwh(systemKw, dailyIrradiation, performanceRatio = DEFAULTS.performanceRatio) {
  return systemKw * dailyIrradiation * 365 * performanceRatio;
}

function assessSolar(input) {
  const {
    monthlyBill, monthlyConsumption, tariff, systemKw, batteryKwh = 0,
    installationCost, annualTariffIncrease = DEFAULTS.tariffEscalation,
    lifespanYears = DEFAULTS.systemLifeYears, annualMaintenance = null,
    irradiation = 5, performanceRatio = DEFAULTS.performanceRatio,
    selfConsumption = DEFAULTS.selfConsumption, mode = 'hybrid'
  } = input;

  const annualUse = monthlyConsumption * 12;
  const annualGeneration = annualGenerationKwh(systemKw, irradiation, performanceRatio);
  const solarUsed = Math.min(annualUse, annualGeneration * selfConsumption);
  const annualSavings = Math.min(solarUsed * tariff, monthlyBill * 12);
  const maintenance = annualMaintenance ?? installationCost * DEFAULTS.maintenanceRate;
  const netYearOneSavings = Math.max(0, annualSavings - maintenance);
  const paybackYears = netYearOneSavings > 0 ? installationCost / netYearOneSavings : null;
  let cumulative = -installationCost;
  const savingsByHorizon = { 10: -installationCost, 15: -installationCost, 20: -installationCost };
  for (let year = 1; year <= lifespanYears; year += 1) {
    const gross = annualSavings * ((1 + annualTariffIncrease) ** (year - 1)) * ((1 - DEFAULTS.annualDegradation) ** (year - 1));
    cumulative += gross - maintenance;
    for (const horizon of Object.keys(savingsByHorizon).map(Number)) {
      if (year <= horizon) savingsByHorizon[horizon] += gross - maintenance;
    }
  }
  const billReduction = monthlyBill > 0 ? Math.min(100, (annualSavings / (monthlyBill * 12)) * 100) : 0;
  const remainingBill = Math.max(0, monthlyBill - annualSavings / 12);
  const roi = installationCost > 0 ? (cumulative / installationCost) * 100 : 0;
  const gridDependency = annualUse > 0 ? Math.max(0, 100 - (solarUsed / annualUse) * 100) : 100;
  const verdict = paybackYears === null || paybackYears > lifespanYears
    ? 'Not financially attractive under current assumptions'
    : paybackYears <= 7 ? 'Excellent investment'
      : paybackYears <= 12 ? 'Good investment'
        : paybackYears <= lifespanYears * 0.65 ? 'Financially viable with adjustments' : 'Long-term investment';

  return {
    currency: 'ZAR',
    inputs: { systemKw, batteryKwh, installationCost, tariff, mode },
    generation: {
      monthlyKwh: Math.round(annualGeneration / 12),
      annualKwh: Math.round(annualGeneration),
      solarSelfConsumptionPercent: Math.round(selfConsumption * 100)
    },
    financial: {
      estimatedInstallationCost: roundMoney(installationCost),
      monthlySavings: roundMoney(annualSavings / 12),
      annualSavings: roundMoney(annualSavings),
      remainingMonthlyBill: roundMoney(remainingBill),
      billReductionPercent: Math.round(billReduction),
      paybackYears: paybackYears === null ? null : round(paybackYears, 1),
      savings10Years: lifespanYears >= 10 ? roundMoney(savingsByHorizon[10]) : null,
      savings15Years: lifespanYears >= 15 ? roundMoney(savingsByHorizon[15]) : null,
      savings20Years: lifespanYears >= 20 ? roundMoney(savingsByHorizon[20]) : null,
      lifetimeNetSavings: roundMoney(cumulative),
      returnOnInvestmentPercent: round(roi, 1),
      annualMaintenance: roundMoney(maintenance)
    },
    impact: {
      gridDependencyPercent: Math.round(gridDependency),
      estimatedAnnualEmissionsAvoidedKg: DEFAULTS.gridEmissionsKgPerKwh === null
        ? null
        : Math.round(solarUsed * DEFAULTS.gridEmissionsKgPerKwh)
    },
    verdict,
    explanation: `Estimated generation uses ${irradiation} kWh/m²/day irradiation, a ${Math.round(performanceRatio * 100)}% performance ratio and ${Math.round(selfConsumption * 100)}% self-consumption. Savings exclude export revenue and include estimated annual maintenance.`,
    assumptions: { ...DEFAULTS, irradiation, performanceRatio, selfConsumption, annualTariffIncrease, lifespanYears }
  };
}

function round(value, places = 0) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
function roundMoney(value) {
  return round(value, 0);
}

module.exports = { DEFAULTS, annualGenerationKwh, assessSolar };
