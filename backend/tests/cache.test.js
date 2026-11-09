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

test('cached responses do not extend their lifetime past retrievedAt', async () => {
  const key = `cache-expiry:${Date.now()}:${Math.random()}`;
  let loads = 0;
  const ttlMs = 60 * 60 * 1000;

  await cached(key, ttlMs, async () => {
    loads += 1;
    return { retrievedAt: new Date(Date.now() - 2 * ttlMs).toISOString() };
  });
  await cached(key, ttlMs, async () => {
    loads += 1;
    return { retrievedAt: new Date().toISOString() };
  });

  assert.equal(loads, 2);
});
