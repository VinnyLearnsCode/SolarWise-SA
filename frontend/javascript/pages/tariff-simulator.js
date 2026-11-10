const simulatorForm = document.getElementById('tariff-simulator-form');
const tariffSelect = document.getElementById('simulator-tariff');
const customTariffFields = document.getElementById('custom-tariff-fields');
const tariffStatus = document.getElementById('simulator-tariff-status');
const resultPanel = document.getElementById('simulator-results');
let tariffs = [];

tariffSelect?.addEventListener('change', updateTariffSelection);
simulatorForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const status = document.getElementById('simulator-error');
  status.textContent = '';
  const selected = tariffSelect.value;
  const tariff = selected === 'custom'
    ? customTariffFromForm()
    : tariffs.find((record) => record.id === selected);
  if (!tariff) {
    status.textContent = 'Choose a supported published tariff, or enter your own flat rate.';
    return;
  }

  try {
    const result = TariffMath.simulate({
      monthlyConsumptionKwh: Number(simulatorForm.elements.monthlyConsumptionKwh.value),
      monthlySolarGenerationKwh: Number(simulatorForm.elements.monthlySolarGenerationKwh.value),
      selfConsumptionPercent: Number(simulatorForm.elements.selfConsumptionPercent.value)
    }, tariff);
    renderResult(result, tariff, selected === 'custom');
  } catch (error) {
    status.textContent = error.message;
    resultPanel.innerHTML = '<div class="empty-state"><h2>Check your inputs</h2><p>Enter valid usage, solar generation, and tariff details to see an estimate.</p></div>';
  }
});

loadTariffs();

async function loadTariffs() {
  try {
    const response = await SolarAPI.request('/tariffs');
    tariffs = response.tariffs || [];
    for (const tariff of tariffs) {
      const option = document.createElement('option');
      option.value = tariff.id;
      const schedule = Array.isArray(tariff.energyBlocks) && tariff.energyBlocks.length
        ? `Tiered · ${tariff.energyBlocks.length} blocks`
        : tariff.energyChargePerKwh != null && Number.isFinite(Number(tariff.energyChargePerKwh))
          ? `Flat · R${Number(tariff.energyChargePerKwh).toFixed(4)}/kWh`
          : '';
      const unsupportedTimeOfUse = tariff.timeOfUseRates && Object.keys(tariff.timeOfUseRates).length > 0;
      option.textContent = `${tariff.municipality.province.name} · ${tariff.municipality.name} · ${tariff.name} · ${schedule}${unsupportedTimeOfUse ? ' · time-of-use not supported' : ''}`;
      if (!schedule || unsupportedTimeOfUse) {
        option.disabled = true;
        option.textContent += ' (not available in this estimate)';
      }
      tariffSelect.append(option);
    }
    const supportedCount = tariffs.filter(isSupportedTariff).length;
    tariffStatus.textContent = supportedCount
      ? `${supportedCount} published flat or tiered tariff(s) available. Check the source, effective date and VAT basis against your latest bill.`
      : 'No supported published tariffs are available. You can enter the flat energy rate from your bill.';
    updateTariffSelection();
  } catch (error) {
    tariffStatus.textContent = `Published tariffs could not be loaded (${error.message}). You can enter the flat energy rate from your bill.`;
  }
}

function isSupportedTariff(tariff) {
  const hasBlocks = Array.isArray(tariff.energyBlocks) && tariff.energyBlocks.length > 0;
  const hasFlatRate = tariff.energyChargePerKwh != null && Number.isFinite(Number(tariff.energyChargePerKwh));
  const hasTimeOfUse = tariff.timeOfUseRates && Object.keys(tariff.timeOfUseRates).length > 0;
  return (hasBlocks || hasFlatRate) && !hasTimeOfUse;
}

