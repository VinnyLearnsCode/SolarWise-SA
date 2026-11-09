const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

const hasEmail = Boolean(process.env.ADMIN_EMAIL);
const hasPassword = Boolean(process.env.ADMIN_PASSWORD);

if (!hasEmail && !hasPassword) {
  console.log('Administrator bootstrap skipped; ADMIN_EMAIL and ADMIN_PASSWORD are not configured.');
  process.exit(0);
}

if (!hasEmail || !hasPassword) {
  console.error('Administrator bootstrap requires both ADMIN_EMAIL and ADMIN_PASSWORD.');
  process.exit(1);
}

async function bootstrapAdministrator() {
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.administrator.findFirst({
      select: { id: true }
    });
    if (existing) {
      console.log('Administrator bootstrap skipped; an administrator already exists.');
      return;
    }
  } finally {
    await prisma.$disconnect();
  }

  const result = spawnSync(process.execPath, ['backend/prisma/seed.js'], {
    stdio: 'inherit',
    env: process.env
  });
  if (result.error) {
    throw new Error(`Could not start administrator bootstrap: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
  }
}

bootstrapAdministrator().catch((error) => {
  console.error(`Administrator bootstrap failed: ${error.message}`);
  process.exitCode = 1;
});
