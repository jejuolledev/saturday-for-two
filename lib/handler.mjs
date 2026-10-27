// Shared request handler for the hosted function (api/plan.js) and the local server.
// Streams newline-delimited JSON: {"type":"step",...} lines while the agent works, then {"type":"plan",...}.
import { createQloo } from './qloo.mjs';
import { planSaturday, normalizeRequest } from './agent.mjs';
import { createGuard } from './guard.mjs';

const qlooCache = new Map(); // private server-side cache of Qloo responses (allowed by the hackathon FAQ)
const planCache = new Map();
const PLAN_TTL = 6 * 3600 * 1000;
const guard = createGuard();

export async function handlePlan({ body, ip, write: rawWrite, end: rawEnd }) {
  // {"stream": false} returns one JSON line with the final plan (for partners calling it as an API).
  let last = null;
  const quiet = body?.stream === false;
  const write = quiet ? (o) => { if (o.type !== 'step') last = o; } : rawWrite;
  const end = quiet ? () => { rawWrite(last || { type: 'error', error: 'No plan.' }); rawEnd(); } : rawEnd;
  const req = normalizeRequest(body || {});
  if (req.errors.length) { write({ type: 'error', error: req.errors.join(' ') }); return end(); }
  const key = JSON.stringify(req);
  const hit = planCache.get(key);
  if (hit && hit.expires > Date.now()) {
    for (const t of hit.plan.trace || []) write({ type: 'step', ...t, replay: true });
    write({ type: 'plan', plan: { ...hit.plan, fromCache: true } });
    return end();
  }
  const g = guard(ip || 'unknown');
  if (!g.ok) { write({ type: 'error', error: g.reason }); return end(); }
  let qloo;
  try { qloo = createQloo({ cache: qlooCache }); } catch (e) { write({ type: 'error', error: 'Server is missing its Qloo configuration.' }); return end(); }
  try {
    const plan = await planSaturday(qloo, req, { onStep: (s) => write({ type: 'step', ...s }) });
    if (plan.ok) planCache.set(key, { plan, expires: Date.now() + PLAN_TTL });
    write(plan.ok ? { type: 'plan', plan } : { type: 'error', error: plan.error, plan });
  } catch (e) {
    write({ type: 'error', error: 'Something went wrong while planning. Please try again.' });
  }
  end();
}
