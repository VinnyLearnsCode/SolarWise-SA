const test = require('node:test');
const assert = require('node:assert/strict');
const { cached } = require('../src/integrations/cache');

test('expired external data is marked stale when refresh fails', async () => {
  const key = `test:${Date.now()}:${Math.random()}`;
  await cached(key, 0, async () => ({ source: 'test-source', retrievedAt: '2026-01-01T00:00:00.000Z' }));
  const stale = await cached(key, 60_000, async () => {
    throw new Error('simulated upstream outage');
  });
  assert.equal(stale.source, 'test-source');
  assert.equal(stale.stale, true);
  assert.equal(stale.retrievedAt, '2026-01-01T00:00:00.000Z');
});
