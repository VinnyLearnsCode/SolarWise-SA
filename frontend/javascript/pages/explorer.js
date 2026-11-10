const locationButton = document.getElementById('load-location');
let solarChart;
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
  const usageInput = document.getElementById('monthly-usage');
  if (!usageInput.validity.valid) {
    usageInput.reportValidity();
    return;
  }
  const [coords, place] = document.getElementById('location').value.split('|');
  const [latitude, longitude] = coords.split(',');
  const selectedPower = Number(document.getElementById('peak-power').value);
  const orientation = Number(document.getElementById('orientation').value);
  const tilt = Number(document.getElementById('tilt').value);
  const monthlyUsage = usageInput.value.trim() ? Number(usageInput.value) : null;
  const comparisonSizes = comparisonSystemSizes(selectedPower);
  const output = document.getElementById('location-results');
  const errorNode = document.getElementById('explorer-error');
  errorNode.textContent = '';
  output.innerHTML = '<div class="empty-state"><span class="empty-icon">…</span><h2>Building your estimate</h2><p>Checking your location, roof direction, and system sizes.</p></div>';
  locationButton.disabled = true;
  const [solarResponses, weatherResponse] = await Promise.all([
    Promise.allSettled(comparisonSizes.map((size) => SolarAPI.request(
      solarPotentialUrl(latitude, longitude, size, orientation, tilt)
    ))),
    SolarAPI.request(`/weather?latitude=${latitude}&longitude=${longitude}`)
      .then((value) => ({ status: 'fulfilled', value }))
      .catch((reason) => ({ status: 'rejected', reason }))
  ]);
  locationButton.disabled = false;
  if (solarResponses.every((response) => response.status === 'rejected') && weatherResponse.status === 'rejected') {
    errorNode.textContent = `${solarResponses[0].reason.message} ${weatherResponse.reason.message}`;
    output.innerHTML = '<div class="empty-state"><h2>Location data unavailable</h2><p>External services did not respond. Please retry later.</p></div>';
    return;
  }
  const results = solarResponses.map((response, index) => ({
    size: comparisonSizes[index],
    status: response.status,
    ...(response.status === 'fulfilled' ? { solar: response.value } : { error: response.reason.message })
  }));
  const solarContext = { results, selectedPower, monthlyUsage, orientation, tilt, latitude, longitude };
  let html = `<div class="eyebrow">${SolarFormat.escape(place)} · data snapshot</div><h2>Solar &amp; weather context</h2>`;
  if (weatherResponse.status === 'fulfilled') {
    html += renderWeather(weatherResponse.value, place);
  } else {
    html += `<p class="form-error">Weather unavailable: ${SolarFormat.escape(weatherResponse.reason.message)}</p>`;
  }
  html += `<div id="solar-model-result">${renderSolar(solarContext)}</div>`;
  output.innerHTML = html;
  bindSolarRetryButtons(document.getElementById('solar-model-result'), solarContext);
  drawFocusedSolarChart(solarContext);
});
if (requestedLocationFound) locationButton.click();

function comparisonSystemSizes(selectedPower) {
  const availableSizes = [3, 5, 8, 10, 15];
  const selectedIndex = availableSizes.indexOf(selectedPower);
  const start = Math.max(0, Math.min(selectedIndex - 1, availableSizes.length - 3));
  return availableSizes.slice(start, start + 3);
}

function solarPotentialUrl(latitude, longitude, peakPower, orientation, tilt) {
  const query = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    peakPower: String(peakPower),
    orientation: String(orientation),
    tilt: String(tilt)
  });
  return `/solar-potential?${query}`;
}

