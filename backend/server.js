require('dotenv').config();
const app = require('./app');
const { checkDatabaseConnection, disconnectDatabase, getPrisma } = require('./src/utils/prisma');
const { deleteExpiredFeedback } = require('./src/services/feedback-retention');
const { deleteExpiredWeatherObservations } = require('./src/services/weather-retention');

const port = Number(process.env.PORT || 3000);
const feedbackCleanupInterval = setInterval(cleanupExpiredFeedback, 24 * 60 * 60 * 1000);
feedbackCleanupInterval.unref();
const server = app.listen(port, () => {
  console.log(`SolarWise SA listening on port ${port}`);
  checkDatabaseConnection().then(async (database) => {
    if (database.status === 'connected') {
      console.log('PostgreSQL connection verified.');
      await cleanupExpiredFeedback();
    } else {
      console.warn(`Database ${database.status}: ${database.message} Database-backed features may be unavailable.`);
    }
  }).catch((error) => {
    console.error(`Database startup check failed: ${error.message}`);
  });
});

async function cleanupExpiredFeedback() {
  const database = await checkDatabaseConnection();
  if (database.status !== 'connected') return;

  try {
    const prisma = getPrisma();
    const [feedback, weather] = await Promise.all([
      deleteExpiredFeedback(prisma),
      deleteExpiredWeatherObservations(prisma)
    ]);
    if (feedback.count > 0) console.info(`Feedback retention cleanup deleted ${feedback.count} expired record(s).`);
    if (weather.count > 0) console.info(`Weather retention cleanup deleted ${weather.count} expired record(s).`);
  } catch (error) {
    console.error(`Expired data retention cleanup failed: ${error.message}`);
  }
}

async function shutdown(signal) {
  console.log(`${signal} received; closing SolarWise SA.`);
  clearInterval(feedbackCleanupInterval);
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
