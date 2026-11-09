const express = require('express');
const { z } = require('zod');
const calculations = require('../controllers/calculations');
const { getWeather } = require('../integrations/weather');
const { getSolarPotential } = require('../integrations/pvgis');
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
router.post('/admin/tariffs/:id/close', requireAdmin, admin.closeTariff);
router.get('/weather', async (req, res) => {
  const { latitude, longitude } = coordinates(req.query);
  res.json(await getWeather(latitude, longitude));
});
router.get('/solar-potential', async (req, res) => {
  const { latitude, longitude } = coordinates(req.query);
  const peakPower = z.coerce.number().positive().max(1000).default(1).parse(req.query.peakPower);
  res.json(await getSolarPotential(latitude, longitude, peakPower));
});
router.get('/tariffs', async (_req, res) => {
  try {
    const tariffs = await getPrisma().electricityTariff.findMany({
      where: { effectiveTo: null }, include: { municipality: { select: { name: true, province: { select: { name: true } } } } },
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
