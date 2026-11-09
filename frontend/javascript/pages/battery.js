const batteryItems = [];
const batteryList = document.getElementById('battery-list');
function drawBatteryItems() {
  batteryList.innerHTML = batteryItems.map((item, index) => `<li>${SolarFormat.escape(item.name)} · ${item.watts} W · ${item.quantity} unit(s) · ${item.hours} h <button type="button" data-remove="${index}" aria-label="Remove ${SolarFormat.escape(item.name)}">Remove</button></li>`).join('');
  batteryList.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
    batteryItems.splice(Number(button.dataset.remove), 1);
    drawBatteryItems();
  }));
}
document.getElementById('battery-add').addEventListener('click', () => {
  const name = document.getElementById('battery-name').value.trim();
  const watts = Number(document.getElementById('battery-watts').value);
  const quantity = Number(document.getElementById('battery-count').value);
  const hours = Number(document.getElementById('battery-hours').value);
  if (!name || watts <= 0 || quantity <= 0 || hours <= 0) {
    document.getElementById('battery-error').textContent = 'Enter a name, power, quantity and runtime greater than zero.';
    return;
  }
  batteryItems.push({ name, watts, quantity, hours });
  document.getElementById('battery-error').textContent = '';
  drawBatteryItems();
});
document.getElementById('battery-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!batteryItems.length) {
    document.getElementById('battery-error').textContent = 'Add at least one essential appliance.';
    return;
  }
  const output = document.getElementById('battery-results');
  try {
    const { result } = await SolarAPI.post('/calculations/battery', { hours: Number(document.getElementById('backup-duration').value), appliances: batteryItems });
    output.innerHTML = `<div class="result-hero"><small>Estimated usable backup energy</small><strong>${SolarFormat.number(result.usableEnergyKwh, 2)} kWh</strong></div><div class="result-grid"><div class="result-metric"><small>Indicative nominal battery capacity</small><strong>${SolarFormat.number(result.recommendedBatteryKwh, 1)} kWh</strong></div><div class="result-metric"><small>Indicative inverter rating</small><strong>${SolarFormat.number(result.recommendedInverterKw, 1)} kW</strong></div><div class="result-metric"><small>Combined running load</small><strong>${SolarFormat.number(result.loadKw, 2)} kW</strong></div><div class="result-metric"><small>Runtime input</small><strong>${document.getElementById('backup-duration').value} hours</strong></div></div><p class="assumptions">Capacity includes 15% reserve, 80% depth of discharge and 92% inverter efficiency. This simple estimate does not include appliance surge/start-up power, temperature derating, battery aging or charging time. A qualified designer must verify sizing.</p>`;
  } catch (error) {
    document.getElementById('battery-error').textContent = error.message;
  }
});
