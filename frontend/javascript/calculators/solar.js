const solarForm = document.getElementById('solar-form');
const savedStatus = document.getElementById('saved-status');
let latestAssessment = null;
let locationContext = null;
let availableTariffs = [];
let shouldLoadLocation = false;

if (solarForm) {
  ['monthlyBill', 'monthlyConsumption', 'tariff'].forEach((name) => {
    solarForm.elements[name].step = 'any';
  });
  const query = new URLSearchParams(window.location.search);
  ['monthlyBill', 'monthlyConsumption', 'tariff', 'systemKw', 'batteryKwh', 'irradiation', 'installationCost'].forEach((name) => {
    const value = query.get(name);
    const field = solarForm.elements.namedItem(name);
    if (value !== null && field && Number.isFinite(Number(value)) && Number(value) >= Number(field.min || 0) && Number(value) <= Number(field.max || Infinity)) field.value = value;
  });
  const mode = query.get('mode');
  if (mode && [...solarForm.elements.mode.options].some((option) => option.value === mode)) solarForm.elements.mode.value = mode;
  if (query.get('guided') === '1') document.querySelector('.page-intro p').textContent = 'Your guided planner inputs are ready. Review the figures, add your actual quote or cost estimate, then calculate.';
  const place = query.get('place');
  if (place) {
    const option = [...document.getElementById('solar-location').options]
      .find((candidate) => candidate.value.split('|')[1].toLowerCase() === place.toLowerCase());
    if (option) {
      document.getElementById('solar-location').value = option.value;
      shouldLoadLocation = true;
    }
  }
  loadTariffs();
  renderSavedScenarios();
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
    latestAssessment = { input: payload, result, locationContext };
    renderResult(result, results, payload);
    try {
      const saved = readSavedScenarios();
      saved.unshift(makeScenario(latestAssessment));
      localStorage.setItem('solarwise-scenarios', JSON.stringify(saved.slice(0, 10)));
      renderSavedScenarios();
    } catch (error) {
      savedStatus.textContent = `Estimate calculated, but it could not be saved on this device: ${error.message}`;
    }
  } catch (error) {
    errorNode.textContent = error.message;
    results.innerHTML = '<div class="empty-state"><h2>Could not calculate</h2><p>Check your entries and try again.</p></div>';
  }
});

document.getElementById('load-solar-location')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const status = document.getElementById('solar-location-status');
  const [coords, place] = document.getElementById('solar-location').value.split('|');
  const [latitude, longitude] = coords.split(',');
  const systemKw = Number(solarForm.elements.systemKw.value);
  button.disabled = true;
  status.textContent = `Loading PVGIS modeled production for ${place}…`;
  try {
    const response = await SolarAPI.request(`/solar-potential?latitude=${latitude}&longitude=${longitude}&peakPower=${systemKw}`);
    const annualKwh = Number(response.data?.outputs?.totals?.fixed?.E_y);
    if (!Number.isFinite(annualKwh) || annualKwh <= 0) {
      throw new Error('PVGIS did not return a usable annual production estimate for this location.');
    }
    const equivalentIrradiation = annualKwh / (systemKw * 365 * 0.78);
    if (equivalentIrradiation < 1 || equivalentIrradiation > 10) {
      throw new Error('The PVGIS result is outside the calculator’s supported solar-resource range. Enter an estimate manually.');
    }
    solarForm.elements.irradiation.value = equivalentIrradiation.toFixed(2);
    locationContext = {
      place,
      source: response.source,
      retrievedAt: response.retrievedAt,
      annualKwh: Math.round(annualKwh),
      peakPowerKw: systemKw,
      stale: response.stale === true,
      cached: response.cached === true
    };
    status.textContent = `${place}: modeled ${SolarFormat.number(annualKwh)} kWh/year for ${SolarFormat.number(systemKw, 1)} kWp. Calculator input updated to ${equivalentIrradiation.toFixed(2)} kWh/m²/day equivalent. Source: ${response.source}; retrieved ${new Date(response.retrievedAt).toLocaleString('en-ZA')}${response.stale ? ' (stale cached data)' : response.cached ? ' (cached)' : ''}.`;
  } catch (error) {
    status.textContent = `Could not load a location estimate: ${error.message} Your existing solar-resource input was not changed.`;
  } finally {
    button.disabled = false;
  }
});
document.getElementById('solar-location')?.addEventListener('change', () => {
  locationContext = null;
  document.getElementById('solar-location-status').textContent = 'Load the selected city model to use it in your estimate. The current solar-resource value is unchanged.';
});
solarForm?.elements.irradiation.addEventListener('input', () => {
  if (!locationContext) return;
  locationContext = null;
  document.getElementById('solar-location-status').textContent = 'Solar-resource value edited manually; the previous location model is no longer attached to this estimate.';
});
if (shouldLoadLocation) {
  document.getElementById('load-solar-location')?.click();
}

