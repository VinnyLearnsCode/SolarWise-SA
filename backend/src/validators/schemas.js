const { z } = require('zod');

const money = z.number().finite().min(0).max(100000000);
const solarAssessment = z.object({
  monthlyBill: money,
  monthlyConsumption: z.number().finite().positive().max(1000000),
  tariff: z.number().finite().positive().max(10000),
  systemKw: z.number().finite().positive().max(1000),
  batteryKwh: z.number().finite().min(0).max(10000).optional(),
  installationCost: z.number().finite().positive().max(100000000),
  annualTariffIncrease: z.number().min(0).max(0.5).optional(),
  lifespanYears: z.number().int().min(1).max(50).optional(),
  annualMaintenance: money.optional(),
  irradiation: z.number().positive().max(10).optional(),
  performanceRatio: z.number().positive().max(1).optional(),
  selfConsumption: z.number().min(0).max(1).optional(),
  mode: z.enum(['partial', 'backup', 'hybrid', 'off-grid']).optional()
});

module.exports = { solarAssessment, money };
