const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');

const hasPassword = Boolean(process.env.ADMIN_PASSWORD);

if (!hasPassword) {
  console.log('Administrator bootstrap skipped; set ADMIN_PASSWORD to create the initial administrator.');
  process.exit(0);
}

if (!process.env.ADMIN_EMAIL) {
  console.error('Administrator bootstrap requires ADMIN_EMAIL when ADMIN_PASSWORD is configured.');
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
