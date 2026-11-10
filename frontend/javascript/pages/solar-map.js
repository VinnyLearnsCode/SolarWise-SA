(() => {
const mapElement = document.getElementById('solar-intelligence-map');
const layerSelect = document.getElementById('map-layer');
const mapStatus = document.getElementById('layer-status');
const legend = document.getElementById('map-legend');
const searchInput = document.getElementById('map-search');
const searchResults = document.getElementById('map-search-results');
const selectedArea = document.getElementById('selected-area');
const backButton = document.getElementById('back-to-country');
const calculateLink = document.getElementById('calculate-area');
const tariffCategory = document.getElementById('tariff-category');
const tariffCategoryLabel = document.getElementById('tariff-category-label');
const tariffPlan = document.getElementById('tariff-plan');
const tariffPlanLabel = document.getElementById('tariff-plan-label');
const layerDescriptions = {
  solar: 'Long-term modeled solar radiation on a horizontal surface, sampled at each area’s representative point.',
  tariff: 'Verified municipal energy charges. The map compares flat rates only; tiered schedules remain visible in area details and are never collapsed to a single rate.',
  savings: 'SolarWise modelled first-year bill savings using your bill, usage, tariff, system cost, and the same assumptions as the calculator.',
  payback: 'SolarWise modelled simple payback using PVGIS generation, your entered system cost, and the calculator’s stated financial assumptions.'
};
const palettes = {
  solar: ['#e5f5ff', '#a8d9f3', '#5fb9e5', '#f4d15b', '#e88b3b'],
  tariff: ['#e1f3ff', '#9ed3f0', '#58a4d3', '#e5a84b', '#c64c4c'],
  savings: ['#e5f5ec', '#a9dbbc', '#68ba8d', '#2d986a', '#126a4b'],
  payback: ['#23865c', '#7dbb83', '#ecd266', '#e28b52', '#bd5260']
};
if (!window.L) {
  mapStatus.textContent = 'The map library could not be loaded. Check your connection and reload the page.';
  mapStatus.classList.add('is-error');
  mapElement.textContent = 'The interactive map is unavailable because its mapping library did not load.';
  return;
}
mapElement.replaceChildren();
const map = L.map(mapElement, {
  minZoom: 4,
  maxZoom: 10,
  zoomControl: true,
  scrollWheelZoom: false,
  attributionControl: true
});
map.attributionControl.addAttribution('<a href="https://www.geoboundaries.org/" target="_blank" rel="noopener noreferrer">geoBoundaries</a> · MDB boundaries');
L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

let provinceCollection;
let provinceLayer;
let provinceOutlineLayer;
let municipalityLayer;
let municipalityIndex;
let currentLevel = 'country';
let selectedFeature;
let selectedLayer;
let currentMunicipalities = [];
let currentLayer = layerSelect.value;
let tariffRecords = [];
let tariffLoadError;
let tariffLoadPromise;
const solarValues = new Map();
const financialValues = new Map();
const loadingValues = new Map();
const layerErrors = new Map();
let activePaletteRange = null;
let searchRequest = 0;
let layerRequestId = 0;
let regionNavigationId = 0;
let searchTimer;

map.on('zoomend', () => {
  document.getElementById('map-zoom-to-selection').disabled = !selectedFeature;
});

document.querySelectorAll('.theme-toggle').forEach((button) => {
  button.addEventListener('click', () => window.setTimeout(syncMapTheme, 0));
});
new MutationObserver(syncMapTheme).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme']
});
syncMapTheme();

document.getElementById('map-zoom-to-selection').addEventListener('click', () => {
  if (selectedLayer) map.fitBounds(selectedLayer.getBounds(), { padding: [24, 24], maxZoom: 9 });
  else if (selectedFeature) map.fitBounds(L.geoJSON(selectedFeature).getBounds(), { padding: [24, 24], maxZoom: 8 });
});
document.getElementById('map-reset-view').addEventListener('click', returnToCountry);
backButton.addEventListener('click', returnToCountry);
calculateLink.addEventListener('click', (event) => {
  if (calculateLink.getAttribute('aria-disabled') === 'true') event.preventDefault();
});
layerSelect.addEventListener('change', () => {
  currentLayer = layerSelect.value;
  document.getElementById('map-layer-description').textContent = layerDescriptions[currentLayer];
  applyLayer();
});
tariffCategory.addEventListener('change', () => {
  updateTariffPlanOptions();
  refreshMap();
  renderSelectedArea();
  updateLegend();
});
tariffPlan.addEventListener('change', () => {
  refreshMap();
  renderSelectedArea();
  updateLegend();
});
document.querySelectorAll('#financial-assumptions input, #financial-assumptions select').forEach((input) => {
  input.addEventListener('change', () => {
    financialValues.clear();
    layerErrors.clear();
    updateCalculateLink();
    if (currentLayer === 'savings' || currentLayer === 'payback') applyLayer();
  });
});
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => searchLocations(searchInput.value.trim()), 180);
});
searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSearch();
  if (event.key === 'Enter' && !searchResults.hidden) {
    event.preventDefault();
    searchResults.querySelector('button')?.click();
  }
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.map-control-section')) closeSearch();
});

loadMap();

async function loadMap() {
  try {
    const response = await fetch('/data/solar-map/provinces.geojson');
    if (!response.ok) throw new Error(`Province boundaries could not be loaded (HTTP ${response.status}).`);
    provinceCollection = await response.json();
    if (!Array.isArray(provinceCollection.features) || provinceCollection.features.length !== 9) {
      throw new Error('Province boundary data is incomplete; the map could not be loaded.');
    }
    provinceLayer = createProvinceLayer();
    provinceLayer.addTo(map);
    map.fitBounds(provinceLayer.getBounds(), { padding: [18, 18] });
    document.getElementById('map-level-title').textContent = 'South Africa';
    setMapStatus('Choose a province to explore its local municipalities.');
    loadTariffs();
    applyLayer();
  } catch (error) {
    setMapStatus(error.message, true);
    selectedArea.innerHTML = `<p class="map-unavailable">${SolarFormat.escape(error.message)}</p>`;
  }
}

