function affordability(input) {
  const { currentSavings, monthlySaving, targetCost, monthlyReturn = 0, annualInflation = 0, annualLumpSum = 0 } = input;
  let balance = currentSavings;
  let months = 0;
  const maxMonths = 1200;
  while (balance < targetCost && months < maxMonths) {
    months += 1;
    balance = balance * (1 + monthlyReturn) + monthlySaving;
    if (months % 12 === 0) balance += annualLumpSum;
  }
  const inflationMonths = monthsToTargetWithInflation(input);
  const inflatedTarget = targetCost * ((1 + annualInflation) ** ((inflationMonths ?? months) / 12));
  const requiredWithoutReturns = Math.max(0, targetCost - currentSavings);
  return {
    targetCost: Math.round(targetCost),
    currentSavings: Math.round(currentSavings),
    remainingAtCurrentPrices: Math.round(Math.max(0, targetCost - currentSavings)),
    monthsToTarget: balance >= targetCost ? months : null,
    estimatedCompletionDate: inflationMonths !== null ? new Date(Date.now() + inflationMonths * 30.4375 * 86400000).toISOString().slice(0, 10) : null,
    targetAdjustedForInflation: Math.round(inflatedTarget),
    estimatedMonthsWithInflation: inflationMonths,
    monthsWithoutReturns: monthlySaving > 0 ? Math.ceil(requiredWithoutReturns / monthlySaving) : (requiredWithoutReturns === 0 ? 0 : null),
    finalBalance: balance >= targetCost ? Math.round(balance) : null
  };
}

function monthsToTargetWithInflation({ currentSavings, monthlySaving, targetCost, monthlyReturn = 0, annualInflation = 0, annualLumpSum = 0 }) {
  let balance = currentSavings;
  if (balance >= targetCost) return 0;
  for (let month = 1; month <= 1200; month += 1) {
    balance = balance * (1 + monthlyReturn) + monthlySaving;
    if (month % 12 === 0) balance += annualLumpSum;
    const target = targetCost * ((1 + annualInflation) ** (month / 12));
    if (balance >= target) return month;
  }
  return null;
}

function loan(input) {
  const { systemCost, deposit = 0, annualInterestRate, termMonths } = input;
  const principal = Math.max(0, systemCost - deposit);
  const monthlyRate = annualInterestRate / 12;
  const payment = monthlyRate === 0
    ? principal / termMonths
    : principal * monthlyRate / (1 - (1 + monthlyRate) ** -termMonths);
  const totalRepayment = payment * termMonths;
  return {
    principal: Math.round(principal),
    monthlyRepayment: Math.round(payment),
    totalInterest: Math.round(totalRepayment - principal),
    totalRepayment: Math.round(totalRepayment),
    netMonthlyImpact: Math.round((input.monthlySavings || 0) - payment),
    savingsCoverRepayment: (input.monthlySavings || 0) >= payment
  };
}

module.exports = { affordability, loan };
