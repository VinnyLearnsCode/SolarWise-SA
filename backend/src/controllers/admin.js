const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { getPrisma } = require('../utils/prisma');
const municipalityIndex = require('../../../frontend/data/solar-map/municipality-index.json');

async function login(req, res) {
  const input = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(200) }).parse(req.body);
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return res.status(503).json({ error: { code: 'AUTH_NOT_CONFIGURED', message: 'Administrator authentication is not configured securely.' } });
  }
  const admin = await getPrisma().administrator.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!admin || !(await bcrypt.compare(input.password, admin.passwordHash))) {
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
  }
  const token = jwt.sign({
    sub: admin.id,
    role: admin.role,
    authVersion: admin.authVersion
  }, process.env.JWT_SECRET, { expiresIn: '8h', issuer: 'solarwise-sa' });
  res.json({ token, email: admin.email, expiresIn: 28800 });
}

async function updateCredentials(req, res) {
  const input = z.object({
    currentPassword: z.string().min(1).max(200),
    newEmail: z.string().trim().email().max(254).optional(),
    newPassword: z.string().min(12).max(200).optional()
  }).refine((value) => value.newEmail || value.newPassword, {
    message: 'Enter a new email address, a new password, or both.'
  }).parse(req.body);

  const db = getPrisma();
  const administrator = await db.administrator.findUnique({ where: { id: req.admin.sub } });
  if (!administrator || !(await bcrypt.compare(input.currentPassword, administrator.passwordHash))) {
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' } });
  }

  const data = {
    authVersion: { increment: 1 },
    ...(input.newEmail ? { email: input.newEmail.toLowerCase() } : {}),
    ...(input.newPassword ? { passwordHash: await bcrypt.hash(input.newPassword, 12) } : {})
  };
  const updated = await db.administrator.update({
    where: { id: administrator.id },
    data,
    select: { id: true, email: true, role: true, authVersion: true }
  });
  const token = jwt.sign({
    sub: updated.id,
    role: updated.role,
    authVersion: updated.authVersion
  }, process.env.JWT_SECRET, { expiresIn: '8h', issuer: 'solarwise-sa' });
  res.json({ token, email: updated.email, expiresIn: 28800 });
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
    fixedMonthlyCharge: z.number().min(0).nullable().optional(),
    fixedCharges: fixedChargesSchema.optional(),
    energyChargePerKwh: z.number().min(0).nullable().optional(),
    energyBlocks: energyBlocksSchema.optional(),
    pricesIncludeVat: z.boolean().nullable().optional(),
    timeOfUseRates: z.record(z.string(), z.unknown()).optional(),
    feedInRatePerKwh: z.number().min(0).optional(),
    sourceUrl: z.string().url().max(500).refine((value) => new URL(value).protocol === 'https:', 'Source URL must use HTTPS.'),
    lastVerifiedAt: z.coerce.date()
  }).refine((value) => Boolean(value.energyBlocks) !== Number.isFinite(value.energyChargePerKwh), {
    message: 'Provide either a flat energy rate or an inclining-block schedule, but not both.',
    path: ['energyBlocks']
  }).parse(req.body);
  const tariff = await getPrisma().electricityTariff.create({ data: input });
  res.status(201).json({ tariff });
}

async function importTariffs(req, res) {
  const { csv } = z.object({ csv: z.string().min(1).max(256 * 1024) }).parse(req.body);
  res.json(await importTariffCsv(csv));
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
  login, updateCredentials, overview, listProvinces, listMunicipalities, createMunicipality,
  listTariffs, createTariff, importTariffs, closeTariff, parseTariffCsv, importTariffCsv
};

const tariffCsvColumns = [
  'municipality', 'province', 'name', 'customerCategory', 'effectiveFrom',
  'lastVerifiedAt', 'fixedMonthlyCharge', 'energyChargePerKwh', 'sourceUrl',
  'feedInRatePerKwh', 'timeOfUseRates', 'energyBlocks', 'pricesIncludeVat', 'fixedCharges'
];
const requiredTariffCsvColumns = [
  'municipality', 'province', 'name', 'customerCategory', 'effectiveFrom',
  'lastVerifiedAt', 'sourceUrl'
];

