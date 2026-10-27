// Small Qloo client. The API key is read from the environment on the server only.
// It is never returned to the browser, never logged, and never written to the call trace.

const DEFAULT_TIMEOUT_MS = 9000;

// The hackathon key allows 10 requests per second (x-second-ratelimit-limit: 10).
// Stay under it: at most `perSecond` request starts in any rolling second.
export function createLimiter(perSecond = 8) {
  const starts = [];
  let chain = Promise.resolve();
  return function slot() {
    const next = chain.then(async () => {
      for (;;) {
        const now = Date.now();
        while (starts.length && now - starts[0] >= 1000) starts.shift();
        if (starts.length < perSecond) { starts.push(now); return; }
        await new Promise((r) => setTimeout(r, 1000 - (now - starts[0]) + 5));
      }
    });
    chain = next.catch(() => {});
    return next;
  };
}

const sharedLimiter = createLimiter(8);

export function createQloo({ baseUrl = process.env.QLOO_API_URL, apiKey = process.env.QLOO_API_KEY, fetchImpl = globalThis.fetch, cache = new Map(), cacheTtlMs = 6 * 3600 * 1000, limiter = sharedLimiter } = {}) {
  if (!baseUrl || !apiKey) throw new Error('QLOO_API_URL and QLOO_API_KEY must be set (see .env.example)');
  const base = baseUrl.replace(/\/+$/, '');
  const calls = [];

  async function get(path, params = {}, note = '') {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      qs.set(k, String(v));
    }
    const rel = `${path}?${qs.toString()}`;
    const started = Date.now();
    const hit = cache.get(rel);
    if (hit && hit.expires > started) {
      calls.push({ path, params: { ...params }, note, ms: 0, cached: true, ok: true });
      return hit.body;
    }
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
      await limiter();
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
      try {
        const res = await fetchImpl(`${base}${rel}`, { headers: { 'X-Api-Key': apiKey, accept: 'application/json' }, signal: ctrl.signal });
        clearTimeout(t);
        const text = await res.text();
        let body;
        try { body = JSON.parse(text); } catch { body = { errors: [{ message: `non-JSON response (${res.status})` }] }; }
        if ((res.status === 429 || res.status >= 500) && attempt < 3) { await new Promise(r => setTimeout(r, 1100 * (attempt + 1))); lastErr = new Error(`HTTP ${res.status}`); continue; }
        const ok = res.ok && !body.errors;
        calls.push({ path, params: { ...params }, note, ms: Date.now() - started, cached: false, ok, status: res.status });
        if (ok) cache.set(rel, { body, expires: Date.now() + cacheTtlMs });
        return body;
      } catch (e) {
        clearTimeout(t);
        lastErr = e;
      }
    }
    calls.push({ path, params: { ...params }, note, ms: Date.now() - started, cached: false, ok: false, status: 0 });
    return { errors: [{ message: `request failed: ${lastErr?.message || 'unknown'}` }] };
  }

  return {
    calls,
    search: (query, take = 6, note) => get('/search', { query, take }, note),
    insights: (params, note) => get('/v2/insights', params, note),
  };
}
