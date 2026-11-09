const locationButton = document.getElementById('load-location');
const requestedPlace = new URLSearchParams(window.location.search).get('place');
let requestedLocationFound = false;
if (requestedPlace) {
  const matchingOption = Array.from(document.getElementById('location').options)
    .find((option) => option.value.split('|')[1].toLowerCase() === requestedPlace.toLowerCase());
  if (matchingOption) {
    document.getElementById('location').value = matchingOption.value;
    requestedLocationFound = true;
  }
}
locationButton?.addEventListener('click', async () => {
  const [coords, place] = document.getElementById('location').value.split('|');
  const [latitude, longitude] = coords.split(',');
  const peakPower = document.getElementById('peak-power').value;
  const output = document.getElementById('location-results');
  const errorNode = document.getElementById('explorer-error');
  errorNode.textContent = '';
  output.innerHTML = '<div class="empty-state"><span class="empty-icon">…</span><h2>Loading location data</h2><p>Contacting weather and solar data services.</p></div>';
  locationButton.disabled = true;
  const [solarResponse, weatherResponse] = await Promise.allSettled([
    SolarAPI.request(`/solar-potential?latitude=${latitude}&longitude=${longitude}&peakPower=${peakPower}`),
    SolarAPI.request(`/weather?latitude=${latitude}&longitude=${longitude}`)
  ]);
  locationButton.disabled = false;
  if (solarResponse.status === 'rejected' && weatherResponse.status === 'rejected') {
    errorNode.textContent = `${solarResponse.reason.message} ${weatherResponse.reason.message}`;
    output.innerHTML = '<div class="empty-state"><h2>Location data unavailable</h2><p>External services did not respond. Please retry later.</p></div>';
    return;
  }
  let html = `<div class="eyebrow">${SolarFormat.escape(place)} · data snapshot</div><h2>Solar &amp; weather context</h2>`;
  if (solarResponse.status === 'fulfilled') {
    const solar = solarResponse.value;
    const annual = solar.data?.outputs?.totals?.fixed?.E_y;
    const monthly = solar.data?.outputs?.monthly?.fixed || [];
    html += `<div class="result-grid"><div class="result-metric"><small>PVGIS modeled annual output · ${peakPower} kWp</small><strong>${annual == null ? 'Not returned' : `${SolarFormat.number(annual)} kWh/year`}</strong></div><div class="result-metric"><small>Average modeled daily output</small><strong>${annual == null ? 'Not returned' : `${SolarFormat.number(annual / 365, 1)} kWh/day`}</strong></div></div>
      <p class="assumptions">${SolarFormat.escape(solar.source)} · ${SolarFormat.escape(solar.dataType)} · retrieved ${new Date(solar.retrievedAt).toLocaleString('en-ZA')}${solar.stale ? ' · stale cached data' : solar.cached ? ' · cached' : ''}. Model uses PVGIS defaults (30° tilt, south-facing, 14% system loss). Reported output may depend on API output availability.</p>`;
    if (monthly.length) {
      html += `<div class="chart-wrap"><canvas id="solar-chart" role="img" aria-label="Modeled solar energy by month"></canvas></div>`;
    }
  } else {
    html += `<p class="form-error">Solar potential unavailable: ${SolarFormat.escape(solarResponse.reason.message)}</p>`;
  }
  if (weatherResponse.status === 'fulfilled') {
    const weather = weatherResponse.value;
    const current = weather.data.current || {};
    const daily = weather.data.daily || {};
    const indices = (daily.time || []).map((_, index) => index).slice(-7);
    html += `<div class="weather-card"><h3>Weather conditions · ${SolarFormat.escape(weather.data.timezone || place)}</h3><p>Current forecast/observation: ${current.temperature_2m ?? '—'}°C · cloud cover ${current.cloud_cover ?? '—'}% · precipitation ${current.precipitation ?? '—'} mm.</p><div class="weather-days">${indices.map((index) => `<div><b>${new Date(`${daily.time[index]}T12:00:00`).toLocaleDateString('en-ZA', { weekday: 'short' })}</b><span>${daily.temperature_2m_max?.[index] ?? '—'}° / ${daily.temperature_2m_min?.[index] ?? '—'}°</span><span>${daily.cloud_cover_mean?.[index] ?? '—'}% cloud</span></div>`).join('')}</div></div>
      <p class="assumptions">${SolarFormat.escape(weather.source)} · weather forecast and recent observations · retrieved ${new Date(weather.retrievedAt).toLocaleString('en-ZA')}${weather.stale ? ' · stale cached data' : weather.cached ? ' · cached' : ''}. Forecasts are not historical climate averages.</p>`;
  } else {
    html += `<p class="form-error">Weather unavailable: ${SolarFormat.escape(weatherResponse.reason.message)}</p>`;
  }
  output.innerHTML = html;
  if (solarResponse.status === 'fulfilled') drawSolarChart(solarResponse.value.data.outputs?.monthly?.fixed || []);
});
if (requestedLocationFound) locationButton.click();

function drawSolarChart(monthly) {
  if (!monthly.length || !window.Chart) return;
  const canvas = document.getElementById('solar-chart');
  const labels = monthly.map((month) => month.month);
  const values = monthly.map((month) => month.E_m);
  new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Modeled monthly solar energy (kWh)', data: values, backgroundColor: '#42a8ed', borderRadius: 7 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'kWh' } } } }
  });
}
