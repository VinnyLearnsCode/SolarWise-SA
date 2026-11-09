function applianceUsage(items, tariff = 0) {
  const breakdown = items.map((item) => {
    const monthlyKwh = item.watts * item.quantity * item.hoursPerDay * item.daysPerMonth / 1000;
    return { name: item.name, monthlyKwh: Math.round(monthlyKwh * 10) / 10, monthlyCost: Math.round(monthlyKwh * tariff) };
  });
  const monthlyKwh = breakdown.reduce((sum, item) => sum + item.monthlyKwh, 0);
  return {
    appliances: breakdown.sort((a, b) => b.monthlyKwh - a.monthlyKwh),
    dailyKwh: Math.round(monthlyKwh / 30 * 10) / 10,
    monthlyKwh: Math.round(monthlyKwh * 10) / 10,
    annualKwh: Math.round(monthlyKwh * 12 * 10) / 10,
    estimatedMonthlyCost: Math.round(monthlyKwh * tariff)
  };
}

function batterySizing(appliances, hours, { depthOfDischarge = 0.8, inverterEfficiency = 0.92, reserve = 1.15 } = {}) {
  const loadKw = appliances.reduce((sum, item) => sum + item.watts * item.quantity / 1000, 0);
  const energyKwh = appliances.reduce((sum, item) => sum + item.watts * item.quantity * item.hours / 1000, 0);
  const requiredCapacityKwh = energyKwh * reserve / (depthOfDischarge * inverterEfficiency);
  return {
    loadKw: Math.round(loadKw * 100) / 100,
    usableEnergyKwh: Math.round(energyKwh * 100) / 100,
    recommendedBatteryKwh: Math.ceil(requiredCapacityKwh * 10) / 10,
    recommendedInverterKw: Math.ceil(loadKw * 1.25 * 10) / 10,
    assumptions: { depthOfDischarge, inverterEfficiency, reserve }
  };
}

module.exports = { applianceUsage, batterySizing };