document.getElementById('tariff-record')?.addEventListener('change', (event) => {
  const status = document.getElementById('tariff-status');
  const tariff = availableTariffs.find((record) => record.id === event.currentTarget.value);
  if (!tariff) {
    status.textContent = 'Enter the energy charge shown on your current bill. Fixed charges and tariff blocks are not included in the estimate.';
    return;
  }
  solarForm.elements.tariff.value = Number(tariff.energyChargePerKwh);
  const verifiedAt = new Date(tariff.lastVerifiedAt);
  const effectiveFrom = new Date(tariff.effectiveFrom);
  const daysSinceVerified = Math.floor((Date.now() - verifiedAt.getTime()) / 86400000);
  const freshness = daysSinceVerified > 365
    ? ` This record was last verified ${daysSinceVerified} days ago; confirm it with your provider before relying on it.`
    : ` Last verified ${new Intl.DateTimeFormat('en-ZA').format(verifiedAt)} (${daysSinceVerified < 0 ? 'date is in the future; verify' : `${daysSinceVerified} days ago`}).`;
  status.replaceChildren();
  status.append(document.createTextNode(
    `${tariff.municipality.province.name} · ${tariff.municipality.name} · ${tariff.name} (${tariff.customerCategory}); effective ${effectiveFrom.toLocaleDateString('en-ZA')}; fixed charge ${SolarFormat.money(Number(tariff.fixedMonthlyCharge))}/month. Verify with your provider.${freshness} Source: `
  ));
  const link = document.createElement('a');
  link.href = tariff.sourceUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'official tariff publication';
  status.append(link, document.createTextNode(` · last verified ${new Date(tariff.lastVerifiedAt).toLocaleDateString('en-ZA')}`));
});

document.getElementById('apply-bill-helper')?.addEventListener('click', () => {
  const total = Number(document.getElementById('bill-helper-total').value);
  const days = Number(document.getElementById('bill-helper-days').value);
  const usage = Number(document.getElementById('bill-helper-usage').value);
  const energyCharges = Number(document.getElementById('bill-helper-energy').value);
  const status = document.getElementById('bill-helper-status');
  if (![total, days, usage, energyCharges].every(Number.isFinite) || total < 0 || days < 1 || days > 90 || usage <= 0 || energyCharges <= 0) {
    status.textContent = 'Enter a total bill, a billing period of 1–90 days, positive kWh, and energy charges excluding fixed charges.';
    return;
  }
  if (energyCharges > total) {
    status.textContent = 'Energy charges cannot exceed the total bill. Check which lines on your bill are energy charges.';
    return;
  }
  const tariff = energyCharges / usage;
  const monthlyBill = total * 30 / days;
  const monthlyUsage = usage * 30 / days;
  if (monthlyBill > 100000000 || monthlyUsage < 1 || monthlyUsage > 1000000 || tariff > 10000) {
    status.textContent = 'These figures are outside the calculator’s supported monthly bill, usage or tariff range. Check the bill period and units.';
    return;
  }
  solarForm.elements.monthlyBill.value = monthlyBill.toFixed(2);
  solarForm.elements.monthlyConsumption.value = monthlyUsage.toFixed(2);
  solarForm.elements.tariff.value = tariff.toFixed(4);
  document.getElementById('tariff-record').value = '';
  status.textContent = `Calculator inputs updated: monthly bill and usage are normalized to 30 days; energy tariff is R${tariff.toFixed(2)}/kWh (energy charges ÷ kWh). Fixed charges are not used to calculate the tariff. Review the values before calculating.`;
});

