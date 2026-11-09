const plannerSteps = [...document.querySelectorAll('.planner-step')];
let activeStep = 0;
const stepLabel = document.getElementById('step-label');
const progressFill = document.getElementById('progress-fill');
const backButton = document.getElementById('previous-step');
const nextButton = document.getElementById('next-step');
const billInput = document.getElementById('monthly-bill');
const usageInput = document.getElementById('monthly-kwh');
const tariffInput = document.getElementById('tariff');
const startEstimateNote = document.getElementById('start-estimate-note');
const startMode = () => document.querySelector('input[name="start-mode"]:checked').value;

function showStep(index) {
  activeStep = index;
  plannerSteps.forEach((step, i) => { step.hidden = i !== index; });
  stepLabel.textContent = `Step ${index + 1} of ${plannerSteps.length}`;
  progressFill.style.width = `${((index + 1) / plannerSteps.length) * 100}%`;
  backButton.hidden = index === 0;
  nextButton.hidden = index === plannerSteps.length - 1;
  if (index === 2) updatePlan();
  plannerSteps[index].querySelector('h2').focus?.();
}

function updateStartMode() {
  const mode = startMode();
  const billRequired = mode !== 'usage';
  const usageRequired = mode !== 'bill';
  document.getElementById('monthly-bill-field').hidden = mode === 'usage';
  document.getElementById('monthly-usage-field').hidden = mode === 'bill';
  billInput.required = billRequired;
  usageInput.required = usageRequired;
  if (mode === 'usage' && billInput.value === '2500' && !billInput.dataset.touched) {
    billInput.value = '';
  }
  startEstimateNote.textContent = mode === 'bill'
    ? 'If you don’t enter usage, it will be estimated from the bill and energy rate below. Check your bill for the energy charge; fixed charges can make the total bill misleading.'
    : mode === 'usage'
      ? 'If you don’t enter a bill, we’ll estimate it from usage and the energy rate below. This is not a full bill because fixed charges and tariff blocks are not included.'
      : 'If you have not entered an energy rate, the planner uses the bill-to-usage ratio as a rough estimate. Fixed charges can make that differ from your actual energy rate.';
  if (mode === 'both' && !tariffInput.dataset.touched) {
    startEstimateNote.textContent = 'With both figures entered, the bill-to-usage ratio is used as a rough energy-rate estimate. Fixed charges can make it differ from your actual tariff.';
  }
}

function getPlannerInputs() {
  const mode = startMode();
  const bill = Number(billInput.value);
  const usage = Number(usageInput.value);
  let tariff = Number(tariffInput.value);
  if (mode === 'both' && !tariffInput.dataset.touched) tariff = bill / usage;
  const monthlyBill = mode === 'usage' ? usage * tariff : bill;
  const monthlyUsage = mode === 'bill' && !usageInput.value ? bill / tariff : usage;
  return { bill: monthlyBill, usage: monthlyUsage, tariff };
}

function buildCalculatorUrl(systemKw, batteryTarget, mode, inputs) {
  const params = new URLSearchParams({
    guided: '1',
    monthlyBill: String(inputs.bill),
    monthlyConsumption: String(inputs.usage),
    tariff: String(inputs.tariff),
    systemKw: systemKw.toFixed(1),
    batteryKwh: String(batteryTarget),
    mode
  });
  const place = document.getElementById('planner-location').value;
  if (place) params.set('place', place);
  return `calculator.html?${params}`;
}

