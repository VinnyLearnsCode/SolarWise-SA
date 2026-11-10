const express = require('express');
const { z } = require('zod');
const calculations = require('../controllers/calculations');
const { getWeather } = require('../integrations/weather');
const { getSolarPotential, getSolarIrradiation } = require('../integrations/pvgis');
const { assessSolar } = require('../calculations/solar');
const { getPrisma, checkDatabaseConnection } = require('../utils/prisma');
const admin = require('../controllers/admin');
const { requireAdmin } = require('../middleware/admin-auth');

const router = express.Router();
router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'SolarWise SA', timestamp: new Date().toISOString() }));
router.get('/health/ready', async (_req, res) => {
  const database = await checkDatabaseConnection();
  const ready = database.status === 'connected';
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'degraded',
    service: 'SolarWise SA',
    database,
    timestamp: new Date().toISOString()
  });
});
router.post('/calculations/solar', calculations.postAssessment);
router.post('/calculations/affordability', calculations.postAffordability);
router.post('/calculations/loan', calculations.postLoan);
router.post('/calculations/usage', calculations.postUsage);
router.post('/calculations/battery', calculations.postBattery);
router.post('/admin/login', admin.login);
router.put('/admin/credentials', requireAdmin, admin.updateCredentials);
router.get('/admin/overview', requireAdmin, admin.overview);
router.get('/admin/provinces', requireAdmin, admin.listProvinces);
router.get('/admin/municipalities', requireAdmin, admin.listMunicipalities);
router.post('/admin/municipalities', requireAdmin, admin.createMunicipality);
router.get('/admin/tariffs', requireAdmin, admin.listTariffs);
router.post('/admin/tariffs', requireAdmin, admin.createTariff);
router.post('/admin/tariffs/import', requireAdmin, admin.importTariffs);
router.post('/admin/tariffs/:id/close', requireAdmin, admin.closeTariff);
router.get('/weather', async (req, res) => {
  const { latitude, longitude } = coordinates(req.query);
  res.json(await getWeather(latitude, longitude));
});
router.get('/solar-potential', async (req, res) => {
  const { latitude, longitude } = coordinates(req.query);
  const peakPower = z.coerce.number().positive().max(1000).default(1).parse(req.query.peakPower);
  const orientation = z.coerce.number().min(-180).max(180).default(180).parse(req.query.orientation);
  const tilt = z.coerce.number().min(0).max(90).default(30).parse(req.query.tilt);
  res.json(await getSolarPotential(latitude, longitude, peakPower, orientation, tilt));
});
router.get('/solar-irradiation', async (req, res) => {
  const { latitude, longitude } = coordinates(req.query);
  res.json(await getSolarIrradiation(latitude, longitude));
});
router.post('/solar-map/financial-estimate', async (req, res) => {
  const input = z.object({
    latitude: z.number().min(-35).max(-22),
    longitude: z.number().min(16).max(33),
    monthlyBill: z.number().positive().max(100000000),
    monthlyConsumption: z.number().positive().max(1000000),
    tariff: z.number().positive().max(10000),
    systemKw: z.number().positive().max(1000),
    installationCost: z.number().positive().max(100000000),
    selfConsumption: z.number().min(0).max(1).default(0.75),
    orientation: z.number().min(-180).max(180).default(180),
    tilt: z.number().min(0).max(90).default(30)
  }).parse(req.body);
  const solar = await getSolarPotential(
    input.latitude,
    input.longitude,
    input.systemKw,
    input.orientation,
    input.tilt
  );
  const annualGeneration = solar.data?.outputs?.totals?.fixed?.E_y;
  if (!Number.isFinite(annualGeneration) || annualGeneration <= 0) {
    const unavailable = new Error('PVGIS did not return usable annual generation for this location.');
    unavailable.status = 503;
    unavailable.code = 'UPSTREAM_INVALID_DATA';
    throw unavailable;
  }
  const irradiation = annualGeneration / (input.systemKw * 365 * 0.78);
  const result = assessSolar({
    ...input,
    irradiation,
    performanceRatio: 0.78,
    annualTariffIncrease: 0.08,
    lifespanYears: 25
  });
  res.json({
    result,
    source: solar.source,
    dataType: solar.dataType,
    retrievedAt: solar.retrievedAt,
    assumptions: {
      irradiationMethod: 'PVGIS modeled annual PV generation converted for the existing SolarWise assessment model',
      selfConsumption: input.selfConsumption,
      annualTariffIncrease: 0.08,
      lifespanYears: 25,
      maintenanceRate: 0.01,
      orientation: input.orientation,
      tilt: input.tilt
    }
  });
});
router.get('/tariffs', async (_req, res) => {
  try {
    const tariffs = await getPrisma().electricityTariff.findMany({
      where: { effectiveTo: null, effectiveFrom: { lte: new Date() } },
      include: { municipality: { select: { name: true, province: { select: { name: true } } } } },
      orderBy: [{ municipality: { name: 'asc' } }, { effectiveFrom: 'desc' }]
    });
    res.json({ tariffs, status: 'administrator-maintained; verify each source and effective date' });
  } catch (error) {
    if (error.code === 'P1001' || error.code === 'P2021') {
      return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Tariff records are unavailable until the database is configured.' } });
    }
    throw error;
  }
});
router.post('/feedback', async (req, res) => {
  const input = z.object({ message: z.string().trim().min(10).max(2000), email: z.string().email().max(254).optional() }).parse(req.body);
  try {
    await getPrisma().feedback.create({ data: input });
    res.status(201).json({ status: 'received' });
  } catch (error) {
    if (error.code === 'P1001' || error.code === 'P2021') {
      return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Feedback storage is temporarily unavailable.' } });
    }
    throw error;
  }
});

function coordinates(query) {
  return z.object({
    latitude: z.coerce.number().min(-35).max(-22),
    longitude: z.coerce.number().min(16).max(33)
  }).parse(query);
}

module.exports = router;