document.getElementById('saved-scenarios')?.addEventListener('click', (event) => {
  const button = event.target.closest?.('button[data-action]');
  if (!button) return;
  const scenarios = readSavedScenarios();
  const index = Number(button.dataset.index);
  const scenario = scenarios[index];
  if (!scenario) return;
  if (button.dataset.action === 'delete') {
    scenarios.splice(index, 1);
    try {
      localStorage.setItem('solarwise-scenarios', JSON.stringify(scenarios));
      renderSavedScenarios();
    } catch (error) {
      savedStatus.textContent = `Could not delete the saved assessment: ${error.message}`;
    }
    return;
  }
  if (button.dataset.action === 'load') {
    for (const [name, value] of Object.entries(scenario.input)) {
      const field = solarForm.elements.namedItem(name);
      if (field && name !== 'annualTariffIncrease') field.value = value;
      if (name === 'annualTariffIncrease') solarForm.elements[name].value = Number(value) * 100;
    }
    if (scenario.input.mode) solarForm.elements.mode.value = scenario.input.mode;
    locationContext = scenario.locationContext || null;
    if (locationContext) {
      const locationOption = [...document.getElementById('solar-location').options]
        .find((option) => option.value.split('|')[1] === locationContext.place);
      if (locationOption) document.getElementById('solar-location').value = locationOption.value;
    }
    latestAssessment = scenario;
    renderResult(scenario.result, document.getElementById('solar-results'), scenario.input);
    savedStatus.textContent = `Loaded “${scenario.name || 'saved assessment'}”. Review the inputs or calculate again.`;
    solarForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    solarForm.querySelector('button[type="submit"]').focus();
  }
});

