const MAX_CACHE_ENTRIES = 250;
const cache = new Map();
const inFlight = new Map();

async function cached(key, ttlMs, loader) {
  const item = cache.get(key);
  if (item && item.expires > Date.now()) {
    return { ...item.value, cached: true };
  }

  if (inFlight.has(key)) {
    const value = await inFlight.get(key);
    return { ...value, cached: true };
  }

  const pending = loadAndCache(key, ttlMs, loader, item);
  inFlight.set(key, pending);
  try {
    return await pending;
  } finally {
    inFlight.delete(key);
  }
}

async function loadAndCache(key, ttlMs, loader, previous) {
  try {
    const value = await loader();
    pruneExpired();
    if (cache.size >= MAX_CACHE_ENTRIES && !cache.has(key)) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(key, { value, expires: Date.now() + ttlMs });
    return { ...value, cached: false };
  } catch (error) {
    if (previous) {
      return {
        ...previous.value,
        cached: true,
        stale: true,
        cacheExpiredAt: new Date(previous.expires).toISOString()
      };
    }
    throw error;
  }
}

function pruneExpired() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expires <= now) cache.delete(key);
  }
}

module.exports = { cached };