function createProvinceLayer() {
  return L.geoJSON(provinceCollection, {
    style: featureStyle,
    onEachFeature(feature, layer) {
      layer.bindTooltip(feature.properties.name, {
        permanent: true,
        direction: 'center',
          className: `province-label${document.documentElement.dataset.theme === 'dark' ? ' dark-map-label' : ''}`
      });
      prepareRegionLayer(feature, layer, () => openProvince(feature));
    }
  });
}

function createMunicipalityLayer(collection, provinceName) {
  return L.geoJSON(collection, {
    style: featureStyle,
    onEachFeature(feature, layer) {
      layer.bindTooltip(feature.properties.name, {
        direction: 'center',
        className: `municipality-label${document.documentElement.dataset.theme === 'dark' ? ' dark-map-label' : ''}`
      });
      prepareRegionLayer(feature, layer, () => selectMunicipality(feature, layer));
      layer.on('mouseover', () => layer.openTooltip());
      layer.on('mouseout', () => layer.closeTooltip());
    }
  });
}

function prepareRegionLayer(feature, layer, onSelect) {
  layer.on('click', onSelect);
  layer.on('mouseover', () => {
    if (regionKey(feature) !== regionKey(selectedFeature)) {
      layer.setStyle({ weight: 2.5, fillOpacity: 0.94 });
      layer.bringToFront();
    }
  });
  layer.on('mouseout', () => layer.setStyle(featureStyle(feature)));
  layer.on('add', () => {
    const element = layer.getElement();
    if (!element || element.dataset.keyboardReady) return;
    element.dataset.keyboardReady = 'true';
    element.setAttribute('tabindex', '0');
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', `Select ${feature.properties.name}${feature.properties.province ? `, ${feature.properties.province}` : ''}`);
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect();
      }
    });
  });
}

async function openProvince(feature) {
  const navigationId = ++regionNavigationId;
  layerRequestId += 1;
  selectedFeature = feature;
  selectedLayer = null;
  currentLevel = 'province';
  map.removeLayer(provinceLayer);
  document.getElementById('map-level-title').textContent = feature.properties.name;
  backButton.hidden = false;
  document.getElementById('map-zoom-to-selection').disabled = false;
  renderSelectedArea();
  const solarRequest = ensureLayerData(feature, 'solar');
  try {
    const slug = slugify(feature.properties.name);
    let collection = currentMunicipalities.find((item) => item.province === feature.properties.name)?.collection;
    if (!collection) {
      const response = await fetch(`/data/solar-map/municipalities/${slug}.geojson`);
      if (!response.ok) throw new Error(`${feature.properties.name} municipality boundaries could not be loaded (HTTP ${response.status}).`);
      collection = await response.json();
      currentMunicipalities = currentMunicipalities
        .filter((item) => item.province !== feature.properties.name)
        .concat({ province: feature.properties.name, collection });
    }
    if (navigationId !== regionNavigationId || selectedFeature !== feature) return;
    if (municipalityLayer) map.removeLayer(municipalityLayer);
    if (provinceOutlineLayer) map.removeLayer(provinceOutlineLayer);
    municipalityLayer = createMunicipalityLayer(collection, feature.properties.name);
    provinceOutlineLayer = L.geoJSON(feature, {
      interactive: false,
      style: { color: '#165f91', weight: 2.5, fill: false, opacity: 0.9 }
    });
    provinceOutlineLayer.addTo(map);
    municipalityLayer.addTo(map);
    map.fitBounds(provinceOutlineLayer.getBounds(), { padding: [20, 20], maxZoom: 7 });
    refreshMap();
    document.getElementById('map-level-title').textContent = `${feature.properties.name} · local municipalities`;
    setMapStatus(`${collection.features.length} local municipality boundaries loaded. Select one to inspect it. Values are requested when you select an area; unselected areas are not estimated.`);
    solarRequest.then(() => renderSelectedArea());
    if (currentLayer === 'tariff') applyLayer();
  } catch (error) {
    if (navigationId !== regionNavigationId || selectedFeature !== feature) return;
    setMapStatus(error.message, true);
    renderSelectedArea(error.message);
  }
}

function selectMunicipality(feature, layer) {
  selectedFeature = feature;
  selectedLayer = layer;
  currentLevel = 'municipality';
  document.getElementById('map-zoom-to-selection').disabled = false;
  document.getElementById('map-level-title').textContent = `${feature.properties.province} · ${feature.properties.name}`;
  renderSelectedArea();
  map.fitBounds(layer.getBounds(), { padding: [28, 28], maxZoom: 9 });
  const solarRequest = ensureLayerData(feature, 'solar');
  renderSelectedArea();
  if (currentLayer === 'solar') setMapStatus(`Loading solar irradiation for ${feature.properties.name}…`);
  solarRequest.then(() => {
    if (selectedFeature !== feature) return;
    refreshMap();
    renderSelectedArea();
    if (currentLayer === 'solar') {
      const value = valueForFeature(feature, 'solar');
      setMapStatus(Number.isFinite(value)
        ? `Solar irradiation is modeled at ${feature.properties.name}’s representative point.`
        : `Data unavailable for ${feature.properties.name}: ${layerErrors.get(`solar|${regionKey(feature)}|`) || 'No PVGIS model is available for this area.'}`);
    }
  });
  if (currentLayer === 'savings' || currentLayer === 'payback') {
    const financialRequest = ensureLayerData(feature, currentLayer);
    setMapStatus(`Loading ${layerLabel(currentLayer).toLowerCase()} for ${feature.properties.name}…`);
    renderSelectedArea();
    financialRequest.then(() => {
      if (selectedFeature !== feature) return;
      refreshMap();
      renderSelectedArea();
      const value = valueForFeature(feature, currentLayer);
      setMapStatus(Number.isFinite(value)
        ? `${layerLabel(currentLayer)} is modeled at ${feature.properties.name}’s representative point.`
        : `Data unavailable for ${feature.properties.name}: no estimate is available for the current assumptions.`);
    });
  } else {
    refreshMap();
  }
}

