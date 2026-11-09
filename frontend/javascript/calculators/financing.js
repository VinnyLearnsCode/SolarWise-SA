document.getElementById('loan-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const output = document.getElementById('loan-results');
  const error = document.getElementById('loan-error');
  error.textContent = '';
  try {
    const { result } = await SolarAPI.post('/calculations/loan', {
      systemCost: Number(data.systemCost), deposit: Number(data.deposit),
      annualInterestRate: Number(data.annualInterestRate) / 100,
      termMonths: Number(data.termMonths), monthlySavings: Number(data.monthlySavings || 0)
    });
    output.innerHTML = `<div class="result-hero"><small>Estimated net monthly impact (savings minus repayment)</small><strong>${SolarFormat.money(result.netMonthlyImpact)} ${result.netMonthlyImpact >= 0 ? 'positive' : 'negative'} / month</strong></div>
      <div class="result-grid"><div class="result-metric"><small>Amount financed</small><strong>${SolarFormat.money(result.principal)}</strong></div>
      <div class="result-metric"><small>Estimated monthly repayment</small><strong>${SolarFormat.money(result.monthlyRepayment)}</strong></div>
      <div class="result-metric"><small>Total interest</small><strong>${SolarFormat.money(result.totalInterest)}</strong></div>
      <div class="result-metric"><small>Total repayment</small><strong>${SolarFormat.money(result.totalRepayment)}</strong></div></div>
      <p class="assumptions">Savings ${result.savingsCoverRepayment ? 'cover' : 'do not cover'} the estimated repayment. Calculation excludes fees, insurance, tax and rate changes; use the lender's disclosed total cost of credit.</p>`;
  } catch (reason) {
    error.textContent = reason.message;
    output.innerHTML = '<div class="empty-state"><h2>Could not calculate financing</h2></div>';
  }
});
