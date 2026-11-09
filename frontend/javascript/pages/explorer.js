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
  if (weatherResponse.status === 'fulfilled') {
    html += renderWeather(weatherResponse.value, place);
  } else {
    html += `<p class="form-error">Weather unavailable: ${SolarFormat.escape(weatherResponse.reason.message)}</p>`;
  }
  if (solarResponse.status === 'fulfilled') {
    html += `<div id="solar-model-result">${renderSolar(solarResponse.value, peakPower)}</div>`;
  } else {
    html += `<div id="solar-model-result" class="solar-model-error" role="status"><p class="form-error">Solar potential unavailable: ${SolarFormat.escape(solarResponse.reason.message)}</p><button class="button secondary" id="retry-solar" type="button">Retry solar model</button></div>`;
  }
  output.innerHTML = html;
  if (solarResponse.status === 'fulfilled') drawSolarChart(solarResponse.value.data.outputs?.monthly?.fixed || []);
  else {
    document.getElementById('retry-solar')?.addEventListener('click', async (event) => {
      await retrySolarModel(event.currentTarget, latitude, longitude, peakPower);
    });
  }
});
if (requestedLocationFound) locationButton.click();

async function retrySolarModel(button, latitude, longitude, peakPower) {
  const solarResult = document.getElementById('solar-model-result');
  button.disabled = true;
  button.textContent = 'Retrying solar model…';
  try {
    const solar = await SolarAPI.request(`/solar-potential?latitude=${latitude}&longitude=${longitude}&peakPower=${peakPower}`);
    solarResult.innerHTML = renderSolar(solar, peakPower);
    drawSolarChart(solar.data.outputs?.monthly?.fixed || []);
  } catch (error) {
    solarResult.innerHTML = `<p class="form-error">Solar potential unavailable: ${SolarFormat.escape(error.message)}</p><button class="button secondary" id="retry-solar" type="button">Retry solar model</button>`;
    solarResult.querySelector('#retry-solar').addEventListener('click', (event) => {
      retrySolarModel(event.currentTarget, latitude, longitude, peakPower);
    });
  }
}

function renderSolar(solar, peakPower) {
  const annual = solar.data?.outputs?.totals?.fixed?.E_y;
  const monthly = solar.data?.outputs?.monthly?.fixed || [];
  return `<div class="result-grid"><div class="result-metric"><small>PVGIS modeled annual output · ${peakPower} kWp</small><strong>${annual == null ? 'Not returned' : `${SolarFormat.number(annual)} kWh/year`}</strong></div><div class="result-metric"><small>Average modeled daily output</small><strong>${annual == null ? 'Not returned' : `${SolarFormat.number(annual / 365, 1)} kWh/day`}</strong></div></div>
    <p class="assumptions">${SolarFormat.escape(solar.source)} · ${SolarFormat.escape(solar.dataType)} · retrieved ${new Date(solar.retrievedAt).toLocaleString('en-ZA')}${solar.stale ? ' · stale cached data' : solar.cached ? ' · cached' : ''}. Model uses PVGIS defaults (30° tilt, south-facing, 14% system loss). Reported output may depend on API output availability.</p>
    ${monthly.length ? '<div class="chart-wrap"><canvas id="solar-chart" role="img" aria-label="Modeled solar energy by month"></canvas></div>' : ''}`;
}

