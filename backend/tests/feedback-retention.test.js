const test = require('node:test');
const assert = require('node:assert/strict');
const { deleteExpiredFeedback, FEEDBACK_RETENTION_DAYS } = require('../src/services/feedback-retention');

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
});