function updatePlan() {
  const { bill, usage, tariff } = getPlannerInputs();
  if (![bill, usage, tariff].every((value) => Number.isFinite(value) && value > 0)) return;
  const goal = document.querySelector('input[name="goal"]:checked').value;
  const roof = document.getElementById('roof').value;
  const coverage = goal === 'savings' ? 0.55 : goal === 'balanced' ? 0.68 : 0.72;
  const monthlyTarget = usage * coverage;
  const lowKw = monthlyTarget / 140;
  const highKw = monthlyTarget / 100;
  const midKw = (lowKw + highKw) / 2;
  const mode = goal === 'savings' ? 'partial' : goal === 'backup' ? 'backup' : 'hybrid';
  const batteryTarget = goal === 'savings' ? 0 : Number(document.getElementById('battery-target').value || 5);
  const inputs = { bill, usage, tariff };

  document.getElementById('planner-result').innerHTML = `<div class="result-hero"><small>Suggested system size to investigate</small><strong>${SolarFormat.number(lowKw, 1)}–${SolarFormat.number(highKw, 1)} kWp</strong></div><p>Midpoint scenario: about ${SolarFormat.number(midKw * 100)}–${SolarFormat.number(midKw * 140)} kWh/month of modeled generation, roughly ${Math.round(coverage * 100)}% of your entered or estimated monthly usage. This is not a savings estimate.</p><dl><div><dt>Monthly bill entered / estimated</dt><dd>${SolarFormat.money(bill)} / month</dd></div><div><dt>Usage entered / estimated</dt><dd>${SolarFormat.number(usage)} kWh / month</dd></div><div><dt>Energy rate used</dt><dd>R${SolarFormat.number(tariff, 2)} / kWh</dd></div></dl>`;

  const scenarios = [
    { name: 'Lower target', description: 'Smaller system to start with', factor: goal === 'savings' ? 0.4 : goal === 'balanced' ? 0.53 : 0.57 },
    { name: 'Suggested', description: 'A balanced starting point', factor: coverage, featured: true },
    { name: 'Higher target', description: 'More generation capacity to assess', factor: goal === 'savings' ? 0.7 : goal === 'balanced' ? 0.83 : 0.87 }
  ];
  document.getElementById('planner-scenarios').innerHTML = scenarios.map((scenario) => {
    const targetGeneration = usage * scenario.factor;
    const scenarioLowKw = targetGeneration / 140;
    const scenarioHighKw = targetGeneration / 100;
    const scenarioMidKw = (scenarioLowKw + scenarioHighKw) / 2;
    const generationLow = scenarioMidKw * 100;
    const generationHigh = scenarioMidKw * 140;
    const href = buildCalculatorUrl(scenarioMidKw, batteryTarget, mode, inputs);
    return `<article class="planner-scenario${scenario.featured ? ' recommended' : ''}"><h3>${scenario.name}</h3><p>${scenario.description}</p><strong class="scenario-capacity">${SolarFormat.number(scenarioLowKw, 1)}–${SolarFormat.number(scenarioHighKw, 1)} kWp</strong><dl><div><dt>Modeled generation</dt><dd>${SolarFormat.number(generationLow)}–${SolarFormat.number(generationHigh)} kWh/month</dd></div><div><dt>Target share of usage</dt><dd>${Math.round(scenario.factor * 100)}%</dd></div></dl><a class="button ${scenario.featured ? 'primary' : 'secondary'} full" href="${href}">Review this size →</a></article>`;
  }).join('');

  document.getElementById('roof-note').textContent = roof === 'no'
    ? 'You selected limited or shaded roof area. Check usable space and shading with an installer before sizing a system.'
    : roof === 'yes'
      ? 'Roof area is self-reported here; orientation, structure and shading still need an on-site check.'
      : 'Roof space and shading are not assessed. Ask for a roof and shade survey before choosing a system.';
  document.getElementById('calculator-link').href = buildCalculatorUrl(midKw, batteryTarget, mode, inputs);
  document.getElementById('backup-link').href = 'battery.html';
}

function advanceStep() {
  if (activeStep === 0) {
    const fields = [billInput, usageInput, tariffInput].filter((field) => !field.closest('label').hidden);
    for (const field of fields) {
      if (!field.reportValidity()) return;
    }
    const { bill, usage, tariff } = getPlannerInputs();
    if (![bill, usage, tariff].every((value) => Number.isFinite(value) && value > 0)) {
      startEstimateNote.textContent = 'Enter a valid bill, usage and energy rate so we can build a useful estimate.';
      return;
    }
  }
  showStep(Math.min(activeStep + 1, plannerSteps.length - 1));
}

nextButton.addEventListener('click', advanceStep);
document.getElementById('planner-form').addEventListener('submit', (event) => { event.preventDefault(); advanceStep(); });
backButton.addEventListener('click', () => showStep(Math.max(activeStep - 1, 0)));
document.getElementById('tariff').addEventListener('input', (event) => {
  event.currentTarget.dataset.touched = 'true';
  if (activeStep === 2) updatePlan();
});
billInput.addEventListener('input', (event) => {
  event.currentTarget.dataset.touched = 'true';
  if (activeStep === 2) updatePlan();
});
usageInput.addEventListener('input', () => { if (activeStep === 2) updatePlan(); });
document.getElementById('battery-target').addEventListener('input', updatePlan);
document.querySelectorAll('input[name="start-mode"]').forEach((field) => field.addEventListener('change', updateStartMode));
document.querySelectorAll('input[name="goal"], #roof, #planner-location').forEach((field) => field.addEventListener('change', updatePlan));
updateStartMode();
showStep(0);