document.getElementById('export-scenarios')?.addEventListener('click', () => {
  try {
    const blob = new Blob([JSON.stringify({ format: 'solarwise-scenarios', version: 1, exportedAt: new Date().toISOString(), scenarios: readSavedScenarios() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'solarwise-saved-assessments.json';
    link.click();
    URL.revokeObjectURL(url);
    savedStatus.textContent = 'Saved assessments exported to a JSON file on this device.';
  } catch (error) {
    savedStatus.textContent = `Could not export saved assessments: ${error.message}`;
  }
});

document.getElementById('import-scenarios')?.addEventListener('change', async (event) => {
  const file = event.currentTarget.files[0];
  if (!file) return;
  event.currentTarget.value = '';
  if (file.size > 1000000) {
    savedStatus.textContent = 'Import file is too large. Choose a SolarWise export smaller than 1 MB.';
    return;
  }
  try {
    const imported = JSON.parse(await file.text());
    if (imported.format !== 'solarwise-scenarios' || imported.version !== 1 || !Array.isArray(imported.scenarios)) {
      throw new Error('This is not a supported SolarWise saved-assessments file.');
    }
    if (imported.scenarios.length > 10 || imported.scenarios.some((scenario) => !isValidImportedScenario(scenario))) {
      throw new Error('The file contains too many scenarios or an invalid assessment.');
    }
    const existing = readSavedScenarios();
    const seenIds = new Set(existing.map((scenario) => scenario.id).filter(Boolean));
    const additions = imported.scenarios.filter((scenario) => {
      if (!scenario.id) return true;
      if (seenIds.has(scenario.id)) return false;
      seenIds.add(scenario.id);
      return true;
    });
    const merged = [...existing, ...additions].slice(0, 10);
    const importedCount = merged.length - existing.length;
    localStorage.setItem('solarwise-scenarios', JSON.stringify(merged));
    renderSavedScenarios();
    savedStatus.textContent = `Imported ${importedCount} new assessment(s). Existing assessments were retained; at most 10 are stored.`;
  } catch (error) {
    savedStatus.textContent = `Could not import assessments: ${error.message}`;
  }
});

function isValidImportedScenario(scenario) {
  if (!scenario || typeof scenario !== 'object' || typeof scenario.name !== 'string'
    || !scenario.input || typeof scenario.input !== 'object'
    || !scenario.result || typeof scenario.result !== 'object'
    || !scenario.result.financial || !scenario.result.generation || !scenario.result.impact
    || typeof scenario.result.verdict !== 'string' || typeof scenario.result.explanation !== 'string') return false;
  const input = scenario.input;
  const financial = scenario.result.financial;
  const requiredInputs = ['monthlyBill', 'monthlyConsumption', 'tariff', 'systemKw', 'installationCost', 'annualTariffIncrease', 'irradiation', 'lifespanYears'];
  const numericResults = [
    financial.estimatedInstallationCost, financial.monthlySavings, financial.annualSavings,
    financial.remainingMonthlyBill, financial.billReductionPercent, financial.annualMaintenance,
    financial.returnOnInvestmentPercent, scenario.result.inputs?.systemKw,
    scenario.result.generation.monthlyKwh, scenario.result.impact.gridDependencyPercent
  ];
  const optionalResults = [financial.paybackYears, financial.savings10Years, financial.savings15Years, financial.savings20Years];
  return requiredInputs.every((key) => Number.isFinite(Number(input[key])))
    && (input.batteryKwh === undefined || Number.isFinite(Number(input.batteryKwh)))
    && Number(input.monthlyBill) >= 0 && Number(input.monthlyBill) <= 100000000
    && Number(input.monthlyConsumption) > 0 && Number(input.monthlyConsumption) <= 1000000
    && Number(input.tariff) > 0 && Number(input.tariff) <= 10000
    && Number(input.systemKw) > 0 && Number(input.systemKw) <= 1000
    && (input.batteryKwh === undefined || (Number(input.batteryKwh) >= 0 && Number(input.batteryKwh) <= 10000))
    && Number(input.installationCost) > 0 && Number(input.installationCost) <= 100000000
    && Number(input.annualTariffIncrease) >= 0 && Number(input.annualTariffIncrease) <= 0.5
    && Number(input.irradiation) > 0 && Number(input.irradiation) <= 10
    && Number.isInteger(Number(input.lifespanYears)) && Number(input.lifespanYears) >= 1 && Number(input.lifespanYears) <= 50
    && ['partial', 'backup', 'hybrid', 'off-grid'].includes(input.mode)
    && numericResults.every((value) => Number.isFinite(Number(value)))
    && optionalResults.every((value) => value === null || Number.isFinite(Number(value)))
    && typeof scenario.result.verdict === 'string'
    && typeof scenario.result.explanation === 'string';
}

document.getElementById('saved-scenarios')?.addEventListener('submit', (event) => {
  if (!event.target.matches('[data-scenario-form]')) return;
  event.preventDefault();
  if (!latestAssessment) return;
  const name = String(new FormData(event.target).get('name') || '').trim();
  try {
    const scenarios = readSavedScenarios();
    scenarios.unshift(makeScenario(latestAssessment, name));
    localStorage.setItem('solarwise-scenarios', JSON.stringify(scenarios.slice(0, 10)));
    renderSavedScenarios();
    savedStatus.textContent = `Saved “${name}” on this device.`;
  } catch (error) {
    savedStatus.textContent = `Could not save this assessment: ${error.message}`;
  }
});

async function loadTariffs() {
  const select = document.getElementById('tariff-record');
  const status = document.getElementById('tariff-status');
  try {
    const response = await SolarAPI.request('/tariffs');
    availableTariffs = response.tariffs || [];
    for (const tariff of availableTariffs) {
      const option = document.createElement('option');
      option.value = tariff.id;
      const effectiveFrom = new Date(tariff.effectiveFrom);
      const notYetEffective = effectiveFrom.getTime() > Date.now();
      const daysSinceVerified = Math.floor((Date.now() - new Date(tariff.lastVerifiedAt).getTime()) / 86400000);
      option.textContent = `${tariff.municipality.province.name} · ${tariff.municipality.name} · ${tariff.name} · R${Number(tariff.energyChargePerKwh).toFixed(2)}/kWh${notYetEffective ? ` · starts ${effectiveFrom.toLocaleDateString('en-ZA')}` : ''}${daysSinceVerified > 365 ? ` · verify (last checked ${daysSinceVerified} days ago)` : ''}`;
      option.disabled = notYetEffective;
      select.append(option);
    }
    status.textContent = availableTariffs.length
      ? `${availableTariffs.length} active administrator-maintained tariff(s) available. Verify the source and effective date before use.`
      : 'No active tariff records are published. Enter the energy charge from your bill.';
  } catch (error) {
    status.textContent = `Tariff schedules could not be loaded (${error.message}). Enter the energy charge from your bill.`;
  }
}

function readSavedScenarios() {
  const stored = localStorage.getItem('solarwise-scenarios');
  if (!stored) return [];
  const scenarios = JSON.parse(stored);
  if (!Array.isArray(scenarios)) throw new Error('Saved assessment data is not in the expected format.');
  if (scenarios.some((scenario) => !scenario || !scenario.input || !scenario.result?.financial)) {
    throw new Error('One or more saved assessments are incomplete or damaged.');
  }
  return scenarios;
}

function makeScenario(assessment, name = '') {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name || `Assessment · ${new Date().toLocaleDateString('en-ZA')}`,
    savedAt: new Date().toISOString(),
    ...assessment
  };
}

function renderSavedScenarios() {
  const container = document.getElementById('saved-scenarios');
  if (!container) return;
  let scenarios;
  try {
    scenarios = readSavedScenarios();
  } catch (error) {
    savedStatus.textContent = `Saved assessments could not be read: ${error.message}`;
    container.replaceChildren();
    return;
  }
  savedStatus.textContent = '';
  container.replaceChildren();
  if (latestAssessment) {
    const form = document.createElement('form');
    form.className = 'save-scenario-form';
    form.dataset.scenarioForm = 'true';
    form.innerHTML = '<label>Save the latest result as<input name="name" maxlength="60" required placeholder="e.g. 5 kWp hybrid quote"></label><button class="button secondary" type="submit">Save this assessment</button>';
    container.append(form);
  }
  if (!scenarios.length) {
    const empty = document.createElement('p');
    empty.textContent = 'Your calculator results are saved automatically on this device. You can also give an assessment a name after calculating.';
    container.append(empty);
    return;
  }
  scenarios.forEach((scenario, index) => {
    const card = document.createElement('article');
    card.className = 'saved-scenario-card';
    const title = document.createElement('h3');
    title.textContent = scenario.name || `Saved assessment ${index + 1}`;
    const details = document.createElement('p');
    details.textContent = `${new Date(scenario.savedAt).toLocaleDateString('en-ZA')} · ${scenario.locationContext?.place ? `${scenario.locationContext.place} · ` : ''}${SolarFormat.number(scenario.input.systemKw, 1)} kWp · ${SolarFormat.money(scenario.result.financial.monthlySavings)}/month estimated savings`;
    const actions = document.createElement('div');
    actions.className = 'result-actions';
    actions.innerHTML = `<button type="button" data-action="load" data-index="${index}">Load inputs</button><button type="button" data-action="delete" data-index="${index}">Delete</button>`;
    card.append(title, details, actions);
    container.append(card);
  });
}

function renderResult(result, container, payload) {
  const { financial, generation, impact } = result;
  const emissionsSummary = impact.estimatedAnnualEmissionsAvoidedKg === null
    ? 'Carbon impact is not calculated because no verified South African grid emissions factor is configured.'
    : `Annual emissions avoided: approximately ${SolarFormat.number(impact.estimatedAnnualEmissionsAvoidedKg)} kg CO₂e.`;
  const locationSummary = locationContext
    ? ` Location model: ${locationContext.place}, ${locationContext.source}; ${SolarFormat.number(locationContext.annualKwh)} kWh/year at ${SolarFormat.number(locationContext.peakPowerKw, 1)} kWp, retrieved ${new Date(locationContext.retrievedAt).toLocaleString('en-ZA')}${locationContext.stale ? ' (stale cached data)' : locationContext.cached ? ' (cached)' : ''}.`
    : '';
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
    <p class="assumptions">${SolarFormat.escape(result.explanation)} ${SolarFormat.escape(emissionsSummary)} Remaining bills may include fixed charges.${SolarFormat.escape(locationSummary)}</p>
    <div class="result-actions"><button type="button" data-action="print">Print / save PDF</button><button type="button" data-action="download">Download JSON report</button><button type="button" data-action="stress">Run scenario stress test</button><a class="button secondary" id="compare-link" href="compare.html">Compare configurations</a></div>
    <p class="stress-status" id="stress-status" role="status">Stress test changes modeled solar resource and installed cost by ±10%; it is not a confidence interval or prediction.</p>
    <div id="stress-results" class="stress-results"></div>`;
  updateCompareLink(payload);
  container.querySelector('[data-action=print]').addEventListener('click', () => window.print());
  container.querySelector('[data-action=download]').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ result, generatedAt: new Date().toISOString(), locationContext }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'solarwise-assessment.json';
    link.click();
    URL.revokeObjectURL(link.href);
  });
  container.querySelector('[data-action=stress]').addEventListener('click', (event) => runStressTest(payload, event.currentTarget));
  renderSavedScenarios();
}

async function runStressTest(payload, button) {
  const status = document.getElementById('stress-status');
  const output = document.getElementById('stress-results');
  button.disabled = true;
  status.textContent = 'Calculating the two alternative scenarios…';
  output.replaceChildren();
  const cases = [
    { name: 'Lower-yield / higher-cost case', irradiation: Math.max(1, payload.irradiation * 0.9), installationCost: Math.min(100000000, payload.installationCost * 1.1) },
    { name: 'Higher-yield / lower-cost case', irradiation: Math.min(10, payload.irradiation * 1.1), installationCost: payload.installationCost * 0.9 }
  ];
  try {
    const estimates = await Promise.all(cases.map(async (scenario) => {
      const { result } = await SolarAPI.post('/calculations/solar', { ...payload, ...scenario });
      return { name: scenario.name, result };
    }));
    for (const estimate of estimates) {
      const item = document.createElement('div');
      item.className = 'result-metric';
      const label = document.createElement('small');
      label.textContent = estimate.name;
      const values = document.createElement('strong');
      values.textContent = `Payback: ${estimate.result.financial.paybackYears === null ? 'Not reached' : `${estimate.result.financial.paybackYears} years`} · ${SolarFormat.money(estimate.result.financial.monthlySavings)}/month`;
      item.append(label, values);
      output.append(item);
    }
    status.textContent = 'These are user-input stress cases, not statistical bounds. All other assumptions are held constant.';
  } catch (error) {
    status.textContent = `Stress test could not be completed: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

function updateCompareLink(payload) {
  const link = document.getElementById('compare-link');
  const params = new URLSearchParams();
  ['monthlyBill', 'monthlyConsumption', 'tariff', 'systemKw', 'irradiation', 'installationCost'].forEach((key) => {
    params.set(key, String(payload[key]));
  });
  params.set('mode', payload.mode);
  params.set('place', locationContext?.place || '');
  link.href = `compare.html?${params}`;
}
