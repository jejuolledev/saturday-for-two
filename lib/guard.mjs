// Best-effort abuse guard for the public demo. In-memory, so it is per server instance.
// It protects the shared Qloo quota (50,000 calls a month on the hackathon key).

export function createGuard({ perIp = 6, windowMs = 10 * 60 * 1000, perDay = Number(process.env.PLANS_PER_DAY ?? 200) } = {}) {
  const hits = new Map();
  let day = '';
  let dayCount = 0;
  return function allow(ip, now = Date.now()) {
    const today = new Date(now).toISOString().slice(0, 10);
    if (today !== day) { day = today; dayCount = 0; }
    if (dayCount >= perDay) return { ok: false, reason: 'The demo has used today\'s share of the Qloo quota. Please try again tomorrow, or run it locally (README).' };
    const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (list.length >= perIp) { hits.set(ip, list); return { ok: false, reason: 'Too many plans from your connection in the last 10 minutes. Please wait a little.' }; }
    list.push(now);
    hits.set(ip, list);
    dayCount++;
    return { ok: true };
  };
}