function returnToCountry() {
  regionNavigationId += 1;
  layerRequestId += 1;
  if (municipalityLayer) map.removeLayer(municipalityLayer);
  if (provinceOutlineLayer) map.removeLayer(provinceOutlineLayer);
  municipalityLayer = null;
  provinceOutlineLayer = null;
  selectedFeature = null;
  selectedLayer = null;
  currentLevel = 'country';
  backButton.hidden = true;
  document.getElementById('map-zoom-to-selection').disabled = true;
  provinceLayer.addTo(map);
  map.fitBounds(provinceLayer.getBounds(), { padding: [18, 18] });
  document.getElementById('map-level-title').textContent = 'South Africa';
  selectedArea.innerHTML = '<h2 id="selected-area-heading">Choose an area</h2><p>Select any province, then choose a local municipality to inspect available information.</p>';
  calculateLink.setAttribute('aria-disabled', 'true');
  calculateLink.removeAttribute('href');
  setMapStatus('Choose a province to explore its local municipalities.');
  refreshMap();
  applyLayer();
}

async function applyLayer() {
  const requestId = ++layerRequestId;
  currentLayer = layerSelect.value;
  document.getElementById('map-layer-description').textContent = layerDescriptions[currentLayer];
  tariffCategoryLabel.hidden = currentLayer !== 'tariff' || tariffCategory.options.length === 0;
  tariffCategory.hidden = currentLayer !== 'tariff' || tariffCategory.options.length === 0;
  tariffPlanLabel.hidden = currentLayer !== 'tariff' || tariffPlan.options.length === 0;
  tariffPlan.hidden = currentLayer !== 'tariff' || tariffPlan.options.length === 0;
  if (currentLayer === 'tariff') {
    await loadTariffs();
    if (requestId !== layerRequestId) return;
    if (currentLevel === 'country') {
      if (tariffLoadError) mapStatus.textContent = `Data unavailable: ${tariffLoadError}`;
      else mapStatus.textContent = `${tariffRecords.length} active, sourced tariff schedules available. Choose a specific plan to compare rates; schedules are not combined.`;
    } else {
      mapStatus.textContent = tariffLoadError
        ? `Data unavailable: ${tariffLoadError}`
        : 'Official municipal tariffs are shown only for the selected customer category.';
    }
    refreshMap();
    updateLegend();
    if (selectedFeature) renderSelectedArea();
    return;
  }
  if (currentLayer === 'savings' || currentLayer === 'payback') {
    const missing = missingFinancialInputs();
    if (missing.length) {
      document.getElementById('financial-assumptions').open = true;
      mapStatus.textContent = `Data unavailable. Enter ${missing.join(', ')} in “Assumptions for savings and payback.”`;
      refreshMap();
      updateLegend();
      return;
    }
  }
  const features = currentLevel === 'country'
    ? provinceCollection.features
    : [];
  if (features.length) {
    await loadLayerValues(features, currentLayer, requestId);
  } else {
    if (selectedFeature) {
      const feature = selectedFeature;
      const layer = currentLayer;
      setMapStatus(`Loading ${layerLabel(layer).toLowerCase()} for ${feature.properties.name}…`);
      await ensureLayerData(feature, layer);
      if (requestId !== layerRequestId || selectedFeature !== feature) return;
      const value = valueForFeature(feature, layer);
      const cacheKey = `${layer}|${regionKey(feature)}|${layer === 'savings' || layer === 'payback' ? financialSettingsKey() : ''}`;
      const error = layerErrors.get(cacheKey);
      if (Number.isFinite(value)) {
        setMapStatus(`${layerLabel(layer)} is modeled at ${feature.properties.name}’s representative point.`);
      } else {
        setMapStatus(`Data unavailable for ${feature.properties.name}: ${error || 'No model is available for this area.'}`);
      }
    } else {
      setMapStatus(currentLayer === 'solar'
        ? 'Select an area to request the PVGIS model at its representative point.'
        : 'Select an area to calculate this layer from your assumptions.');
    }
    refreshMap();
    updateLegend();
  }
  if (selectedFeature) renderSelectedArea();
}

async function loadLayerValues(features, layer, requestId) {
  const loadingNames = features.map((feature) => feature.properties.name);
  mapStatus.textContent = `Loading ${layerLabel(layer).toLowerCase()} for ${loadingNames.length} provinces…`;
  mapStatus.classList.remove('is-error');
  for (let index = 0; index < features.length; index += 3) {
    await Promise.all(features.slice(index, index + 3).map((feature) => ensureLayerData(feature, layer)));
    if (requestId !== layerRequestId || currentLayer !== layer) return;
    refreshMap();
    updateLegend();
    mapStatus.textContent = `Loaded ${Math.min(index + 3, features.length)} of ${features.length} provinces. Areas without a model remain unavailable.`;
  }
  const missing = features.filter((feature) => !valueForFeature(feature, layer)).length;
  mapStatus.textContent = missing
    ? `${features.length - missing} of ${features.length} provinces have modeled data; ${missing} are unavailable.`
    : `${features.length} provinces have modeled ${layerLabel(layer).toLowerCase()}. Values use representative points, not area-wide averages.`;
}

