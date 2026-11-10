const { cached } = require('./cache');
const { fetchWithRetry } = require('./retry');

async function getSolarPotential(latitude, longitude, peakPower = 1, orientation = 180, tilt = 30) {
  const key = `pvgis:${latitude.toFixed(3)}:${longitude.toFixed(3)}:${peakPower}:${orientation}:${tilt}`;
  return cached(key, 24 * 60 * 60 * 1000, async () => {
    const base = (process.env.PVGIS_BASE_URL || 'https://re.jrc.ec.europa.eu/api/v5_3').replace(/\/$/, '');
    const url = new URL(`${base}/PVcalc`);
    url.search = new URLSearchParams({
      lat: String(latitude), lon: String(longitude), peakpower: String(peakPower),
      loss: '14', angle: String(tilt), aspect: String(orientation), outputformat: 'json'
    }).toString();
    let response;
    try {
      response = await fetchWithRetry(url, {
        retries: 1,
        timeoutMs: timeoutSetting(),
        retriesEnv: 'PVGIS_RETRIES',
        timeoutEnv: 'PVGIS_TIMEOUT_MS',
        delayEnv: 'PVGIS_RETRY_DELAY_MS'
      });
    } catch (error) {
      console.warn(`PVGIS request failed: ${error.message}`);
      const unavailable = new Error('PVGIS could not be reached. Please retry later.');
      unavailable.status = 503;
      unavailable.code = 'UPSTREAM_UNAVAILABLE';
      throw unavailable;
    }
    if (!response.ok) {
      const error = new Error(`PVGIS is temporarily unavailable (HTTP ${response.status}).`);
      error.status = 503;
      error.code = 'UPSTREAM_UNAVAILABLE';
      throw error;
    }
    const data = await response.json();
    return {
      source: 'European Commission Joint Research Centre PVGIS',
      dataType: 'modeled long-term solar potential',
      retrievedAt: new Date().toISOString(),
      peakPowerKw: peakPower,
      orientation,
      tilt,
      data
    };
  });
}

async function getSolarIrradiation(latitude, longitude) {
  const key = `pvgis-radiation:${latitude.toFixed(3)}:${longitude.toFixed(3)}`;
  return cached(key, 30 * 24 * 60 * 60 * 1000, async () => {
    const base = (process.env.PVGIS_BASE_URL || 'https://re.jrc.ec.europa.eu/api/v5_3').replace(/\/$/, '');
    const url = new URL(`${base}/MRcalc`);
    url.search = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      horirrad: '1',
      outputformat: 'json'
    }).toString();
    let response;
    try {
      response = await fetchWithRetry(url, {
        retries: 1,
        timeoutMs: timeoutSetting(),
        retriesEnv: 'PVGIS_RETRIES',
        timeoutEnv: 'PVGIS_TIMEOUT_MS',
        delayEnv: 'PVGIS_RETRY_DELAY_MS'
      });
    } catch (error) {
      console.warn(`PVGIS irradiation request failed: ${error.message}`);
      const unavailable = new Error('PVGIS solar irradiation could not be reached. Please retry later.');
      unavailable.status = 503;
      unavailable.code = 'UPSTREAM_UNAVAILABLE';
      throw unavailable;
    }
    if (!response.ok) {
      const unavailable = new Error(`PVGIS solar irradiation is temporarily unavailable (HTTP ${response.status}).`);
      unavailable.status = 503;
      unavailable.code = 'UPSTREAM_UNAVAILABLE';
      throw unavailable;
    }
    const data = await response.json();
    const monthly = data?.outputs?.monthly;
    if (!Array.isArray(monthly) || monthly.length === 0) {
      throw new Error('PVGIS returned no monthly horizontal irradiation data for this location.');
    }
    const annualByYear = new Map();
    for (const month of monthly) {
      if (!Number.isInteger(month.year) || !Number.isFinite(month['H(h)_m'])) continue;
      annualByYear.set(month.year, (annualByYear.get(month.year) || 0) + month['H(h)_m']);
    }
    if (annualByYear.size === 0) {
      throw new Error('PVGIS returned monthly irradiation data in an unexpected format.');
    }
    const annualValues = [...annualByYear.values()];
    const annualKwhM2 = annualValues.reduce((sum, value) => sum + value, 0) / annualValues.length;
    return {
      source: 'European Commission Joint Research Centre PVGIS',
      dataType: 'modeled long-term global horizontal irradiation',
      retrievedAt: new Date().toISOString(),
      latitude,
      longitude,
      plane: 'horizontal',
      unit: 'kWh/m²/year',
      dailyAverageKwhM2: annualKwhM2 / 365,
      annualKwhM2,
      years: {
        from: Math.min(...annualByYear.keys()),
        to: Math.max(...annualByYear.keys()),
        count: annualByYear.size
      }
    };
  });
}

function timeoutSetting() {
  const value = Number(process.env.PVGIS_TIMEOUT_MS);
  return Number.isFinite(value) ? Math.min(30000, Math.max(1000, Math.floor(value))) : 12000;
}

module.exports = { getSolarPotential, getSolarIrradiation };
