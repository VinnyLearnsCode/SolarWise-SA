const plannerSteps = [...document.querySelectorAll('.planner-step')];
let activeStep = 0;
const stepLabel = document.getElementById('step-label');
const progressFill = document.getElementById('progress-fill');
const backButton = document.getElementById('previous-step');
const nextButton = document.getElementById('next-step');

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

function updatePlan() {
  const bill = Number(document.getElementById('monthly-bill').value);
  const usage = Number(document.getElementById('monthly-kwh').value);
  const tariffInput = document.getElementById('tariff');
  if (!tariffInput.dataset.touched && bill > 0 && usage > 0) tariffInput.value = (bill / usage).toFixed(2);
  const tariff = Number(tariffInput.value);
  const goal = document.querySelector('input[name="goal"]:checked').value;
  const roof = document.getElementById('roof').value;
  const coverage = goal === 'savings' ? 0.55 : goal === 'balanced' ? 0.68 : 0.72;
  const monthlyTarget = usage * coverage;
  // Broad planning range: 100–140 kWh per kWp per month, not a site-specific yield forecast.
  const lowKw = monthlyTarget / 140;
  const highKw = monthlyTarget / 100;
  const midKw = (lowKw + highKw) / 2;
  const mode = goal === 'savings' ? 'partial' : goal === 'backup' ? 'backup' : 'hybrid';
  const batteryTarget = goal === 'savings' ? 0 : Number(document.getElementById('battery-target').value || 5);
  document.getElementById('planner-result').innerHTML = `<div class="result-hero"><small>Indicative solar capacity to investigate</small><strong>${SolarFormat.number(lowKw, 1)}–${SolarFormat.number(highKw, 1)} kWp</strong></div><p>That range could model roughly ${SolarFormat.number(monthlyTarget)} kWh/month of solar generation at the selected target share. Your actual result may differ substantially.</p><dl><div><dt>Bill entered</dt><dd>${SolarFormat.money(bill)} / month</dd></div><div><dt>Energy use entered</dt><dd>${SolarFormat.number(usage)} kWh / month</dd></div><div><dt>Tariff used in next estimate</dt><dd>${SolarFormat.money(tariff)} / kWh</dd></div></dl>`;
  document.getElementById('roof-note').textContent = roof === 'no'
    ? 'You selected limited or shaded roof area. Check usable space and shading with an installer before sizing a system.'
    : roof === 'yes'
      ? 'Roof area is self-reported here; orientation, structure and shading still need an on-site check.'
      : 'Roof space and shading are not assessed. Ask for a roof and shade survey before choosing a system.';
  const params = new URLSearchParams({ guided: '1', monthlyBill: String(bill), monthlyConsumption: String(usage), tariff: String(tariff), systemKw: midKw.toFixed(1), batteryKwh: String(batteryTarget), mode });
  const place = document.getElementById('planner-location').value;
  if (place) params.set('place', place);
  document.getElementById('calculator-link').href = `calculator.html?${params}`;
  document.getElementById('backup-link').href = 'battery.html';
}

function advanceStep() {
  if (activeStep === 0) {
    const fields = plannerSteps[0].querySelectorAll('input');
    for (const field of fields) {
      if (!field.reportValidity()) return;
    }
  }
  showStep(Math.min(activeStep + 1, plannerSteps.length - 1));
}
nextButton.addEventListener('click', advanceStep);
document.getElementById('planner-form').addEventListener('submit', (event) => { event.preventDefault(); advanceStep(); });
backButton.addEventListener('click', () => showStep(Math.max(activeStep - 1, 0)));
document.getElementById('tariff').addEventListener('input', (event) => { event.currentTarget.dataset.touched = 'true'; });
document.getElementById('battery-target').addEventListener('input', updatePlan);
document.querySelectorAll('input[name="goal"], #roof, #planner-location').forEach((field) => field.addEventListener('change', updatePlan));
showStep(0);