async function ensureLayerData(feature, layer) {
  if (layer === 'tariff') return null;
  const key = regionKey(feature);
  const settingsKey = layer === 'savings' || layer === 'payback' ? financialSettingsKey() : '';
  const cacheKey = `${layer}|${key}|${settingsKey}`;
  const target = layer === 'solar' ? solarValues : financialValues;
  if (target.has(key) && (layer === 'solar' || target.get(key).settingsKey === settingsKey)) return target.get(key);
  if (loadingValues.has(cacheKey)) return loadingValues.get(cacheKey);
  if (layer === 'savings' || layer === 'payback') {
    const missing = missingFinancialInputs();
    if (missing.length) return null;
  }
  const pending = (async () => {
    try {
      const [longitude, latitude] = feature.properties.representativePoint;
      let value;
      if (layer === 'solar') {
        const query = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) });
        value = await SolarAPI.request(`/solar-irradiation?${query}`);
        solarValues.set(key, value);
      } else {
        value = await SolarAPI.post('/solar-map/financial-estimate', {
          latitude,
          longitude,
          ...financialInputs()
        });
        financialValues.set(key, { ...value, settingsKey });
      }
      layerErrors.delete(cacheKey);
      return value;
    } catch (error) {
      layerErrors.set(cacheKey, error.message);
      return null;
    } finally {
      loadingValues.delete(cacheKey);
      refreshMap();
      updateLegend();
    }
  })();
  loadingValues.set(cacheKey, pending);
  return pending;
}

function featureStyle(feature) {
  const selected = regionKey(feature) === regionKey(selectedFeature);
  const value = valueForFeature(feature, currentLayer);
  const palette = palettes[currentLayer];
  return {
    color: selected ? '#0c5d91' : '#58778a',
    weight: selected ? 3 : currentLevel === 'country' ? 1.8 : 1,
    opacity: 1,
    fillColor: Number.isFinite(value) ? colorForValue(value, palette) : '#aeb8c2',
    fillOpacity: Number.isFinite(value) ? (selected ? 0.9 : 0.78) : (selected ? 0.62 : 0.4)
  };
}

function colorForValue(value, palette) {
  if (!activePaletteRange || activePaletteRange.max === activePaletteRange.min) return palette[Math.floor(palette.length / 2)];
  const ratio = Math.max(0, Math.min(1, (value - activePaletteRange.min) / (activePaletteRange.max - activePaletteRange.min)));
  const index = Math.min(palette.length - 1, Math.floor(ratio * palette.length));
  return palette[index];
}

function refreshMap() {
  const layer = currentLevel === 'country' ? provinceLayer : municipalityLayer;
  layer?.eachLayer((regionLayer) => regionLayer.setStyle(featureStyle(regionLayer.feature)));
}

function valueForFeature(feature, layer) {
  if (layer === 'tariff') {
    if (tariffLoadError || !tariffRecords.length) return null;
    if (feature.properties.boundaryType === 'ADM1') {
      const records = tariffsInProvince(feature.properties.name)
        .filter((record) => record.energyChargePerKwh != null
          && Number.isFinite(Number(record.energyChargePerKwh)));
      const recordsPerMunicipality = new Map();
      for (const record of tariffsInProvince(feature.properties.name)) {
        const key = normalizeName(record.municipality.name);
        recordsPerMunicipality.set(key, (recordsPerMunicipality.get(key) || 0) + 1);
      }
      if (!tariffPlan.value && [...recordsPerMunicipality.values()].some((count) => count > 1)) return null;
      return records.length ? records.reduce((sum, record) => sum + Number(record.energyChargePerKwh), 0) / records.length : null;
    }
    const rate = tariffFor(feature)?.energyChargePerKwh;
    return rate == null ? null : Number(rate);
  }
  if (layer === 'solar') return solarValues.get(regionKey(feature))?.annualKwhM2 ?? null;
  const response = financialValues.get(regionKey(feature));
  if (!response || response.settingsKey !== financialSettingsKey()) return null;
  if (layer === 'savings') return response.result?.financial?.annualSavings ?? null;
  return response.result?.financial?.paybackYears ?? 26;
}

function updateLegend() {
  const selectedProvince = selectedFeature?.properties.boundaryType === 'ADM3'
    ? selectedFeature.properties.province
    : selectedFeature?.properties.name;
  const features = currentLevel === 'country' ? provinceCollection?.features || [] : currentMunicipalities
    .find((item) => item.province === selectedProvince)?.collection.features || [];
  const values = features.map((feature) => valueForFeature(feature, currentLayer)).filter(Number.isFinite);
  if (currentLayer === 'tariff' && currentLevel === 'country' && values.length) {
    const total = tariffRecords.filter((record) => categoryMatches(record) && planMatches(record)).length;
    activePaletteRange = { min: Math.min(...values), max: Math.max(...values) };
    legend.innerHTML = `<span class="map-legend-title">Unweighted mean of flat ${SolarFormat.escape(tariffPlan.selectedOptions[0]?.textContent || 'tariff')} rates · R/kWh</span><div class="map-legend-gradient" style="background:linear-gradient(90deg,${palettes.tariff.join(',')})"></div><span class="map-legend-range"><span>${formatNumber(Math.min(...values), 2)}</span><span>${formatNumber(Math.max(...values), 2)}</span></span><span class="map-legend-no-data"><i></i>Data unavailable · ${total} selected schedules</span>`;
    refreshMap();
    return;
  }
  if (!values.length) {
    activePaletteRange = null;
    const detail = currentLayer === 'tariff' && tariffLoadError ? SolarFormat.escape(tariffLoadError)
      : currentLayer === 'solar' ? 'PVGIS radiation model unavailable or not yet loaded'
        : currentLayer === 'tariff' ? 'No verified municipal tariffs have been published for this category yet'
          : 'Enter assumptions to calculate this layer';
    legend.innerHTML = `<span class="map-legend-title">${SolarFormat.escape(layerLabel(currentLayer))}</span><span class="map-legend-no-data"><i></i>Data unavailable · ${detail}</span>`;
    refreshMap();
    return;
  }
  activePaletteRange = { min: Math.min(...values), max: Math.max(...values) };
  const units = currentLayer === 'solar' ? 'kWh/m²/year'
    : currentLayer === 'tariff' ? 'R/kWh'
      : currentLayer === 'savings' ? 'R/year'
        : 'years';
  legend.innerHTML = `<span class="map-legend-title">${SolarFormat.escape(layerLabel(currentLayer))} · ${units}</span><div class="map-legend-gradient" style="background:linear-gradient(90deg,${palettes[currentLayer].join(',')})"></div><span class="map-legend-range"><span>${formatLegendValue(Math.min(...values), currentLayer)}</span><span>${formatLegendValue(Math.max(...values), currentLayer)}</span></span><span class="map-legend-no-data"><i></i>Data unavailable</span>`;
  refreshMap();
}

