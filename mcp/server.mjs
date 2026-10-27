// MCP server (stdio) so any MCP-capable agent can use the planner as a tool.
// No dependencies: a minimal JSON-RPC 2.0 loop for initialize / tools/list / tools/call.
// Run: npm run mcp   (needs QLOO_API_URL and QLOO_API_KEY in the environment)
import readline from 'node:readline';
import { createQloo } from '../lib/qloo.mjs';
import { planSaturday, normalizeRequest, AGE_BANDS, rankText, poss } from '../lib/agent.mjs';

const TOOL = {
  name: 'plan_shared_saturday',
  description: 'Plan a Saturday for two people with different tastes using Qloo\'s taste graph. Returns, for each part of the day (outing, lunch, film, songs, an evening show), a pick that sits in BOTH people\'s own Qloo lists with both ranks, or says honestly that nothing overlaps and proposes taking turns.',
  inputSchema: {
    type: 'object',
    properties: {
      a_label: { type: 'string', description: 'Name of the first person, e.g. Grandma' },
      a_likes: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3, description: 'Up to 3 artists, films, shows, games or brands the first person loves' },
      a_age: { type: 'string', enum: AGE_BANDS },
      b_label: { type: 'string' },
      b_likes: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
      b_age: { type: 'string', enum: AGE_BANDS },
      city: { type: 'string', description: 'City for the outing and lunch, e.g. Seoul' },
      audience: { type: 'string', enum: ['child', 'teen', 'adults'], description: 'child = films/shows G or PG and no bars; teen = up to PG-13 / TV-14 and no bars; adults = no limits' },
    },
    required: ['a_likes', 'b_likes'],
  },
};

function summarize(plan) {
  if (!plan.ok) return plan.error;
  const A = plan.people.a.label, B = plan.people.b.label;
  const out = [`Saturday for ${A} & ${B}${plan.city ? ` in ${plan.city}` : ''} (${plan.stats.qlooCalls} Qloo calls):`];
  for (const s of plan.slots) {
    if (s.skipped) { out.push(`- ${s.slot.time} ${s.slot.title}: ${s.skipped}`); continue; }
    for (const p of s.picks) {
      const who = p.kind === 'shared' ? 'shared' : p.kind === 'turnA' ? `${poss(A)} turn` : `${poss(B)} turn`;
      out.push(`- ${s.slot.time} ${s.slot.title} [${who}]: ${p.name}${p.sub ? ` (${p.sub})` : ''} — ${A} ${rankText(p.ra, p.depth)}, ${B} ${rankText(p.rb, p.depth)}`);
    }
  }
  return out.join('\n');
}

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  let req;
  try { req = JSON.parse(line); } catch { return; }
  const { id, method, params } = req;
  if (id === undefined) return; // notification
  try {
    if (method === 'initialize') {
      return send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'saturday-for-two', version: '1.0.0' } } });
    }
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: [TOOL] } });
    if (method === 'tools/call') {
      if (params?.name !== TOOL.name) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Unknown tool' } });
      const x = params.arguments || {};
      const input = normalizeRequest({ a: { label: x.a_label, likes: x.a_likes, age: x.a_age }, b: { label: x.b_label, likes: x.b_likes, age: x.b_age }, city: x.city, audience: x.audience });
      if (input.errors.length) return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: input.errors.join(' ') }], isError: true } });
      const plan = await planSaturday(createQloo(), input);
      const { calls, ...compact } = plan;
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: summarize(plan) }, { type: 'text', text: JSON.stringify(compact) }], isError: !plan.ok } });
    }
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  } catch (e) {
    send({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message } });
  }
});