function parseTariffCsv(csv) {
  const rows = parseCsvRows(csv);
  if (!rows.length) throw tariffCsvError('The CSV file is empty.');
  const headers = rows.shift().map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, '') : header).trim());
  if (new Set(headers).size !== headers.length) throw tariffCsvError('The CSV contains duplicate column names.');
  const missingColumns = requiredTariffCsvColumns.filter((column) => !headers.includes(column));
  const unknownColumns = headers.filter((column) => !tariffCsvColumns.includes(column));
  if (missingColumns.length || unknownColumns.length) {
    const problems = [
      ...(missingColumns.length ? [`Missing columns: ${missingColumns.join(', ')}`] : []),
      ...(unknownColumns.length ? [`Unknown columns: ${unknownColumns.join(', ')}`] : [])
    ];
    throw tariffCsvError(`${problems.join('. ')}.`);
  }
  const records = [];
  for (const [index, row] of rows.entries()) {
    if (row.every((value) => !value.trim())) continue;
    const line = index + 2;
    if (row.length !== headers.length) throw tariffCsvError(`Row ${line} has ${row.length} values; expected ${headers.length}.`);
    const values = Object.fromEntries(headers.map((header, column) => [header, row[column].trim()]));
    if (headers.slice(2).every((header) => !values[header])) continue;
    const rowData = {
      municipality: values.municipality,
      province: values.province,
      name: values.name,
      customerCategory: values.customerCategory,
      effectiveFrom: parseCsvDate(values.effectiveFrom, 'effectiveFrom', line),
      lastVerifiedAt: parseCsvDate(values.lastVerifiedAt, 'lastVerifiedAt', line),
      sourceUrl: values.sourceUrl,
      ...(values.fixedMonthlyCharge ? { fixedMonthlyCharge: parseCsvNumber(values.fixedMonthlyCharge, 'fixedMonthlyCharge', line) } : {}),
      ...(values.energyChargePerKwh ? { energyChargePerKwh: parseCsvNumber(values.energyChargePerKwh, 'energyChargePerKwh', line) } : {}),
      ...(values.feedInRatePerKwh ? { feedInRatePerKwh: parseCsvNumber(values.feedInRatePerKwh, 'feedInRatePerKwh', line) } : {}),
      ...(values.timeOfUseRates ? { timeOfUseRates: parseTimeOfUseRates(values.timeOfUseRates, line) } : {}),
      ...(values.energyBlocks ? { energyBlocks: parseEnergyBlocks(values.energyBlocks, line) } : {}),
      ...(values.pricesIncludeVat ? { pricesIncludeVat: parseVatStatus(values.pricesIncludeVat, line) } : {}),
      ...(values.fixedCharges ? { fixedCharges: parseFixedCharges(values.fixedCharges, line) } : {})
    };
    const result = z.object({
      municipality: z.string().trim().min(2).max(120),
      province: z.string().trim().min(2).max(80),
      name: z.string().trim().min(1).max(120),
      customerCategory: z.string().trim().min(1).max(80),
      effectiveFrom: z.date(),
      lastVerifiedAt: z.date(),
      fixedMonthlyCharge: z.number().min(0).max(100000000).optional(),
      fixedCharges: fixedChargesSchema.optional(),
      energyChargePerKwh: z.number().min(0).max(10000).optional(),
      energyBlocks: energyBlocksSchema.optional(),
      pricesIncludeVat: z.boolean().optional(),
      sourceUrl: z.string().url().max(500).refine((value) => new URL(value).protocol === 'https:', 'Source URL must use HTTPS.'),
      feedInRatePerKwh: z.number().min(0).max(10000).optional(),
      timeOfUseRates: z.record(z.string(), z.unknown()).optional()
    }).refine((value) => Boolean(value.energyBlocks) !== Number.isFinite(value.energyChargePerKwh), {
      message: 'provide either energyChargePerKwh or energyBlocks, but not both',
      path: ['energyBlocks']
    }).safeParse(rowData);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw tariffCsvError(`Row ${line}: ${issue.path.join('.') || 'record'} ${issue.message}`);
    }
    records.push({ ...result.data, sourceLine: line });
    if (records.length > 500) throw tariffCsvError('A single CSV import cannot exceed 500 tariff records.');
  }
  if (!records.length) {
    throw tariffCsvError('No tariff records found. The worksheet lists municipality names only; fill in at least one tariff row with its name, customer category, effective date, verification date, either a flat energy rate or energy-block schedule, and official source URL.');
  }

  const seen = new Set();
  for (const record of records) {
    const key = tariffImportKey(record.municipality, record.province, record.name, record.customerCategory, record.effectiveFrom);
    if (seen.has(key)) throw tariffCsvError(`Row ${record.sourceLine} duplicates a tariff record elsewhere in the CSV.`);
    seen.add(key);
  }
  return records;
}

