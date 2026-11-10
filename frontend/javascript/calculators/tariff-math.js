(function attachTariffMath(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TariffMath = api;
})(globalThis, () => {
  function energyCost(usageKwh, tariff) {
    if (!Number.isFinite(usageKwh) || usageKwh < 0) {
      throw new RangeError('Monthly usage must be a non-negative number.');
    }

    if (Array.isArray(tariff.energyBlocks) && tariff.energyBlocks.length) {
      let previousLimit = 0;
      let remainingUsage = usageKwh;
      let total = 0;
      for (const [index, block] of tariff.energyBlocks.entries()) {
        const limit = block.upToKwh;
        if (limit !== null && (!Number.isFinite(limit) || limit <= previousLimit)) {
          throw new TypeError('Tariff blocks must have increasing usage limits.');
        }
        if (!Number.isFinite(block.ratePerKwh) || block.ratePerKwh < 0) {
          throw new TypeError('Every tariff block needs a non-negative energy rate.');
        }
        if (index === tariff.energyBlocks.length - 1 && limit !== null) {
          throw new TypeError('The final tariff block must be unlimited.');
        }

        const blockCapacity = limit === null ? remainingUsage : limit - previousLimit;
        const blockUsage = Math.min(remainingUsage, blockCapacity);
        total += blockUsage * block.ratePerKwh;
        remainingUsage -= blockUsage;
        if (limit !== null) previousLimit = limit;
      }
      if (remainingUsage > 1e-8) throw new TypeError('The tariff schedule does not cover all usage.');
      return total;
    }

    const rate = Number(tariff.energyChargePerKwh);
    if (!Number.isFinite(rate) || rate < 0) {
      throw new TypeError('A tariff needs a non-negative flat energy rate or tiered schedule.');
    }
    return usageKwh * rate;
  }

  function monthlyFixedCharges(tariff) {
    let total = Number(tariff.fixedMonthlyCharge || 0);
    if (!Number.isFinite(total) || total < 0) throw new TypeError('Monthly fixed charge must be non-negative.');
    for (const charge of tariff.fixedCharges || []) {
      const amount = Number(charge.amount);
      if (!Number.isFinite(amount) || amount < 0) throw new TypeError('Fixed charge amounts must be non-negative.');
      if (charge.frequency === 'perMonth') total += amount;
      else if (charge.frequency === 'perDay') total += amount * 30;
    }
    return total;
  }

  function simulate({ monthlyConsumptionKwh, monthlySolarGenerationKwh, selfConsumptionPercent }, tariff) {
    if (!Number.isFinite(monthlyConsumptionKwh) || monthlyConsumptionKwh <= 0) {
      throw new RangeError('Monthly grid consumption must be greater than zero.');
    }
    if (!Number.isFinite(monthlySolarGenerationKwh) || monthlySolarGenerationKwh < 0) {
      throw new RangeError('Monthly solar generation must be non-negative.');
    }
    if (!Number.isFinite(selfConsumptionPercent) || selfConsumptionPercent < 0 || selfConsumptionPercent > 100) {
      throw new RangeError('Self-consumption must be between 0 and 100 percent.');
    }

    const solarUsedKwh = Math.min(
      monthlyConsumptionKwh,
      monthlySolarGenerationKwh * selfConsumptionPercent / 100
    );
    const remainingGridUsageKwh = monthlyConsumptionKwh - solarUsedKwh;
    const fixedMonthly = monthlyFixedCharges(tariff);
    const currentEnergyCharge = energyCost(monthlyConsumptionKwh, tariff);
    const afterSolarEnergyCharge = energyCost(remainingGridUsageKwh, tariff);
    const currentMonthlyBill = currentEnergyCharge + fixedMonthly;
    const afterSolarMonthlyBill = afterSolarEnergyCharge + fixedMonthly;
    const monthlySavings = currentMonthlyBill - afterSolarMonthlyBill;

    return {
      monthlyConsumptionKwh,
      monthlySolarGenerationKwh,
      solarUsedKwh,
      remainingGridUsageKwh,
      currentEnergyCharge,
      afterSolarEnergyCharge,
      fixedMonthly,
      currentMonthlyBill,
      afterSolarMonthlyBill,
      monthlySavings,
      annualSavings: monthlySavings * 12
    };
  }

  return { energyCost, monthlyFixedCharges, simulate };
});