function renderWeather(weather, place) {
  const current = weather.data.current || {};
  const daily = weather.data.daily || {};
  const timezone = weather.data.timezone || 'Africa/Johannesburg';
  const indices = (daily.time || []).map((_, index) => index);
  if (weather.source === 'Open-Meteo') indices.splice(0, Math.max(0, indices.length - 7));
  else indices.splice(7);
  const currentCondition = describeWeather(current.cloud_cover, current.precipitation);
  const isNight = current.is_day === 0 || current.is_day === false
    || (current.is_day !== 1 && current.is_day !== true && isNightAtLocalTime(current.time, timezone));
  const nightIcon = {
    sun: 'moon',
    'partly-cloudy': 'partly-cloudy-night',
    rain: 'rain-night'
  }[currentCondition.icon];
  const currentIcon = isNight ? nightIcon || currentCondition.icon : currentCondition.icon;
  const currentLabel = {
    moon: 'Mostly clear night',
    'partly-cloudy-night': 'Partly cloudy night',
    'rain-night': 'Rain likely tonight'
  }[currentIcon] || currentCondition.label;
  const moonPhase = currentIcon === 'moon' || currentIcon === 'partly-cloudy-night' || currentIcon === 'rain-night'
    ? getMoonPhase(current.time, timezone)
    : null;
  const currentTemperature = formatWeatherNumber(current.temperature_2m, 0);
  const forecast = indices.map((index) => {
    const condition = describeWeather(daily.cloud_cover_mean?.[index], daily.precipitation_sum?.[index]);
    const day = new Date(`${daily.time[index]}T12:00:00`).toLocaleDateString('en-ZA', { weekday: 'short' });
    const high = formatWeatherNumber(daily.temperature_2m_max?.[index], 0);
    const low = formatWeatherNumber(daily.temperature_2m_min?.[index], 0);
    return `<div class="weather-day"><b>${SolarFormat.escape(day)}</b><span class="weather-icon" role="img" aria-label="${condition.label}">${weatherIcon(condition.icon)}</span><strong>${high}°</strong><span class="weather-low">${low}°</span></div>`;
  }).join('');
  const freshness = weather.stale ? ' · stale cached data' : weather.cached ? ' · cached' : '';
  return `<section class="weather-card" aria-label="Weather forecast for ${SolarFormat.escape(place)}">
      <div class="weather-visual">
        <div class="weather-current-icon" role="img" aria-label="${currentLabel}${moonPhase ? ` · ${moonPhase.label}` : ''}">${weatherIcon(currentIcon, moonPhase)}</div>
        <div class="weather-current-copy"><span>Current conditions · ${SolarFormat.escape(weather.data.timezone || place)}</span><strong>${currentTemperature}°</strong><p>${currentLabel}</p></div>
      </div>
      <div class="weather-forecast" aria-label="Forecast temperature range for the coming days">${forecast || '<p>Daily forecast is not available.</p>'}</div>
      <div class="weather-stats" aria-label="Current weather details"><div><span>Temperature</span><strong>${currentTemperature}°C</strong></div><div><span>Cloud cover</span><strong>${formatWeatherNumber(current.cloud_cover, 0)}%</strong></div><div><span>Precipitation</span><strong>${formatWeatherNumber(current.precipitation, 1)} mm</strong></div><div><span>Humidity</span><strong>${formatWeatherNumber(current.relative_humidity_2m, 0)}%</strong></div><div><span>Wind</span><strong>${formatWeatherNumber(current.wind_speed_10m, 0)} km/h</strong></div></div>
      <p class="assumptions">${SolarFormat.escape(weather.source)} · ${SolarFormat.escape(weather.dataType || 'weather forecast')} · retrieved ${new Date(weather.retrievedAt).toLocaleString('en-ZA')}${freshness}. Forecasts are not historical climate averages.</p>
    </section>`;
}

function describeWeather(cloudCover, precipitation) {
  if (Number.isFinite(precipitation) && precipitation >= 0.2) return { icon: 'rain', label: 'Rain likely' };
  if (Number.isFinite(cloudCover) && cloudCover >= 75) return { icon: 'cloud', label: 'Overcast' };
  if (Number.isFinite(cloudCover) && cloudCover >= 35) return { icon: 'partly-cloudy', label: 'Partly cloudy' };
  return { icon: 'sun', label: 'Mostly clear' };
}

function weatherIcon(condition, moonPhase) {
  if (condition === 'moon' || condition === 'partly-cloudy-night' || condition === 'rain-night') {
    const moon = moonPhase ? renderMoon(moonPhase) : '<circle class="weather-moon" cx="40" cy="40" r="18"/>';
    const cloud = condition === 'partly-cloudy-night' || condition === 'rain-night'
      ? `<path class="weather-cloud" d="M17 59h42a13 13 0 0 0 0-26 20 20 0 0 0-38-3 15 15 0 0 0-4 29Z"/>${condition === 'rain-night' ? '<path class="weather-rain" d="m28 61-4 8m18-8-4 8m18-8-4 8"/>' : ''}`
      : '';
    return `<svg viewBox="0 0 80 80" aria-hidden="true">${moon}${cloud}</svg>`;
  }
  if (condition === 'rain') {
    return '<svg viewBox="0 0 80 80" aria-hidden="true"><circle class="weather-sun" cx="52" cy="27" r="13"/><path class="weather-cloud" d="M20 51h39a12 12 0 0 0 0-24 19 19 0 0 0-36-2 13 13 0 0 0-3 26Z"/><path class="weather-rain" d="m28 59-4 9m18-9-4 9m18-9-4 9"/></svg>';
  }
  if (condition === 'cloud') {
    return '<svg viewBox="0 0 80 80" aria-hidden="true"><path class="weather-cloud" d="M18 58h43a13 13 0 0 0 0-26 20 20 0 0 0-38-3 15 15 0 0 0-5 29Z"/></svg>';
  }
  if (condition === 'partly-cloudy') {
    return '<svg viewBox="0 0 80 80" aria-hidden="true"><circle class="weather-sun" cx="52" cy="28" r="15"/><path class="weather-cloud" d="M17 59h42a13 13 0 0 0 0-26 20 20 0 0 0-38-3 15 15 0 0 0-4 29Z"/></svg>';
  }
  return '<svg viewBox="0 0 80 80" aria-hidden="true"><circle class="weather-sun" cx="40" cy="40" r="17"/><path class="weather-sun-rays" d="M40 8v9m0 46v9M8 40h9m46 0h9M17 17l7 7m32 32 7 7m0-46-7 7M24 56l-7 7"/></svg>';
}