async function importTariffCsv(csv, database = getPrisma()) {
  const records = parseTariffCsv(csv);
  const canonicalAreas = new Set(municipalityIndex.map((item) => municipalityKey(item.name, item.province)));
  const invalidAreas = records.filter((record) => !canonicalAreas.has(municipalityKey(record.municipality, record.province)));
  if (invalidAreas.length) {
    const first = invalidAreas[0];
    throw tariffCsvError(`Row ${first.sourceLine}: ${first.municipality} · ${first.province} does not match the map's municipality boundary data.`);
  }

  return database.$transaction(async (transaction) => {
    const provinceNames = [...new Set(records.map((record) => record.province))];
    const provinces = await transaction.province.findMany({ where: { name: { in: provinceNames } } });
    const provincesByName = new Map(provinces.map((province) => [normalizeImportName(province.name), province]));
    const missingProvinces = provinceNames.filter((name) => !provincesByName.has(normalizeImportName(name)));
    if (missingProvinces.length) {
      throw tariffCsvError(`Province records are missing from the database: ${missingProvinces.join(', ')}. Run the database seed before importing tariffs.`);
    }

    const provinceIds = [...new Set(provinces.map((province) => province.id))];
    const existingMunicipalities = await transaction.municipality.findMany({
      where: { provinceId: { in: provinceIds } },
      select: { id: true, name: true, provinceId: true }
    });
    const municipalitiesByKey = new Map(existingMunicipalities.map((municipality) => {
      const province = provinces.find((item) => item.id === municipality.provinceId);
      return [municipalityKey(municipality.name, province.name), municipality];
    }));
    const municipalitiesToCreate = new Map();
    for (const record of records) {
      const key = municipalityKey(record.municipality, record.province);
      if (!municipalitiesByKey.has(key)) {
        const province = provincesByName.get(normalizeImportName(record.province));
        municipalitiesToCreate.set(key, { name: record.municipality, provinceId: province.id });
      }
    }
    let municipalityCreateCount = 0;
    if (municipalitiesToCreate.size) {
      const createResult = await transaction.municipality.createMany({
        data: [...municipalitiesToCreate.values()],
        skipDuplicates: true
      });
      municipalityCreateCount = createResult.count;
    }
    const importedMunicipalities = await transaction.municipality.findMany({
      where: { provinceId: { in: provinceIds } },
      select: { id: true, name: true, provinceId: true }
    });
    const provinceById = new Map(provinces.map((province) => [province.id, province]));
    for (const municipality of importedMunicipalities) {
      const province = provinceById.get(municipality.provinceId);
      municipalitiesByKey.set(municipalityKey(municipality.name, province.name), municipality);
    }

    const municipalityIds = records.map((record) => {
      const municipality = municipalitiesByKey.get(municipalityKey(record.municipality, record.province));
      if (!municipality) throw tariffCsvError(`Row ${record.sourceLine}: the municipality could not be matched after import.`);
      return municipality.id;
    });
    const existingTariffs = await transaction.electricityTariff.findMany({
      where: { municipalityId: { in: [...new Set(municipalityIds)] } },
      select: {
        municipalityId: true, name: true, customerCategory: true, effectiveFrom: true,
        lastVerifiedAt: true, fixedMonthlyCharge: true, energyChargePerKwh: true,
          energyBlocks: true, pricesIncludeVat: true, fixedCharges: true,
          sourceUrl: true, feedInRatePerKwh: true, timeOfUseRates: true
      }
    });
    const municipalitiesById = new Map(importedMunicipalities.map((municipality) => [
      municipality.id,
      { ...municipality, province: provinceById.get(municipality.provinceId) }
    ]));
    const existingTariffsByKey = new Map(existingTariffs.map((tariff) => {
      const municipality = municipalitiesById.get(tariff.municipalityId);
      return [tariffImportKey(
        municipality.name,
        municipality.province.name,
        tariff.name,
        tariff.customerCategory,
        tariff.effectiveFrom
      ), tariff];
    }));
    const toCreate = [];
    let skippedDuplicates = 0;
    records.forEach((record) => {
      const municipality = municipalitiesByKey.get(municipalityKey(record.municipality, record.province));
      const key = tariffImportKey(record.municipality, record.province, record.name, record.customerCategory, record.effectiveFrom);
      const existing = existingTariffsByKey.get(key);
      if (existing) {
        if (!sameTariffValues(existing, record)) {
          throw tariffCsvError(`Row ${record.sourceLine}: this tariff name, category, municipality, and effective date already exist with different values. Resolve the existing record before importing.`);
        }
        skippedDuplicates += 1;
      } else {
        toCreate.push({
          municipalityId: municipality.id,
          name: record.name,
          customerCategory: record.customerCategory,
          effectiveFrom: record.effectiveFrom,
          lastVerifiedAt: record.lastVerifiedAt,
          fixedMonthlyCharge: record.fixedMonthlyCharge,
          fixedCharges: record.fixedCharges,
          energyChargePerKwh: record.energyChargePerKwh,
          energyBlocks: record.energyBlocks,
          pricesIncludeVat: record.pricesIncludeVat,
          sourceUrl: record.sourceUrl,
          ...(record.feedInRatePerKwh === undefined ? {} : { feedInRatePerKwh: record.feedInRatePerKwh }),
          ...(record.timeOfUseRates === undefined ? {} : { timeOfUseRates: record.timeOfUseRates })
        });
      }
    });
    const result = toCreate.length
      ? await transaction.electricityTariff.createMany({ data: toCreate })
      : { count: 0 };
    return {
      imported: result.count,
      skippedDuplicates,
      municipalitiesCreated: municipalityCreateCount
    };
  });
}

