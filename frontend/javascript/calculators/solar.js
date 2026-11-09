const solarForm = document.getElementById('solar-form');
if (solarForm) {
  const query = new URLSearchParams(window.location.search);
  ['monthlyBill', 'monthlyConsumption', 'tariff', 'systemKw', 'batteryKwh'].forEach((name) => {
    const value = query.get(name);
    const field = solarForm.elements.namedItem(name);
    if (value !== null && field && Number.isFinite(Number(value)) && Number(value) >= Number(field.min || 0) && Number(value) <= Number(field.max || Infinity)) field.value = value;
  });
  const mode = query.get('mode');
  if (mode && [...solarForm.elements.mode.options].some((option) => option.value === mode)) solarForm.elements.mode.value = mode;
  if (query.get('guided') === '1') document.querySelector('.page-intro p').textContent = 'Your guided planner inputs are ready. Review the figures, add your actual quote or cost estimate, then calculate.';
}
solarForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const errorNode = document.getElementById('solar-error');
  const results = document.getElementById('solar-results');
  const data = Object.fromEntries(new FormData(form));
  const payload = {
    ...Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'mode')),
    mode: data.mode
  };
  ['monthlyBill', 'monthlyConsumption', 'tariff', 'systemKw', 'batteryKwh', 'installationCost', 'lifespanYears'].forEach((key) => {
    if (payload[key] !== '') payload[key] = Number(payload[key]);
  });
  payload.annualTariffIncrease = Number(data.annualTariffIncrease) / 100;
  payload.irradiation = Number(data.irradiation);
  payload.lifespanYears = Number(data.lifespanYears);
  errorNode.textContent = '';
  results.innerHTML = '<div class="empty-state"><span class="empty-icon">…</span><h2>Calculating your estimate</h2><p>Using your inputs and the stated assumptions.</p></div>';
  try {
    const { result } = await SolarAPI.post('/calculations/solar', payload);
    renderResult(result, results);
    const saved = JSON.parse(localStorage.getItem('solarwise-scenarios') || '[]');
    saved.unshift({ savedAt: new Date().toISOString(), input: payload, result });
    localStorage.setItem('solarwise-scenarios', JSON.stringify(saved.slice(0, 10)));
  } catch (error) {
    errorNode.textContent = error.message;
    results.innerHTML = '<div class="empty-state"><h2>Could not calculate</h2><p>Check your entries and try again.</p></div>';
  }
});

function renderResult(result, container) {
  const { financial, generation, impact } = result;
  const emissionsSummary = impact.estimatedAnnualEmissionsAvoidedKg === null
    ? 'Carbon impact is not calculated because no verified South African grid emissions factor is configured.'
    : `Annual emissions avoided: approximately ${SolarFormat.number(impact.estimatedAnnualEmissionsAvoidedKg)} kg CO₂e.`;
  container.innerHTML = `
    <div class="result-hero"><small>Assessment verdict</small><strong>${SolarFormat.escape(result.verdict)}</strong></div>
    <div class="result-grid">
      <div class="result-metric"><small>Estimated installed cost</small><strong>${SolarFormat.money(financial.estimatedInstallationCost)}</strong></div>
      <div class="result-metric"><small>Recommended input system</small><strong>${SolarFormat.number(result.inputs.systemKw, 1)} kWp</strong></div>
      <div class="result-metric"><small>Estimated generation</small><strong>${SolarFormat.number(generation.monthlyKwh)} kWh/mo</strong></div>
      <div class="result-metric"><small>Estimated bill reduction</small><strong>${SolarFormat.number(financial.billReductionPercent)}%</strong></div>
      <div class="result-metric"><small>Monthly bill savings</small><strong>${SolarFormat.money(financial.monthlySavings)}</strong></div>
      <div class="result-metric"><small>Remaining monthly bill</small><strong>${SolarFormat.money(financial.remainingMonthlyBill)}</strong></div>
      <div class="result-metric"><small>Simple payback</small><strong>${financial.paybackYears === null ? 'Not reached' : `${financial.paybackYears} years`}</strong></div>
      <div class="result-metric"><small>Estimated 10-year net savings</small><strong>${financial.savings10Years === null ? 'Beyond system lifespan' : SolarFormat.money(financial.savings10Years)}</strong></div>
      <div class="result-metric"><small>15-year net savings</small><strong>${financial.savings15Years === null ? 'Beyond system lifespan' : SolarFormat.money(financial.savings15Years)}</strong></div>
      <div class="result-metric"><small>20-year net savings</small><strong>${financial.savings20Years === null ? 'Beyond system lifespan' : SolarFormat.money(financial.savings20Years)}</strong></div>
      <div class="result-metric"><small>Modeled ROI over lifespan</small><strong>${SolarFormat.number(financial.returnOnInvestmentPercent, 1)}%</strong></div>
      <div class="result-metric"><small>Grid dependency (estimate)</small><strong>${SolarFormat.number(impact.gridDependencyPercent)}%</strong></div>
    </div>
    <p class="assumptions">${SolarFormat.escape(result.explanation)} ${SolarFormat.escape(emissionsSummary)} Remaining bills may include fixed charges.</p>
    <div class="result-actions"><button type="button" data-action="print">Print / save PDF</button><button type="button" data-action="download">Download JSON report</button><button type="button" data-action="saved">View locally saved count</button></div>`;
  container.querySelector('[data-action=print]').addEventListener('click', () => window.print());
  container.querySelector('[data-action=download]').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ result, generatedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'solarwise-assessment.json';
    link.click();
    URL.revokeObjectURL(link.href);
  });
  container.querySelector('[data-action=saved]').addEventListener('click', () => {
    const saved = JSON.parse(localStorage.getItem('solarwise-scenarios') || '[]');
    const list = saved.slice(1, 6);
    const savedList = container.querySelector('.saved-scenarios');
    if (savedList) {
      savedList.remove();
      return;
    }
    container.insertAdjacentHTML('beforeend', `<div class="assumptions saved-scenarios"><b>${saved.length} scenario(s) saved on this device</b>${list.length ? `<br>${list.map((scenario) => `${new Date(scenario.savedAt).toLocaleDateString('en-ZA')}: ${SolarFormat.money(scenario.result.financial.monthlySavings)}/month · ${SolarFormat.escape(scenario.result.verdict)}`).join('<br>')}` : ''}</div>`);
  });
}
