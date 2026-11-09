function setting(name, fallback, min, max) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
}

async function fetchWithRetry(url, options = {}) {
  const attempts = setting(options.retriesEnv || 'OPEN_METEO_RETRIES', options.retries ?? 2, 0, 5) + 1;
  const timeoutMs = setting(options.timeoutEnv || 'OPEN_METEO_TIMEOUT_MS', options.timeoutMs ?? 8000, 1000, 30000);
  const baseDelayMs = setting(options.delayEnv || 'OPEN_METEO_RETRY_DELAY_MS', options.baseDelayMs ?? 300, 0, 5000);
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/json', ...options.headers }
      });
      if (!isRetryableStatus(response.status) || attempt === attempts - 1) return response;
      lastError = new Error(`Upstream returned HTTP ${response.status}.`);
      if (response.body) await response.body.cancel().catch(() => {});
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
    }

    if (baseDelayMs > 0) {
      const exponentialDelay = baseDelayMs * (2 ** attempt);
      const jitter = Math.floor(Math.random() * Math.max(1, baseDelayMs / 2));
      await new Promise((resolve) => setTimeout(resolve, exponentialDelay + jitter));
    }
  }

  throw lastError;
}

function isRetryableStatus(status) {
  return status === 408 || (status >= 500 && status !== 429);
}

module.exports = { fetchWithRetry };