function parseCsvRows(csv) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"') {
        if (csv[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (closedQuote && character !== ',' && character !== '\r' && character !== '\n' && !/\s/.test(character)) {
      throw tariffCsvError('The CSV contains invalid text after a quoted value.');
    }
    if (character === '"') {
      if (field.length) throw tariffCsvError('The CSV contains a quote inside an unquoted value.');
      quoted = true;
      closedQuote = false;
    } else if (character === ',') {
      row.push(field);
      field = '';
      closedQuote = false;
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && csv[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = '';
      closedQuote = false;
    } else if (!closedQuote) {
      field += character;
    }
  }
  if (quoted) throw tariffCsvError('The CSV contains an unclosed quoted value.');
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function parseCsvDate(value, field, line) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw tariffCsvError(`Row ${line}: ${field} must use YYYY-MM-DD format.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw tariffCsvError(`Row ${line}: ${field} is not a valid date.`);
  }
  return date;
}

function parseCsvNumber(value, field, line) {
  if (!value || !Number.isFinite(Number(value))) throw tariffCsvError(`Row ${line}: ${field} must be a number.`);
  return Number(value);
}

function parseTimeOfUseRates(value, line) {
  let rates;
  try {
    rates = JSON.parse(value);
  } catch {
    throw tariffCsvError(`Row ${line}: timeOfUseRates must contain valid JSON.`);
  }
  if (!rates || Array.isArray(rates) || typeof rates !== 'object') {
    throw tariffCsvError(`Row ${line}: timeOfUseRates must be a JSON object.`);
  }
  return rates;
}

const energyBlocksSchema = z.array(z.object({
  upToKwh: z.number().int().positive().nullable(),
  ratePerKwh: z.number().min(0).max(10000)
})).min(1).refine((blocks) => {
  if (blocks[blocks.length - 1].upToKwh !== null) return false;
  return blocks.slice(0, -1).every((block, index) => (
    block.upToKwh !== null
    && (blocks[index + 1].upToKwh === null || block.upToKwh < blocks[index + 1].upToKwh)
  ));
}, 'must have strictly increasing consumption limits and an unlimited final block');

const fixedChargesSchema = z.array(z.object({
  name: z.string().trim().min(1).max(120),
  amount: z.number().min(0).max(100000000),
  frequency: z.enum(['perMonth', 'perDay', 'once'])
})).min(1);

function parseFixedCharges(value, line) {
  let charges;
  try {
    charges = JSON.parse(value);
  } catch {
    throw tariffCsvError(`Row ${line}: fixedCharges must contain valid JSON.`);
  }
  const result = fixedChargesSchema.safeParse(charges);
  if (!result.success) {
    throw tariffCsvError(`Row ${line}: fixedCharges ${result.error.issues[0].message}.`);
  }
  return result.data;
}

function parseEnergyBlocks(value, line) {
  let blocks;
  try {
    blocks = JSON.parse(value);
  } catch {
    throw tariffCsvError(`Row ${line}: energyBlocks must contain valid JSON.`);
  }
  const result = energyBlocksSchema.safeParse(blocks);
  if (!result.success) {
    throw tariffCsvError(`Row ${line}: energyBlocks ${result.error.issues[0].message}.`);
  }
  return result.data;
}

function parseVatStatus(value, line) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw tariffCsvError(`Row ${line}: pricesIncludeVat must be true or false.`);
}

function tariffImportKey(municipality, province, name, category, effectiveFrom) {
  return [
    municipalityKey(municipality, province),
    normalizeImportName(name),
    normalizeImportName(category),
    new Date(effectiveFrom).toISOString().slice(0, 10)
  ].join('|');
}

function municipalityKey(name, province) {
  return `${normalizeImportName(name)}|${normalizeImportName(province)}`;
}

function normalizeImportName(value) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-ZA');
}

function sameTariffValues(existing, record) {
  return (existing.fixedMonthlyCharge == null ? null : Number(existing.fixedMonthlyCharge)) === (record.fixedMonthlyCharge ?? null)
    && (existing.energyChargePerKwh == null ? null : Number(existing.energyChargePerKwh)) === (record.energyChargePerKwh ?? null)
    && (existing.feedInRatePerKwh == null ? null : Number(existing.feedInRatePerKwh)) === (record.feedInRatePerKwh ?? null)
    && new Date(existing.lastVerifiedAt).toISOString().slice(0, 10) === record.lastVerifiedAt.toISOString().slice(0, 10)
    && existing.sourceUrl === record.sourceUrl
    && (existing.pricesIncludeVat ?? null) === (record.pricesIncludeVat ?? null)
    && JSON.stringify(sortJson(existing.timeOfUseRates ?? null)) === JSON.stringify(sortJson(record.timeOfUseRates ?? null))
    && JSON.stringify(sortJson(existing.fixedCharges ?? null)) === JSON.stringify(sortJson(record.fixedCharges ?? null))
    && JSON.stringify(sortJson(existing.energyBlocks ?? null)) === JSON.stringify(sortJson(record.energyBlocks ?? null));
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
  }
  return value;
}

function tariffCsvError(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = 'INVALID_TARIFF_CSV';
  return error;
}
