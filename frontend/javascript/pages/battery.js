const batteryItems = [];
const batteryList = document.getElementById('battery-list');
function drawBatteryItems() {
  batteryList.innerHTML = batteryItems.length ? batteryItems.map((item, index) => `<li>${SolarFormat.escape(item.name)} · ${item.watts} W · ${item.quantity} unit(s) · ${item.hours} h <button type="button" data-remove="${index}" aria-label="Remove ${SolarFormat.escape(item.name)}">Remove</button></li>`).join('') : '<li class="list-empty">No loads added yet. Add a preset or enter a custom load above.</li>';
  batteryList.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
    batteryItems.splice(Number(button.dataset.remove), 1);
    drawBatteryItems();
  }));
}
const batteryPresets = {
  lights: { name: 'LED lights', watts: 10, quantity: 4 },
  router: { name: 'Wi-Fi router', watts: 15, quantity: 1 },
  fridge: { name: 'Fridge (running)', watts: 150, quantity: 1 },
  television: { name: 'LED TV', watts: 100, quantity: 1 },
  laptop: { name: 'Laptop', watts: 60, quantity: 1 },
  phone: { name: 'Phone charging', watts: 15, quantity: 1 }
};
document.getElementById('battery-preset')?.addEventListener('change', (event) => {
  const preset = batteryPresets[event.currentTarget.value];
  if (!preset) return;
  const hours = Number(document.getElementById('backup-duration').value) || 5;
  batteryItems.push({ ...preset, hours });
  document.getElementById('battery-hours').value = hours;
  document.getElementById('battery-error').textContent = '';
  drawBatteryItems();
  event.currentTarget.value = '';
});
document.getElementById('battery-add').addEventListener('click', () => {
  const name = document.getElementById('battery-name').value.trim();
  const watts = Number(document.getElementById('battery-watts').value);
  const quantity = Number(document.getElementById('battery-count').value);
  const hours = Number(document.getElementById('battery-hours').value);
  if (!name || !Number.isFinite(watts) || !Number.isFinite(quantity) || !Number.isFinite(hours) || watts <= 0 || quantity <= 0 || hours <= 0 || hours > 168) {
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
