const test = require('node:test');
const assert = require('node:assert/strict');
const { deleteExpiredFeedback, FEEDBACK_RETENTION_DAYS } = require('../src/services/feedback-retention');
const { deleteExpiredWeatherObservations, WEATHER_RETENTION_DAYS } = require('../src/services/weather-retention');

test('feedback cleanup deletes records older than the 365-day retention cutoff', async () => {
  const now = new Date('2026-11-09T12:00:00.000Z');
  let query;
  const prisma = {
    feedback: {
      deleteMany: async (args) => {
        query = args;
        return { count: 2 };
      }
    }
  };

  const result = await deleteExpiredFeedback(prisma, now);

  assert.equal(FEEDBACK_RETENTION_DAYS, 365);
  assert.deepEqual(query, {
    where: {
      createdAt: { lt: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) }
    }
  });
  assert.deepEqual(result, { count: 2 });
});

test('feedback cleanup rejects an invalid reference date', async () => {
  const prisma = { feedback: { deleteMany: async () => ({ count: 0 }) } };
  assert.throws(() => deleteExpiredFeedback(prisma, new Date('invalid')), {
    name: 'TypeError',
    message: 'now must be a valid Date.'
  });

  test('weather cleanup deletes Open-Meteo records older than seven days', async () => {
    const now = new Date('2026-11-09T12:00:00.000Z');
    let query;
    const prisma = {
      weatherObservation: {
        deleteMany: async (args) => {
          query = args;
          return { count: 3 };
        }
      }
    };

    const result = await deleteExpiredWeatherObservations(prisma, now);

    assert.equal(WEATHER_RETENTION_DAYS, 7);
    assert.deepEqual(query, {
      where: {
        sourceName: { in: ['Open-Meteo', 'MET Norway Locationforecast'] },
        observedAt: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }
      }
    });
    assert.deepEqual(result, { count: 3 });
  });
});