function updateTariffSelection() {
  const isCustom = tariffSelect.value === 'custom';
  customTariffFields.hidden = !isCustom;
  document.getElementById('custom-energy-rate').required = isCustom;
  const tariff = tariffs.find((record) => record.id === tariffSelect.value);
  if (!tariff) {
    tariffStatus.textContent = isCustom
      ? 'Enter the energy rate from your latest bill. This is a user-provided flat-rate assumption; no official tariff data is applied.'
      : 'Select a supported published tariff or enter your own flat rate.';
    return;
  }
  const verifiedAt = new Date(tariff.lastVerifiedAt);
  const effectiveFrom = new Date(tariff.effectiveFrom);
  const daysSinceVerified = Math.floor((Date.now() - verifiedAt.getTime()) / 86400000);
  const vatStatus = tariff.pricesIncludeVat == null
    ? 'VAT treatment not stated'
    : `VAT ${tariff.pricesIncludeVat ? 'included' : 'excluded'} in published rates`;
  tariffStatus.replaceChildren();
  tariffStatus.append(document.createTextNode(
    `${tariff.municipality.province.name} · ${tariff.municipality.name} · ${tariff.name}. Effective ${effectiveFrom.toLocaleDateString('en-ZA')}. ${vatStatus}. Last verified ${verifiedAt.toLocaleDateString('en-ZA')}${daysSinceVerified > 365 ? ` (${daysSinceVerified} days ago; re-check with your provider)` : ''}. Source: `
  ));
  const source = document.createElement('a');
  source.href = tariff.sourceUrl;
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  source.textContent = 'official tariff publication';
  tariffStatus.append(source);
}

function customTariffFromForm() {
  return {
    energyChargePerKwh: Number(simulatorForm.elements.customEnergyRate.value),
    fixedMonthlyCharge: Number(simulatorForm.elements.customFixedCharge.value || 0)
  };
}

function renderResult(result, tariff, isCustom) {
  const money = (value) => SolarFormat.money(Math.round(value * 100) / 100);
  const sourceDetails = isCustom
    ? 'User-provided flat energy rate; not verified against a published schedule.'
    : `Published energy rates as listed; VAT treatment is ${tariff.pricesIncludeVat == null ? 'not stated' : tariff.pricesIncludeVat ? 'included' : 'excluded'}.`;
  resultPanel.innerHTML = `
    <span class="eyebrow">Estimated monthly bill comparison</span>
    <h2>${SolarFormat.escape(isCustom ? 'Your entered tariff' : tariff.name)}</h2>
    <div class="simulator-saving"><small>Estimated electricity-cost reduction</small><strong>${money(result.monthlySavings)}<span>/month</span></strong><small>${money(result.annualSavings)} per year at the same usage and solar assumptions</small></div>
    <div class="simulator-bill-grid">
      <div><small>Before solar</small><strong>${money(result.currentMonthlyBill)}</strong><span>${SolarFormat.number(result.monthlyConsumptionKwh, 1)} kWh from the grid</span></div>
      <div><small>After solar</small><strong>${money(result.afterSolarMonthlyBill)}</strong><span>${SolarFormat.number(result.remainingGridUsageKwh, 1)} kWh remains from the grid</span></div>
    </div>
    <dl class="simulator-breakdown">
      <div><dt>Energy charge before solar</dt><dd>${money(result.currentEnergyCharge)}</dd></div>
      <div><dt>Energy charge after solar</dt><dd>${money(result.afterSolarEnergyCharge)}</dd></div>
      <div><dt>Fixed monthly charges (unchanged)</dt><dd>${money(result.fixedMonthly)}</dd></div>
      <div><dt>Solar generation used at home</dt><dd>${SolarFormat.number(result.solarUsedKwh, 1)} kWh</dd></div>
    </dl>
    <p class="assumptions">${SolarFormat.escape(sourceDetails)} Fixed charges remain payable; one-time charges are excluded. Export credits and time-of-use periods are not modeled. Solar sent to the grid earns no assumed credit. Actual bills vary with season, usage timing, VAT and supplier rules.</p>
    ${!isCustom ? `<p class="simulator-source"><a href="${SolarFormat.escape(tariff.sourceUrl)}" target="_blank" rel="noopener noreferrer">Check the tariff source</a> · verified ${new Date(tariff.lastVerifiedAt).toLocaleDateString('en-ZA')}</p>` : ''}
  `;
}
