const compareQuery = new URLSearchParams(window.location.search);
const compareFields = {
  monthlyBill: 'compare-bill',
  monthlyConsumption: 'compare-use',
  tariff: 'compare-tariff',
  irradiation: 'compare-irradiation',
  systemKw: 'compare-kw'
};
for (const [parameter, id] of Object.entries(compareFields)) {
  const value = compareQuery.get(parameter);
  const field = document.getElementById(id);
  if (value !== null && Number.isFinite(Number(value)) && Number(value) >= Number(field.min || 0) && Number(value) <= Number(field.max || Infinity)) {
    field.value = value;
  }
}
const sharedCost = Number(compareQuery.get('installationCost'));
if (Number.isFinite(sharedCost) && sharedCost > 0) {
  const targetCost = compareQuery.get('mode') === 'partial' ? 'cost-grid' : 'cost-hybrid';
  document.getElementById(targetCost).value = sharedCost;
}
const sharedPlace = compareQuery.get('place');
if (sharedPlace) {
  const note = document.createElement('p');
  note.className = 'compare-location-note';
  note.textContent = `Planner inputs loaded for ${sharedPlace}. Review the location-based solar resource and system costs before comparing.`;
  document.querySelector('.compare-form').append(note);
}

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
