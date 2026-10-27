// Pluggable language-model client: any OpenAI-compatible /chat/completions endpoint.
//   LLM_BASE_URL  e.g. https://api.tokenfactory.nebius.com/v1  or  http://127.0.0.1:8088/v1 (Meterless Nightshift)
//   LLM_API_KEY   the provider key (for Nightshift on this Mac it can stay empty: the runtime token file is read)
//   LLM_MODEL     e.g. nvidia/nemotron-3.5-lightning-30b-a3b
// Swapping provider is one env change. With no LLM_BASE_URL the app runs its rule-based planner and says so.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const isLocal = (url) => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//.test(url + '/');

export function llmConfig(env = process.env) {
  const base = String(env.LLM_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!base) return null;
  let key = String(env.LLM_API_KEY || '').trim();
  if (!key && isLocal(base)) {
    // Meterless Nightshift writes its runtime key to a file on the Mac; read it rather than copying it around.
    const file = env.NIGHTSHIFT_TOKEN_FILE || `${homedir()}/Library/Application Support/ai.meterless.nightshift.m1m4/runtime-token`;
    try { key = readFileSync(file, 'utf8').trim(); } catch {}
  }
  const model = String(env.LLM_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b').trim();
  const provider = env.LLM_LABEL || (isLocal(base) ? (base.includes(':8088') ? 'Meterless Nightshift (this Mac)' : 'local server') : new URL(base).hostname);
  let extra = {};
  try { extra = env.LLM_EXTRA_BODY ? JSON.parse(env.LLM_EXTRA_BODY) : {}; } catch {}
  return { base, key, model, provider, local: isLocal(base), extra };
}

export async function chat(cfg, { messages, tools, maxTokens = 1800, temperature = 0.2, timeoutMs = 25000, fetchImpl = globalThis.fetch }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const headers = { 'content-type': 'application/json' };
    if (cfg.key) headers.authorization = `Bearer ${cfg.key}`;
    if (cfg.local) headers['meterless-app'] = 'saturday-for-two';
    const res = await (cfg.fetchImpl || fetchImpl)(`${cfg.base}/chat/completions`, {
      method: 'POST', headers, signal: ctrl.signal,
      body: JSON.stringify({ model: cfg.model, messages, tools, tool_choice: tools ? 'auto' : undefined, max_tokens: maxTokens, temperature, ...(cfg.extra || {}) }),
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { throw new Error(`model endpoint answered ${res.status} (not JSON)`); }
    if (!res.ok || body.error) throw new Error(`model endpoint: ${body?.error?.message || res.status}`);
    const msg = body.choices?.[0]?.message;
    if (!msg) throw new Error('model endpoint returned no message');
    return { message: msg, usage: body.usage || null, ms: Date.now() - started, routed: body.meterless?.routed_model || body.model || cfg.model };
  } finally {
    clearTimeout(t);
  }
}
