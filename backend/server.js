require('dotenv').config();
const app = require('./app');
const { checkDatabaseConnection, disconnectDatabase } = require('./src/utils/prisma');

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`SolarWise SA listening on port ${port}`);
  checkDatabaseConnection().then((database) => {
    if (database.status === 'connected') {
      console.log('PostgreSQL connection verified.');
    } else {
      console.warn(`Database ${database.status}: ${database.message} Database-backed features may be unavailable.`);
    }
  }).catch((error) => {
    console.error(`Database startup check failed: ${error.message}`);
  });
});

async function shutdown(signal) {
  console.log(`${signal} received; closing SolarWise SA.`);
  server.close(async (error) => {
    try {
      await disconnectDatabase();
    } catch (disconnectError) {
      console.error(`Database disconnect failed: ${disconnectError.message}`);
      process.exitCode = 1;
    }
    if (error) {
      console.error(`HTTP server shutdown failed: ${error.message}`);
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