async function loadTariffs() {
  if (tariffLoadPromise) return tariffLoadPromise;
  tariffLoadPromise = SolarAPI.request('/tariffs').then((response) => {
    if (!Array.isArray(response.tariffs)) throw new Error('Tariff service returned an unexpected response.');
    tariffRecords = response.tariffs.filter(isVerifiedActiveTariff);
    const categories = [...new Set(tariffRecords.map((record) => record.customerCategory))].sort((a, b) => a.localeCompare(b));
    tariffCategory.replaceChildren(new Option('All categories', ''), ...categories.map((category) => new Option(category, category)));
    updateTariffPlanOptions();
    if (categories.length) {
      tariffCategoryLabel.hidden = currentLayer !== 'tariff';
      tariffCategory.hidden = currentLayer !== 'tariff';
      tariffPlanLabel.hidden = currentLayer !== 'tariff';
      tariffPlan.hidden = currentLayer !== 'tariff';
    }
    tariffLoadError = categories.length ? null : 'No active, sourced tariff records are available yet. Publish approved municipal tariffs from the admin dashboard.';
    refreshMap();
    updateLegend();
    if (selectedFeature) renderSelectedArea();
  }).catch((error) => {
    tariffLoadError = error.message;
    tariffRecords = [];
    refreshMap();
    updateLegend();
    if (selectedFeature) renderSelectedArea();
  });
  return tariffLoadPromise;
}

function isVerifiedActiveTariff(record) {
  const hasFlatRate = Number.isFinite(Number(record?.energyChargePerKwh)) && record?.energyChargePerKwh != null;
  const hasBlockSchedule = Array.isArray(record?.energyBlocks)
    && record.energyBlocks.length > 0
    && record.energyBlocks[record.energyBlocks.length - 1].upToKwh == null
    && record.energyBlocks.every((block, index, blocks) => (
      Number.isFinite(Number(block.ratePerKwh))
      && Number(block.ratePerKwh) >= 0
      && (index === blocks.length - 1
        || (Number.isInteger(block.upToKwh) && block.upToKwh > 0
          && (blocks[index + 1].upToKwh == null || block.upToKwh < blocks[index + 1].upToKwh)))
    ));
  if (!record?.municipality?.name || !record.municipality.province?.name
    || !record.customerCategory || hasFlatRate === hasBlockSchedule
    || !Number.isFinite(new Date(record.lastVerifiedAt).getTime())
    || !Number.isFinite(new Date(record.effectiveFrom).getTime())) return false;
  try {
    const source = new URL(record.sourceUrl);
    return source.protocol === 'https:' || source.protocol === 'http:';
  } catch {
    return false;
  }
}

function tariffsInProvince(province) {
  const latest = new Map();
  for (const record of tariffRecords) {
    if (record.municipality.province.name !== province || !categoryMatches(record) || !planMatches(record)) continue;
    const key = `${normalizeName(record.municipality.name)}|${planKey(record)}`;
    const current = latest.get(key);
    if (!current || new Date(record.effectiveFrom) > new Date(current.effectiveFrom)) latest.set(key, record);
  }
  return [...latest.values()];
}

function tariffsFor(feature) {
  return tariffsInProvince(feature.properties.province)
    .filter((record) => normalizeName(record.municipality.name) === normalizeName(feature.properties.name));
}

function tariffFor(feature) {
  const records = tariffsFor(feature);
  return records.length === 1 ? records[0] : null;
}

function categoryMatches(record) {
  return !tariffCategory.value || record.customerCategory === tariffCategory.value;
}

function planMatches(record) {
  return !tariffPlan.value || planKey(record) === tariffPlan.value;
}

function planKey(record) {
  return JSON.stringify([record.customerCategory, record.name]);
}

function updateTariffPlanOptions() {
  const previous = tariffPlan.value;
  const plans = [...new Map(tariffRecords.filter(categoryMatches)
    .map((record) => [planKey(record), record])).entries()]
    .sort((left, right) => left[1].name.localeCompare(right[1].name)
      || left[1].customerCategory.localeCompare(right[1].customerCategory));
  tariffPlan.replaceChildren(
    new Option('All plans (no combined rate)', ''),
    ...plans.map(([key, record]) => new Option(`${record.name} · ${record.customerCategory}`, key))
  );
  if (plans.some(([key]) => key === previous)) tariffPlan.value = previous;
}
async function selectMunicipalityFromSearch(location) {
  const province = provinceCollection.features.find((feature) => feature.properties.name === location.province);
  if (!province) return;
  if (currentLevel !== 'province' || selectedFeature?.properties.name !== location.province) {
    await openProvince(province);
  }
  const municipality = currentMunicipalities
    .find((item) => item.province === location.province)
    ?.collection.features.find((feature) => normalizeName(feature.properties.name) === normalizeName(location.name));
  if (!municipality) {
    setMapStatus(`Data unavailable: ${location.name} could not be found in the loaded province boundary file.`, true);
    return;
  }
  const layer = findMunicipalityLayer(municipality);
  if (layer) selectMunicipality(municipality, layer);
}

