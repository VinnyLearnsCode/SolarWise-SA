const MAX_CACHE_ENTRIES = 250;
const cache = new Map();
const inFlight = new Map();

async function cached(key, ttlMs, loader, maxStaleMs = Infinity) {
  const item = cache.get(key);
  if (item && item.expires > Date.now()) {
    return { ...item.value, cached: true };
  }

  if (inFlight.has(key)) {
    const value = await inFlight.get(key);
    return { ...value, cached: true };
  }

  const pending = loadAndCache(key, ttlMs, loader, item, maxStaleMs);
  inFlight.set(key, pending);
  try {
    return await pending;
  } finally {
    inFlight.delete(key);
  }
}

async function loadAndCache(key, ttlMs, loader, previous, maxStaleMs) {
  try {
    const value = await loader();
    store(key, value, ttlMs, maxStaleMs);
    return { ...value, cached: value.cached === true };
  } catch (error) {
    const dataTimestamp = previous?.value.retrievedAt
      ? new Date(previous.value.retrievedAt).getTime()
      : previous?.storedAt;
    if (previous && Date.now() - dataTimestamp <= maxStaleMs) {
      const staleValue = {
        ...previous.value,
        cached: true,
        stale: true,
        cacheExpiredAt: new Date(previous.expires).toISOString()
      };
      store(key, staleValue, ttlMs, maxStaleMs);
      return staleValue;
    }
    throw error;
  }
}

function store(key, value, ttlMs, maxStaleMs) {
  pruneExpired();
  if (cache.size >= MAX_CACHE_ENTRIES && !cache.has(key)) {
    cache.delete(cache.keys().next().value);
  }
  const now = Date.now();
  const dataTimestamp = value.retrievedAt ? new Date(value.retrievedAt).getTime() : now;
  const maxAge = value.stale ? maxStaleMs : ttlMs;
  const expires = Number.isFinite(dataTimestamp)
    ? Math.min(now + ttlMs, dataTimestamp + maxAge)
    : now + ttlMs;
  cache.set(key, { value, expires, storedAt: now });
}

function pruneExpired() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expires <= now) cache.delete(key);
  }
}

module.exports = { cached };
