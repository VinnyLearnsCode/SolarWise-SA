document.getElementById('compare-run')?.addEventListener('click', async () => {
  const button = document.getElementById('compare-run');
  const output = document.getElementById('compare-results');
  button.disabled = true;
  output.innerHTML = '<p>Calculating comparable estimates…</p>';
  const base = {
    monthlyBill: Number(document.getElementById('compare-bill').value),
    monthlyConsumption: Number(document.getElementById('compare-use').value),
    tariff: Number(document.getElementById('compare-tariff').value),
    systemKw: Number(document.getElementById('compare-kw').value),
    irradiation: Number(document.getElementById('compare-irradiation').value),
    annualTariffIncrease: 0.08
  };
  const configs = [
    { name: 'Grid-tied · no battery', cost: 'cost-grid', mode: 'partial', batteryKwh: 0, selfConsumption: 0.65 },
    { name: 'Hybrid · battery backup', cost: 'cost-hybrid', mode: 'hybrid', batteryKwh: 5, selfConsumption: 0.75 },
    { name: 'Off-grid · indicative', cost: 'cost-offgrid', mode: 'off-grid', batteryKwh: 12, selfConsumption: 0.9 }
  ];
  try {
    const results = await Promise.all(configs.map(async (config) => {
      const { result } = await SolarAPI.post('/calculations/solar', {
        ...base, installationCost: Number(document.getElementById(config.cost).value),
        mode: config.mode, batteryKwh: config.batteryKwh, selfConsumption: config.selfConsumption
      });
      return { config, result };
    }));
    output.innerHTML = results.map(({ config, result }) => `<article class="compare-card"><h2>${SolarFormat.escape(config.name)}</h2><p>Assumed installation cost: ${SolarFormat.money(result.inputs.installationCost)} · ${result.inputs.systemKw} kWp</p><div class="result-hero"><small>Estimated year-one monthly savings</small><strong>${SolarFormat.money(result.financial.monthlySavings)}</strong></div><div class="result-metric"><small>Simple payback</small><strong>${result.financial.paybackYears === null ? 'Not reached' : `${result.financial.paybackYears} years`}</strong></div><div class="result-metric"><small>10-year net savings</small><strong>${SolarFormat.money(result.financial.savings10Years)}</strong></div><div class="result-metric"><small>Modeled grid dependency</small><strong>${result.impact.gridDependencyPercent}%</strong></div><p>${SolarFormat.escape(result.explanation)} Backup duration, seasonal off-grid resilience and export fees are not calculated.</p></article>`).join('');
  } catch (error) {
    output.innerHTML = `<p class="form-error">${SolarFormat.escape(error.message)}</p>`;
  } finally {
    button.disabled = false;
  }
});
