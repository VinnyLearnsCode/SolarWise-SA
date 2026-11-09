const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { getPrisma } = require('../utils/prisma');

async function login(req, res) {
  const input = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) }).parse(req.body);
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return res.status(503).json({ error: { code: 'AUTH_NOT_CONFIGURED', message: 'Administrator authentication is not configured securely.' } });
  }
  const admin = await getPrisma().administrator.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!admin || !(await bcrypt.compare(input.password, admin.passwordHash))) {
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
  }
  const token = jwt.sign({ sub: admin.id, role: admin.role }, process.env.JWT_SECRET, { expiresIn: '8h', issuer: 'solarwise-sa' });
  res.json({ token, expiresIn: 28800 });
}

async function overview(_req, res) {
  const db = getPrisma();
  const [tariffs, municipalities, feedback, dataSources] = await Promise.all([
    db.electricityTariff.count(), db.municipality.count(), db.feedback.count(), db.solarDataset.count()
  ]);
  res.json({ counts: { tariffs, municipalities, feedback, dataSources } });
}

async function listProvinces(_req, res) {
  const provinces = await getPrisma().province.findMany({ orderBy: { name: 'asc' } });
  res.json({ provinces });
}

async function listMunicipalities(_req, res) {
  const municipalities = await getPrisma().municipality.findMany({
    include: { province: { select: { name: true, code: true } } },
    orderBy: [{ province: { name: 'asc' } }, { name: 'asc' }]
  });
  res.json({ municipalities });
}

async function createMunicipality(req, res) {
  const input = z.object({
    name: z.string().trim().min(2).max(120),
    provinceId: z.string().min(1)
  }).parse(req.body);
  const municipality = await getPrisma().municipality.create({ data: input });
  res.status(201).json({ municipality });
}

async function listTariffs(_req, res) {
  const tariffs = await getPrisma().electricityTariff.findMany({
    include: { municipality: { include: { province: { select: { name: true } } } } },
    orderBy: [{ effectiveFrom: 'desc' }, { name: 'asc' }]
  });
  res.json({ tariffs });
}

async function createTariff(req, res) {
  const input = z.object({
    municipalityId: z.string().min(1), name: z.string().trim().min(1).max(120),
    customerCategory: z.string().trim().min(1).max(80), effectiveFrom: z.coerce.date(),
    fixedMonthlyCharge: z.number().min(0), energyChargePerKwh: z.number().min(0),
    timeOfUseRates: z.record(z.string(), z.unknown()).optional(),
    feedInRatePerKwh: z.number().min(0).optional(),
    sourceUrl: z.string().url().max(500).refine((value) => new URL(value).protocol === 'https:', 'Source URL must use HTTPS.'),
    lastVerifiedAt: z.coerce.date()
  }).parse(req.body);
  const tariff = await getPrisma().electricityTariff.create({ data: input });
  res.status(201).json({ tariff });
}

async function closeTariff(req, res) {
  const { effectiveTo } = z.object({ effectiveTo: z.coerce.date() }).parse(req.body);
  const tariff = await getPrisma().electricityTariff.update({
    where: { id: z.string().min(1).parse(req.params.id) },
    data: { effectiveTo }
  });
  res.json({ tariff });
}

module.exports = {
  login, overview, listProvinces, listMunicipalities, createMunicipality,
  listTariffs, createTariff, closeTariff
};
