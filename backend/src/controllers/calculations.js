const { solarAssessment } = require('../validators/schemas');
const { assessSolar } = require('../calculations/solar');
const { affordability, loan } = require('../calculations/finance');
const { applianceUsage, batterySizing } = require('../calculations/energy');
const { z } = require('zod');
const { money } = require('../validators/schemas');

function validate(schema, body) {
  return schema.parse(body);
}
function postAssessment(req, res) {
  const input = validate(solarAssessment, req.body);
  res.json({ result: assessSolar(input), generatedAt: new Date().toISOString(), dataStatus: 'estimated from user inputs and stated assumptions' });
}
function postAffordability(req, res) {
  const input = validate(z.object({
    currentSavings: money, monthlySaving: money, targetCost: z.number().positive().max(100000000),
    monthlyReturn: z.number().min(0).max(0.05).default(0),
    annualInflation: z.number().min(0).max(0.5).default(0),
    annualLumpSum: money.default(0)
  }), req.body);
  res.json({ result: affordability(input), generatedAt: new Date().toISOString() });
}
function postLoan(req, res) {
  const input = validate(z.object({
    systemCost: z.number().positive().max(100000000), deposit: money.default(0),
    annualInterestRate: z.number().min(0).max(1), termMonths: z.number().int().min(1).max(360),
    monthlySavings: money.optional()
  }), req.body);
  if (input.deposit > input.systemCost) {
    const error = new Error('Deposit cannot exceed system cost.');
    error.status = 400;
    error.code = 'INVALID_DEPOSIT';
    throw error;
  }
  res.json({ result: loan(input), generatedAt: new Date().toISOString() });
}
function postUsage(req, res) {
  const input = validate(z.object({
    tariff: z.number().min(0).max(10000).default(0),
    appliances: z.array(z.object({
      name: z.string().min(1).max(80), watts: z.number().positive().max(100000),
      quantity: z.number().int().positive().max(100), hoursPerDay: z.number().min(0).max(24),
      daysPerMonth: z.number().min(0).max(31)
    })).min(1).max(100)
  }), req.body);
  res.json({ result: applianceUsage(input.appliances, input.tariff) });
}
function postBattery(req, res) {
  const input = validate(z.object({
    hours: z.number().positive().max(168),
    appliances: z.array(z.object({
      watts: z.number().positive().max(100000), quantity: z.number().int().positive().max(100),
      hours: z.number().positive().max(168)
    })).min(1).max(100)
  }), req.body);
  const appliances = input.appliances.map((appliance) => ({
    ...appliance,
    hours: Math.min(appliance.hours, input.hours)
  }));
  res.json({ result: batterySizing(appliances, input.hours) });
}

module.exports = { postAssessment, postAffordability, postLoan, postUsage, postBattery };
