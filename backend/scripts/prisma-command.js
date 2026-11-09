require('dotenv').config();
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing. Copy .env.example to .env, configure PostgreSQL, then retry.');
  process.exit(1);
}
if (!args.length || !['migrate', 'db'].includes(args[0])) {
  console.error('Usage: node backend/scripts/prisma-command.js migrate <dev|deploy|status> or db <seed>');
  process.exit(2);
}

const prismaArgs = args[0] === 'migrate'
  ? [...args, '--schema', 'backend/prisma/schema.prisma']
  : args;
const result = spawnSync('prisma', prismaArgs, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env
});

if (result.error) {
  console.error(`Could not run Prisma CLI: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error('Prisma command failed. Confirm PostgreSQL is running and accessible using DATABASE_URL.');
  if (args[0] === 'migrate') {
    console.error('For a new local database run "npm run db:migrate". For an existing production database run "npm run db:deploy".');
    console.error('Review any schema-drift or migration error above before retrying; migrations are not applied automatically at app startup.');
  }
  process.exit(result.status || 1);
}
