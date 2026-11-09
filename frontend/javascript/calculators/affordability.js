document.getElementById('afford-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const error = document.getElementById('afford-error');
  const output = document.getElementById('afford-results');
  error.textContent = '';
  output.innerHTML = '<div class="empty-state"><h2>Building your savings timeline…</h2></div>';
  const payload = {
    currentSavings: Number(data.currentSavings),
    monthlySaving: Number(data.monthlySaving),
    targetCost: Number(data.targetCost),
    annualLumpSum: Number(data.annualLumpSum || 0),
    monthlyReturn: (Number(data.annualReturn || 0) / 100) / 12,
    annualInflation: Number(data.annualInflation || 0) / 100
  };
  try {
    const { result } = await SolarAPI.post('/calculations/affordability', payload);
    const months = result.estimatedMonthsWithInflation;
    const progress = result.targetCost > 0 ? Math.min(100, result.currentSavings / result.targetCost * 100) : 0;
    output.innerHTML = `
      <div class="result-hero"><small>Estimated time to target, adjusted for cost inflation</small><strong>${months === null ? 'More than 100 years at this savings rate' : `${months} months`}</strong></div>
      <div class="result-grid">
        <div class="result-metric"><small>Target at today's estimate</small><strong>${SolarFormat.money(result.targetCost)}</strong></div>
        <div class="result-metric"><small>Estimated future target</small><strong>${SolarFormat.money(result.targetAdjustedForInflation)}</strong></div>
        <div class="result-metric"><small>Current savings</small><strong>${SolarFormat.money(result.currentSavings)}</strong></div>
        <div class="result-metric"><small>Remaining at today's prices</small><strong>${SolarFormat.money(result.remainingAtCurrentPrices)}</strong></div>
      </div>
      <div class="progress-track" role="progressbar" aria-label="Current savings progress" aria-valuenow="${Math.round(progress)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress}%"></span></div>
      <div class="timeline-meta"><span>Today · ${SolarFormat.money(result.currentSavings)}</span><span>${months === null ? 'Target not reached' : `Est. ${SolarFormat.escape(result.estimatedCompletionDate || 'date varies')}`}</span></div>
      <p class="assumptions">This assumes a ${SolarFormat.number(Number(data.annualReturn || 0), 1)}% annual return compounded monthly and ${SolarFormat.number(Number(data.annualInflation || 0), 1)}% annual installation-cost inflation. Returns are not guaranteed. Without returns/inflation, the simple estimate is ${result.monthsWithoutReturns === null ? 'not attainable at this monthly saving' : `${result.monthsWithoutReturns} months`}.</p>`;
  } catch (reason) {
    error.textContent = reason.message;
    output.innerHTML = '<div class="empty-state"><h2>Could not calculate timeline</h2></div>';
  }
});
