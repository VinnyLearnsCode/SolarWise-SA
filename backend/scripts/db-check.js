require('dotenv').config();
const { checkDatabaseConnection, disconnectDatabase } = require('../src/utils/prisma');

async function main() {
  const result = await checkDatabaseConnection();
  if (result.status !== 'connected') {
    console.error(`Database check failed (${result.code}): ${result.message}`);
    process.exitCode = 1;
    return;
  }
  console.log('PostgreSQL connection and SELECT 1 check succeeded.');
}

main()
  .catch((error) => {
    console.error(`Database check failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