function renderSolar(context) {
  const selectedResult = context.results.find((result) => result.size === context.selectedPower);
  const orientation = document.getElementById('orientation').selectedOptions[0].textContent.split(' · ')[0];
  const cards = context.results.map((result, index) => renderComparisonCard(result, index, context.selectedPower)).join('');
  const selectedError = selectedResult.status === 'rejected'
    ? `<div class="solar-focused-error" role="status"><p class="form-error">The ${selectedResult.size} kWp estimate is unavailable: ${SolarFormat.escape(selectedResult.error)}</p><button class="button secondary solar-retry" type="button" data-result-index="${context.results.indexOf(selectedResult)}">Retry this estimate</button></div>`
    : renderFocusedEstimate(selectedResult.solar, selectedResult.size, context.monthlyUsage, orientation, context.tilt);
  return `<section class="solar-potential" aria-labelledby="solar-potential-title">
      <div class="solar-potential-heading"><span class="eyebrow">STEP 3 · YOUR ESTIMATE</span><h3 id="solar-potential-title">What could solar produce at your home?</h3><p>Modeled for ${SolarFormat.escape(orientation.toLowerCase())}-facing panels tilted ${SolarFormat.escape(context.tilt)}°. These are production estimates, not guaranteed savings.</p></div>
      <div class="solar-focused-estimate" id="solar-focused-estimate">${selectedError}</div>
      <section class="solar-comparison" aria-labelledby="solar-comparison-title"><h4 id="solar-comparison-title">Compare nearby system sizes</h4><p>All sizes use the same location and roof details. Select another focus size above to compare a different range.</p><div class="solar-comparison-grid">${cards}</div></section>
      <p class="solar-potential-note"><strong>Remember:</strong> kWh measures energy; kWp is a system's rated capacity. Real output varies with season, shade, roof condition, and installation. Matching solar generation to your use does not mean your bill will fall by the same amount.</p>
      <details class="solar-potential-details"><summary>About these estimates</summary><p>Modeled by ${SolarFormat.escape(selectedResult.solar?.source || 'PVGIS')} for ${SolarFormat.escape(orientation.toLowerCase())}-facing panels tilted ${SolarFormat.escape(context.tilt)}°, with 14% assumed system losses. North is the selected default for South African locations. Annual generation divided by 12 is only an average; actual production is seasonal. Savings depend on when you use electricity, your tariff, system design, and export credits.</p></details>
    </section>`;
}

function renderFocusedEstimate(solar, peakPower, monthlyUsage, orientation, tilt) {
  const annual = solar.data?.outputs?.totals?.fixed?.E_y;
  const hasAnnualEstimate = Number.isFinite(annual);
  const monthly = (solar.data?.outputs?.monthly?.fixed || [])
    .filter((month) => Number.isFinite(month.E_m));
  const annualEstimate = hasAnnualEstimate ? SolarFormat.number(annual) : 'Unavailable';
  const averageMonthlyEstimate = hasAnnualEstimate ? `${SolarFormat.number(annual / 12)} kWh` : 'Unavailable';
  const averageDailyEstimate = hasAnnualEstimate ? `${SolarFormat.number(annual / 365, 1)} kWh` : 'Unavailable';
  const usageMatch = hasAnnualEstimate && monthlyUsage
    ? `<div class="solar-usage-match"><span>Compared with your ${SolarFormat.number(monthlyUsage)} kWh monthly use</span><strong>Average solar generation equals about ${SolarFormat.number((annual / 12) / monthlyUsage * 100)}% of that amount</strong><small>This is an energy comparison, not a bill-savings or self-sufficiency estimate. Solar may be generated at different times from when you use power.</small></div>`
    : monthlyUsage
      ? '<p class="solar-usage-match">Your electricity-use comparison is unavailable because the annual estimate was not returned.</p>'
      : '<p class="solar-usage-prompt">Add your monthly kWh use on the left to see how generation compares with your home’s typical use.</p>';
  const freshness = solar.stale ? ' · older cached result' : solar.cached ? ' · cached' : '';
  return `<div class="solar-focused-content">
      <div class="solar-potential-summary">
        <div class="solar-potential-annual"><span>Estimated energy in a typical year</span><strong>${annualEstimate}</strong><b>kWh per year</b><p>With a ${SolarFormat.escape(peakPower)} kWp solar system</p></div>
        <div class="solar-potential-average"><span>Average month</span><strong>${averageMonthlyEstimate}</strong><small>Yearly estimate divided by 12</small></div>
        <div class="solar-potential-average"><span>Average day</span><strong>${averageDailyEstimate}</strong><small>Yearly estimate divided by 365</small></div>
      </div>
      ${usageMatch}
      ${monthly.length ? `<div class="solar-potential-chart"><h4>How generation changes through the year</h4><p>Bars show estimated energy for each month; sunny-season and winter output can differ.</p><div class="chart-wrap"><canvas id="solar-chart" role="img" aria-label="Estimated solar energy in kilowatt-hours for each month"></canvas></div></div>` : ''}
      <p class="solar-model-provenance">${SolarFormat.escape(solar.source)} · ${SolarFormat.escape(solar.dataType)} · retrieved ${new Date(solar.retrievedAt).toLocaleString('en-ZA')}${freshness} · ${SolarFormat.escape(orientation)} facing · ${SolarFormat.escape(tilt)}° tilt · 14% assumed system loss.</p>
    </div>`;
}