function findMunicipalityLayer(feature) {
  let match = null;
  municipalityLayer?.eachLayer((layer) => {
    if (regionKey(layer.feature) === regionKey(feature)) match = layer;
  });
  return match;
}

async function searchLocations(query) {
  const requestId = ++searchRequest;
  if (query.length < 2 || !provinceCollection) {
    closeSearch();
    return;
  }
  searchInput.setAttribute('aria-expanded', 'true');
  try {
    if (!municipalityIndex) {
      const response = await fetch('/data/solar-map/municipality-index.json');
      if (!response.ok) throw new Error(`Municipality search data could not be loaded (HTTP ${response.status}).`);
      municipalityIndex = await response.json();
    }
    if (requestId !== searchRequest) return;
    const normalizedQuery = normalizeName(query);
    const provinceMatches = provinceCollection.features
      .filter((feature) => normalizeName(feature.properties.name).includes(normalizedQuery))
      .map((feature) => ({ name: feature.properties.name, type: 'Province', province: feature.properties.name }));
    const municipalityMatches = municipalityIndex
      .filter((item) => normalizeName(item.name).includes(normalizedQuery)
        || normalizeName(item.province).includes(normalizedQuery))
      .slice(0, 10)
      .map((item) => ({ ...item, type: 'Municipality' }));
    const matches = [...provinceMatches, ...municipalityMatches].slice(0, 12);
    searchResults.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'map-helper';
      empty.textContent = 'No matching province or municipality found.';
      searchResults.append(empty);
    } else {
      for (const location of matches) {
        const button = document.createElement('button');
        button.type = 'button';
        button.role = 'option';
        button.setAttribute('aria-selected', 'false');
        button.textContent = location.name;
        const description = document.createElement('small');
        description.textContent = location.type === 'Province' ? 'Province' : `${location.province} · local municipality`;
        button.append(description);
        button.addEventListener('click', async () => {
          searchInput.value = location.name;
          closeSearch();
          if (location.type === 'Province') {
            const feature = provinceCollection.features.find((item) => item.properties.name === location.name);
            await openProvince(feature);
          } else {
            await selectMunicipalityFromSearch(location);
          }
        });
        searchResults.append(button);
      }
    }
    searchResults.hidden = false;
  } catch (error) {
    if (requestId !== searchRequest) return;
    searchResults.replaceChildren();
    const message = document.createElement('p');
    message.className = 'map-helper';
    message.textContent = error.message;
    searchResults.append(message);
    searchResults.hidden = false;
  }
}

function closeSearch() {
  searchRequest += 1;
  searchResults.hidden = true;
  searchInput.setAttribute('aria-expanded', 'false');
}

