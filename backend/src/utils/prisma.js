const { PrismaClient } = require('@prisma/client');

let prisma;
let connectionCheck;

function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
    });
  }
  return prisma;
}

async function checkDatabaseConnection() {
  if (!process.env.DATABASE_URL) {
    return {
      status: 'not_configured',
      code: 'DATABASE_URL_MISSING',
      message: 'Set DATABASE_URL in the root .env file.'
    };
  }

  if (connectionCheck) return connectionCheck;
  connectionCheck = connectAndProbe();
  try {
    return await connectionCheck;
  } finally {
    connectionCheck = null;
  }
}

async function connectAndProbe() {
  try {
    const client = getPrisma();
    await client.$connect();
    await client.$queryRaw`SELECT 1`;
    return { status: 'connected' };
  } catch (error) {
    const code = error.code || error.errorCode || error.name || 'DATABASE_CONNECTION_FAILED';
    console.error(`Database connection check failed (${code}): ${databaseErrorMessage(code)}`);
    return {
      status: 'unavailable',
      code,
      message: databaseErrorMessage(code)
    };
  }
}

function databaseErrorMessage(code) {
  if (code === 'P1000') return 'Database authentication failed. Check the user and password in DATABASE_URL.';
  if (code === 'P1001') return 'PostgreSQL is not reachable. Check the service, host and port in DATABASE_URL.';
  if (code === 'P1003') return 'The configured PostgreSQL database does not exist.';
  if (code === 'P1010') return 'The configured database user does not have permission to access this database.';
  return 'PostgreSQL connection failed. Check DATABASE_URL, the database service, and server logs.';
}

async function disconnectDatabase() {
  if (!prisma) return;
  await prisma.$disconnect();
  prisma = null;
}

module.exports = { getPrisma, checkDatabaseConnection, disconnectDatabase };