function renderComparisonCard(result, index, selectedPower) {
  const selected = result.size === selectedPower;
  if (result.status === 'rejected') {
    return `<article class="solar-comparison-card${selected ? ' is-selected' : ''}"><span class="solar-comparison-size">${result.size} kWp</span>${selected ? '<span class="solar-selected-tag">Your focus</span>' : ''}<p class="form-error">Estimate unavailable</p><button class="button secondary solar-retry" type="button" data-result-index="${index}">Retry ${result.size} kWp</button></article>`;
  }
  const annual = result.solar.data?.outputs?.totals?.fixed?.E_y;
  return `<article class="solar-comparison-card${selected ? ' is-selected' : ''}"><div class="solar-comparison-card-heading"><span class="solar-comparison-size">${result.size} kWp</span>${selected ? '<span class="solar-selected-tag">Your focus</span>' : ''}</div>${Number.isFinite(annual) ? `<strong>${SolarFormat.number(annual)} <small>kWh/year</small></strong><span>About ${SolarFormat.number(annual / 12)} kWh in an average month</span>` : '<p class="form-error">Annual production was not returned.</p>'}</article>`;
}

function bindSolarRetryButtons(container, context) {
  container.querySelectorAll('.solar-retry').forEach((button) => {
    button.addEventListener('click', async () => {
      const index = Number(button.dataset.resultIndex);
      const result = context.results[index];
      button.disabled = true;
      button.textContent = 'Retrying…';
      try {
        result.solar = await SolarAPI.request(solarPotentialUrl(
          context.latitude,
          context.longitude,
          result.size,
          context.orientation,
          context.tilt
        ));
        result.status = 'fulfilled';
        delete result.error;
      } catch (error) {
        result.status = 'rejected';
        result.error = error.message;
      }
      container.innerHTML = renderSolar(context);
      bindSolarRetryButtons(container, context);
      drawFocusedSolarChart(context);
    });
  });
}

function drawFocusedSolarChart(context) {
  const selected = context.results.find((result) => result.size === context.selectedPower);
  drawSolarChart(selected?.solar?.data?.outputs?.monthly?.fixed || []);
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
  solarChart?.destroy();
  solarChart = null;
  if (!monthly.length || !window.Chart) return;
  const canvas = document.getElementById('solar-chart');
  if (!canvas) return;
  const labels = monthly.map((month) => month.month);
  const values = monthly.map((month) => month.E_m);
  solarChart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Modeled monthly solar energy (kWh)', data: values, backgroundColor: '#42a8ed', borderRadius: 7 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (context) => `${SolarFormat.number(context.parsed.y)} kWh estimated` } }
      },
      scales: {
        x: { title: { display: true, text: 'Month' } },
        y: { beginAtZero: true, title: { display: true, text: 'Energy estimated (kWh)' } }
      }
    }
  });
}