async function renderSelectedArea(boundaryError) {
  if (!selectedFeature) return;
  const typeLabel = selectedFeature.properties.boundaryType === 'ADM1' ? 'Province' : 'Local municipality';
  const key = regionKey(selectedFeature);
  const solar = solarValues.get(key);
  const areaTariffs = selectedFeature.properties.boundaryType === 'ADM3' ? tariffsFor(selectedFeature) : [];
  const provinceTariffs = selectedFeature.properties.boundaryType === 'ADM1'
    ? tariffsInProvince(selectedFeature.properties.name)
    : [];
  const financial = financialValues.get(key);
  const solarLoading = loadingValues.has(`solar|${key}|`);
  const details = [];
  details.push(`<div class="map-info-item"><b>Geographic selection</b><span>${SolarFormat.escape(typeLabel)}${typeLabel === 'Local municipality' ? ` · ${SolarFormat.escape(selectedFeature.properties.province)}` : ''}</span><small>Boundary: geoBoundaries / MDB · represents 2020 · source updated 2023-01-19, built 2023-12-12 · CC BY 3.0 IGO</small></div>`);
  if (solar?.annualKwhM2) {
    details.push(`<div class="map-info-item"><b>Solar irradiation · modeled</b><span>${formatNumber(solar.annualKwhM2, 0)} kWh/m²/year</span><small>Global horizontal irradiation at the area’s representative point · PVGIS, ${solar.years.from}–${solar.years.to} · retrieved ${formatDate(solar.retrievedAt)}${solar.cached ? ' · cached' : ''}</small></div>`);
  } else {
    details.push(`<div class="map-info-item"><b>Solar irradiation</b><span class="map-unavailable">${solarLoading ? 'Loading PVGIS model…' : 'Data unavailable'}</span><small>${SolarFormat.escape(layerErrors.get(`solar|${key}|`) || 'Select the area to request the PVGIS model at its representative point.')}</small></div>`);
  }
  if (selectedFeature.properties.boundaryType === 'ADM3') {
    if (areaTariffs.length) details.push(...areaTariffs.map(renderMunicipalityTariffInfo));
    else details.push(renderMunicipalityTariffInfo(null));
  } else {
    const totalMunicipalities = municipalityIndex
      ? municipalityIndex.filter((item) => item.province === selectedFeature.properties.name).length
      : null;
    const coveredMunicipalities = new Set(provinceTariffs.map((record) => normalizeName(record.municipality.name))).size;
    const coverage = totalMunicipalities ? `${coveredMunicipalities} of ${totalMunicipalities} municipalities` : `${coveredMunicipalities} municipalities`;
    const comparableTariffs = provinceTariffs.filter((record) => record.energyChargePerKwh != null
      && Number.isFinite(Number(record.energyChargePerKwh)));
    const hasPlanAmbiguity = !tariffPlan.value && new Set(provinceTariffs.map((record) => normalizeName(record.municipality.name))).size < provinceTariffs.length;
    const average = hasPlanAmbiguity
      ? 'Choose a plan to compare rates'
      : comparableTariffs.length
      ? `R${formatNumber(comparableTariffs.reduce((sum, record) => sum + Number(record.energyChargePerKwh), 0) / comparableTariffs.length, 2)}/kWh`
      : provinceTariffs.length ? 'Tiered schedules available; no flat-rate comparison' : 'Data unavailable';
    details.push(`<div class="map-info-item"><b>Verified tariff coverage · ${SolarFormat.escape(tariffCategory.value || 'all categories')}${tariffPlan.value ? ` · ${SolarFormat.escape(tariffPlan.value)}` : ''}</b><span>${SolarFormat.escape(average)}</span><small>${SolarFormat.escape(coverage)} with a matching active record${comparableTariffs.length && !hasPlanAmbiguity ? ` · unweighted average of ${comparableTariffs.length} flat-rate records, not a province-wide tariff` : ''}${provinceTariffs.some((record) => record.energyBlocks?.length) ? ' · tiered rates are not combined into a flat estimate' : ''}${tariffLoadError ? ` · ${SolarFormat.escape(tariffLoadError)}` : ''}</small></div>`);
  }
  if (currentLayer === 'savings' || currentLayer === 'payback') {
    const missing = missingFinancialInputs();
    if (financial && financial.settingsKey === financialSettingsKey()) {
      const value = currentLayer === 'savings'
        ? `R${formatNumber(financial.result.financial.annualSavings, 0)} per year`
        : financial.result.financial.paybackYears == null ? 'No payback under these assumptions' : `${formatNumber(financial.result.financial.paybackYears, 1)} years`;
      details.push(`<div class="map-info-item"><b>${SolarFormat.escape(layerLabel(currentLayer))} · modelled estimate</b><span>${SolarFormat.escape(value)}</span><small>${SolarFormat.escape(financial.source)} · retrieved ${formatDate(financial.retrievedAt)} · includes stated self-consumption, tariff escalation and maintenance assumptions</small></div>`);
    } else {
      details.push(`<div class="map-info-item"><b>${SolarFormat.escape(layerLabel(currentLayer))}</b><span class="map-unavailable">${missing.length ? 'Data unavailable' : 'Loading estimate…'}</span><small>${SolarFormat.escape(missing.length ? `Enter ${missing.join(', ')} in the assumptions panel.` : 'The solar calculation is in progress.')}</small></div>`);
    }
  }
  const flatTariffs = areaTariffs.filter((record) => record.energyChargePerKwh != null);
  const hasTieredTariffs = areaTariffs.some((record) => record.energyBlocks?.length);
  const tariffActions = flatTariffs.length
    ? `<div class="map-tariff-actions">${flatTariffs.map((record) => `<button type="button" class="use-map-tariff" data-tariff="${SolarFormat.escape(record.id)}">Use ${SolarFormat.escape(record.name)} in estimates</button>`).join('')}</div>`
    : hasTieredTariffs
      ? '<p class="map-helper">Select a specific energy rate from the schedule and enter it manually for calculator estimates; the block schedule is not reduced to a single rate.</p>'
      : '';
  const errorHtml = boundaryError ? `<p class="form-error">${SolarFormat.escape(boundaryError)}</p>` : '';
  selectedArea.innerHTML = `${errorHtml}<h2 id="selected-area-heading">${SolarFormat.escape(selectedFeature.properties.name)}</h2><p class="map-source-tag">${SolarFormat.escape(typeLabel)}</p><div class="map-info-list">${details.join('')}</div>${tariffActions}`;
  bindTariffButtons(selectedArea);
  updateCalculateLink();
  document.getElementById('map-zoom-to-selection').disabled = false;
}

function renderMunicipalityTariffInfo(tariff) {
  if (tariffLoadError) {
    return `<div class="map-info-item"><b>Municipal electricity tariff</b><span class="map-unavailable">Data unavailable</span><small>${SolarFormat.escape(tariffLoadError)}</small></div>`;
  }
  if (!tariff) {
    return `<div class="map-info-item"><b>Municipal electricity tariffs · ${SolarFormat.escape(tariffCategory.value || 'all categories')}</b><span class="map-unavailable">Data unavailable</span><small>No verified active tariff schedule has been published for this municipality and customer category yet. Add an approved tariff record in the admin dashboard to populate this field.</small></div>`;
  }
  const energyDisplay = Array.isArray(tariff.energyBlocks) && tariff.energyBlocks.length
    ? `<span>Inclining-block schedule</span><small>${tariff.energyBlocks.map((block, index) => `Block ${index + 1}: ${block.upToKwh == null ? 'above previous limit' : `up to ${SolarFormat.number(block.upToKwh)} kWh`} at R${formatNumber(Number(block.ratePerKwh), 4)}/kWh`).join('<br>')}</small>`
    : `<span>${tariff.energyChargePerKwh == null ? 'Energy rate unavailable' : `R${formatNumber(Number(tariff.energyChargePerKwh), 4)} per kWh`}</span>`;
  const fixedCharge = tariff.fixedMonthlyCharge == null
    ? 'Fixed monthly charge not specified'
    : `R${formatNumber(Number(tariff.fixedMonthlyCharge), 2)} monthly fixed charge`;
  const fixedChargeDetails = Array.isArray(tariff.fixedCharges)
    ? tariff.fixedCharges.map((charge) => `${SolarFormat.escape(charge.name)}: R${formatNumber(Number(charge.amount), 2)} ${charge.frequency}`).join('<br>')
    : '';
  const vatStatus = tariff.pricesIncludeVat == null ? 'VAT treatment not specified' : `Prices ${tariff.pricesIncludeVat ? 'include' : 'exclude'} VAT`;
  return `<div class="map-info-item"><b>Official tariff · ${SolarFormat.escape(tariff.customerCategory)}</b>${energyDisplay}<small>${SolarFormat.escape(fixedCharge)}${fixedChargeDetails ? `<br>${fixedChargeDetails}` : ''} · ${SolarFormat.escape(vatStatus)}<br>${SolarFormat.escape(tariff.name)} · effective ${formatDate(tariff.effectiveFrom)} · last verified ${formatDate(tariff.lastVerifiedAt)}${isOldTariff(tariff) ? ' · check for updates' : ''}<br>Source: <a href="${SolarFormat.escape(tariff.sourceUrl)}" target="_blank" rel="noopener noreferrer">official tariff publication</a></small></div>`;
}

