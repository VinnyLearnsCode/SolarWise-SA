const WEATHER_RETENTION_DAYS = 7;

function deleteExpiredWeatherObservations(prisma, now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('now must be a valid Date.');
  }

  const cutoff = new Date(now.getTime() - WEATHER_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return prisma.weatherObservation.deleteMany({
    where: {
      sourceName: { in: ['Open-Meteo', 'MET Norway Locationforecast'] },
      observedAt: { lt: cutoff }
    }
  });
}

module.exports = { deleteExpiredWeatherObservations, WEATHER_RETENTION_DAYS };