function isNightAtLocalTime(observationTime, timezone) {
  if (typeof observationTime === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(observationTime)) {
    if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(observationTime)) {
      const localHour = Number(observationTime.slice(11, 13));
      return localHour < 6 || localHour >= 18;
    }
    const parts = new Intl.DateTimeFormat('en-ZA', {
      timeZone: timezone,
      hour: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date(observationTime));
    const hour = Number(parts.find((part) => part.type === 'hour').value);
    return hour < 6 || hour >= 18;
  }
  const hour = Number(new Intl.DateTimeFormat('en-ZA', {
    timeZone: timezone,
    hour: '2-digit',
    hourCycle: 'h23'
  }).format(new Date()));
  return hour < 6 || hour >= 18;
}

function getMoonPhase(observationTime, timezone) {
  let localDate;
  if (typeof observationTime === 'string' && /^\d{4}-\d{2}-\d{2}/.test(observationTime)) {
    if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(observationTime)) {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(new Date(observationTime));
      const part = (type) => parts.find((item) => item.type === type).value;
      localDate = `${part('year')}-${part('month')}-${part('day')}`;
    } else {
      localDate = observationTime.slice(0, 10);
    }
  } else {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const part = (type) => parts.find((item) => item.type === type).value;
    localDate = `${part('year')}-${part('month')}-${part('day')}`;
  }
  const [year, month, day] = localDate.split('-').map(Number);
  const daysSinceNewMoon = (Date.UTC(year, month - 1, day, 12) - Date.UTC(2000, 0, 6, 18, 14))
    / 86400000;
  const age = ((daysSinceNewMoon % 29.530588853) + 29.530588853) % 29.530588853;
  const phase = age / 29.530588853;
  const label = phase < 0.03 || phase >= 0.97 ? 'New moon'
    : phase < 0.22 ? 'Waxing crescent'
      : phase < 0.28 ? 'First quarter'
        : phase < 0.47 ? 'Waxing gibbous'
          : phase < 0.53 ? 'Full moon'
            : phase < 0.72 ? 'Waning gibbous'
              : phase < 0.78 ? 'Last quarter'
                : 'Waning crescent';
  return { phase, label };
}

function renderMoon(moonPhase) {
  const phase = moonPhase.phase;
  const terminatorRadius = 18 * Math.abs(Math.cos(phase * 2 * Math.PI));
  const terminatorSweep = phase >= 0.25 && phase < 0.75 ? 1 : 0;
  const path = `M40 22 A18 18 0 0 1 40 58 A${terminatorRadius.toFixed(2)} 18 0 0 ${terminatorSweep} 40 22Z`;
  const latitude = Number(document.getElementById('location').value.split('|')[0].split(',')[0]);
  const mirrored = (phase >= 0.5) !== (latitude < 0);
  return `<defs><clipPath id="moon-disc"><circle cx="40" cy="40" r="18"/></clipPath></defs><circle class="weather-moon-shadow" cx="40" cy="40" r="18"/><path class="weather-moon" d="${path}" clip-path="url(#moon-disc)"${mirrored ? ' transform="translate(80 0) scale(-1 1)"' : ''}/>`;
}

function formatWeatherNumber(value, digits) {
  return Number.isFinite(value) ? SolarFormat.number(value, digits) : '—';
}

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