function bindTariffButtons(container) {
  container.querySelectorAll('.use-map-tariff').forEach((button) => {
    button.addEventListener('click', () => {
      const record = tariffRecords.find((item) => item.id === button.dataset.tariff);
      if (!record || record.energyChargePerKwh == null) return;
      document.getElementById('map-tariff').value = Number(record.energyChargePerKwh);
      const categoryIndex = [...tariffCategory.options].findIndex((option) => option.value === record.customerCategory);
      if (categoryIndex >= 0) tariffCategory.selectedIndex = categoryIndex;
      updateTariffPlanOptions();
      tariffPlan.value = planKey(record);
      financialValues.clear();
      updateCalculateLink();
      refreshMap();
      renderSelectedArea();
      if (currentLayer === 'savings' || currentLayer === 'payback') applyLayer();
    });
  });
}

function updateCalculateLink() {
  if (!selectedFeature) {
    calculateLink.setAttribute('aria-disabled', 'true');
    calculateLink.removeAttribute('href');
    return;
  }
  calculateLink.setAttribute('aria-disabled', 'false');
  const [longitude, latitude] = selectedFeature.properties.representativePoint;
  const query = new URLSearchParams({
    locationName: selectedFeature.properties.name,
    locationProvince: selectedFeature.properties.province || '',
    latitude: String(latitude),
    longitude: String(longitude),
    systemKw: document.getElementById('map-system-size').value,
    orientation: document.getElementById('map-orientation').value,
    tilt: document.getElementById('map-tilt').value
  });
  const solar = solarValues.get(regionKey(selectedFeature));
  if (solar?.dailyAverageKwhM2 > 0) query.set('irradiation', solar.dailyAverageKwhM2.toFixed(2));
  const inputNames = {
    monthlyConsumption: 'map-monthly-usage',
    monthlyBill: 'map-monthly-bill',
    tariff: 'map-tariff',
    installationCost: 'map-system-cost'
  };
  for (const [parameter, id] of Object.entries(inputNames)) {
    const value = Number(document.getElementById(id).value);
    if (Number.isFinite(value) && value > 0) query.set(parameter, String(value));
  }
  calculateLink.href = `calculator.html?${query}`;
}

function financialInputs() {
  return {
    monthlyConsumption: Number(document.getElementById('map-monthly-usage').value),
    monthlyBill: Number(document.getElementById('map-monthly-bill').value),
    tariff: Number(document.getElementById('map-tariff').value),
    installationCost: Number(document.getElementById('map-system-cost').value),
    systemKw: Number(document.getElementById('map-system-size').value),
    selfConsumption: Number(document.getElementById('map-self-consumption').value) / 100,
    orientation: Number(document.getElementById('map-orientation').value),
    tilt: Number(document.getElementById('map-tilt').value)
  };
}

function missingFinancialInputs() {
  const required = [
    ['map-monthly-usage', 'monthly electricity use'],
    ['map-monthly-bill', 'monthly electricity bill'],
    ['map-tariff', 'energy tariff'],
    ['map-system-cost', 'installed system cost']
  ];
  const missing = required.filter(([id]) => {
    const input = document.getElementById(id);
    return !input.value || !input.validity.valid || Number(input.value) <= 0;
  }).map(([, label]) => label);
  const selfConsumption = document.getElementById('map-self-consumption');
  if (!selfConsumption.validity.valid || !selfConsumption.value) missing.push('self-consumption percentage');
  return missing;
}

function financialSettingsKey() {
  return JSON.stringify(financialInputs());
}

function formatLegendValue(value, layer) {
  if (layer === 'tariff') return `R${formatNumber(value, 2)}`;
  if (layer === 'savings') return `R${formatNumber(value, 0)}`;
  if (layer === 'payback' && value > 25) return 'No payback in 25 yrs';
  if (layer === 'payback') return `${formatNumber(value, 1)} yrs`;
  return `${formatNumber(value, 0)} kWh/m²`;
}

function layerLabel(layer) {
  return {
    solar: 'Solar irradiation',
    tariff: 'Electricity tariff',
    savings: 'Estimated annual savings',
    payback: 'Estimated solar payback'
  }[layer];
}

function regionKey(feature) {
  if (!feature) return '';
  const properties = feature.properties;
  return properties.boundaryType === 'ADM1'
    ? `province:${normalizeName(properties.name)}`
    : `municipality:${normalizeName(properties.province)}:${normalizeName(properties.name)}`;
}

function normalizeName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function slugify(value) {
  return normalizeName(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function formatNumber(value, digits = 0) {
  return Number.isFinite(Number(value)) ? SolarFormat.number(Number(value), digits) : 'Data unavailable';
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-ZA') : 'date unavailable';
}

function isOldTariff(record) {
  return Date.now() - new Date(record.lastVerifiedAt).getTime() > 365 * 24 * 60 * 60 * 1000;
}

function setMapStatus(message, isError = false) {
  mapStatus.textContent = message;
  mapStatus.classList.toggle('is-error', isError);
}

function syncMapTheme() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  mapElement.classList.toggle('dark-map-leaflet', isDark);
  mapElement.querySelectorAll('.province-label,.municipality-label').forEach((label) => {
    label.classList.toggle('dark-map-label', isDark);
  });
}
})();
