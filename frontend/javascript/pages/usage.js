const usageItems = [{ name: 'Fridge', watts: 150, quantity: 1, hoursPerDay: 8, daysPerMonth: 30 }];
const usageList = document.getElementById('appliance-list');
function drawUsageItems() {
  usageList.innerHTML = usageItems.map((item, index) => `<li>${SolarFormat.escape(item.name)} · ${item.watts} W · ${item.quantity} unit(s) · ${item.hoursPerDay} h/day <button type="button" data-remove="${index}" aria-label="Remove ${SolarFormat.escape(item.name)}">Remove</button></li>`).join('');
  usageList.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
    usageItems.splice(Number(button.dataset.remove), 1);
    drawUsageItems();
  }));
}
drawUsageItems();
document.getElementById('add-appliance').addEventListener('click', () => {
  const name = document.getElementById('appliance-name').value.trim();
  const watts = Number(document.getElementById('appliance-watts').value);
  const quantity = Number(document.getElementById('appliance-count').value);
  const hoursPerDay = Number(document.getElementById('appliance-hours').value);
  const daysPerMonth = Number(document.getElementById('appliance-days').value);
  if (!name || watts <= 0 || quantity <= 0 || hoursPerDay < 0 || hoursPerDay > 24 || daysPerMonth < 0 || daysPerMonth > 31) {
    document.getElementById('usage-error').textContent = 'Enter a name and valid appliance values.';
    return;
  }
  document.getElementById('usage-error').textContent = '';
  usageItems.push({ name, watts, quantity, hoursPerDay, daysPerMonth });
  drawUsageItems();
});
document.getElementById('usage-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const output = document.getElementById('usage-results');
  try {
    const { result } = await SolarAPI.post('/calculations/usage', { tariff: Number(document.getElementById('usage-tariff').value), appliances: usageItems });
    output.innerHTML = `<div class="result-hero"><small>Estimated monthly electricity use</small><strong>${SolarFormat.number(result.monthlyKwh, 1)} kWh</strong></div><div class="result-grid"><div class="result-metric"><small>Average daily use</small><strong>${SolarFormat.number(result.dailyKwh, 1)} kWh</strong></div><div class="result-metric"><small>Estimated annual use</small><strong>${SolarFormat.number(result.annualKwh, 1)} kWh</strong></div><div class="result-metric"><small>Estimated monthly cost</small><strong>${SolarFormat.money(result.estimatedMonthlyCost)}</strong></div><div class="result-metric"><small>Largest listed load</small><strong>${SolarFormat.escape(result.appliances[0]?.name || '—')}</strong></div></div><div class="assumptions">${result.appliances.map((item) => `${SolarFormat.escape(item.name)}: ${SolarFormat.number(item.monthlyKwh, 1)} kWh/mo · ${SolarFormat.money(item.monthlyCost)}`).join('<br>')}</div>`;
  } catch (error) {
    document.getElementById('usage-error').textContent = error.message;
  }
});
