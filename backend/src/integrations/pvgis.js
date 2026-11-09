const { cached } = require('./cache');

async function getSolarPotential(latitude, longitude, peakPower = 1) {
  const key = `pvgis:${latitude.toFixed(3)}:${longitude.toFixed(3)}:${peakPower}`;
  return cached(key, 24 * 60 * 60 * 1000, async () => {
    const base = (process.env.PVGIS_BASE_URL || 'https://re.jrc.ec.europa.eu/api/v5_3').replace(/\/$/, '');
    const url = new URL(`${base}/PVcalc`);
    url.search = new URLSearchParams({
      lat: String(latitude), lon: String(longitude), peakpower: String(peakPower),
      loss: '14', angle: '30', aspect: '0', outputformat: 'json'
    }).toString();
    let response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(timeoutSetting()) });
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
    return { source: 'European Commission Joint Research Centre PVGIS', dataType: 'modeled long-term solar potential', retrievedAt: new Date().toISOString(), peakPowerKw: peakPower, data };
  });
}
function timeoutSetting() {
  const value = Number(process.env.PVGIS_TIMEOUT_MS);
  return Number.isFinite(value) ? Math.min(30000, Math.max(1000, Math.floor(value))) : 12000;
}

module.exports = { getSolarPotential };
