// Two planners drive the same Qloo tools (lib/engine.mjs):
//  - runModel: a language model decides which Qloo comparison to run next, re-plans when a check fails,
//    chooses the picks and explains the trade-offs. Every pick is validated against Qloo's results and every
//    sentence it writes is checked (lib/ground.mjs); a rejected sentence is replaced by a template.
//  - runRules: the same steps as fixed rules, used when no model is configured or reachable. Labelled as such.
import { SLOTS, rankText, poss } from './util.mjs';
import { chat } from './llm.mjs';
import { checkClaims } from './ground.mjs';

const PARTS = SLOTS.map((s) => s.id);

// ---------------------------------------------------------------- rules
export async function runRules(engine, { say }) {
  const decisions = [];
  const decide = (text) => { decisions.push({ by: 'rules', text }); say('decide', text); };
  decide('Compare both people\'s own Qloo lists for all five parts of the day.');
  await Promise.all(PARTS.map((p) => engine.compare(p)));
  await rulesReplan(engine, decide);
  for (const p of PARTS) {
    const picks = engine.autoPicks(p);
    engine.setChoice(p, picks, 'template');
  }
  return { decisions, summary: templateSummary(engine), summaryBy: 'template' };
}

async function rulesReplan(engine, decide) {
  const music = engine.last.get('music');
  if (music && !music.skipped) {
    const genre = { a: [], b: [] };
    for (const c of music.checks.filter((c) => c.kind === 'genre_mismatch')) genre[c.who] = c.genres.map((g) => g.id);
    if (genre.a.length || genre.b.length) {
      const why = music.checks.filter((c) => c.kind === 'genre_mismatch').map((c) => c.text).join(' ');
      decide(`Songs: ${why} Re-ask Qloo for that list within the genre.`);
      let cmp = await engine.compare('music', { genre });
      // A genre list Qloo barely fills is no better: drop that genre and keep the person's own list.
      const thin = ['a', 'b'].filter((w) => genre[w].length && (w === 'a' ? cmp.listA : cmp.listB).length < 3);
      if (thin.length && !cmp.skipped) {
        for (const w of thin) genre[w] = [];
        decide(`Songs: Qloo has fewer than 3 artists in that genre for ${thin.map((w) => engine.people[w].label).join(' and ')}; keep their own list.`);
        cmp = await engine.compare('music', { genre });
      }
      cmp.replanReason = why;
    }
  }
  const lunch = engine.last.get('lunch');
  if (lunch && !lunch.skipped && lunch.checks.some((c) => c.kind === 'few_kid_places')) {
    decide('Lunch: too few restaurants tagged good for kids; widen to restaurants with no alcohol tags.');
    const cmp = await engine.compare('lunch', { lunch: 'no_alcohol' });
    cmp.replanReason = 'Too few restaurants tagged good for kids.';
  }
}

export function templateSummary(engine) {
  const A = engine.people.a.label, B = engine.people.b.label;
  const meet = [], turns = [];
  for (const p of PARTS) {
    const ch = engine.chosen.get(p);
    const cmp = engine.last.get(p);
    if (!ch || !cmp || cmp.skipped || !ch.picks.length) continue;
    if (ch.picks.some((x) => x.kind === 'shared')) meet.push(cmp.slot.title.toLowerCase());
    else turns.push(cmp.slot.title.toLowerCase());
  }
  let s = meet.length ? `${A} and ${B} really meet at: ${meet.join(', ')}.` : `${A} and ${B} share nothing in Qloo's lists today.`;
  if (turns.length) s += ` Taking turns for: ${turns.join(', ')}.`;
  return s;
}

// ---------------------------------------------------------------- model
const TOOLS = (A, B) => [
  {
    type: 'function', function: {
      name: 'compare',
      description: `Ask Qloo for ${A}'s and ${B}'s own top lists for one part of the day, score every candidate for each person, and return candidates with both ranks, each person's own top, what one mixed Qloo call would pick, and checks. Call again with options to re-plan.`,
      parameters: {
        type: 'object', properties: {
          part: { type: 'string', enum: PARTS },
          reason: { type: 'string', description: 'One plain sentence shown to the user: why this call.' },
          genre_a: { type: 'array', items: { type: 'string' }, description: `Music only: Qloo genre tag ids to limit ${A}'s artist list to.` },
          genre_b: { type: 'array', items: { type: 'string' }, description: `Music only: Qloo genre tag ids to limit ${B}'s artist list to.` },
          lunch_filter: { type: 'string', enum: ['kids', 'no_alcohol'], description: 'Lunch with a child: "kids" = restaurants Qloo tags good for kids with no alcohol tags (default); "no_alcohol" = any restaurant with no alcohol tags.' },
        }, required: ['part', 'reason'],
      },
    },
  },
  {
    type: 'function', function: {
      name: 'find_genre_tag',
      description: 'Find Qloo music genre tag ids by word (e.g. "trot", "jazz").',
      parameters: { type: 'object', properties: { word: { type: 'string' }, reason: { type: 'string' } }, required: ['word', 'reason'] },
    },
  },
  {
    type: 'function', function: {
      name: 'choose',
      description: `Choose the picks for one part of the day from the latest compare result, by ref. kind: "shared" (in both lists), "turnA" (${A}'s turn) or "turnB" (${B}'s turn). Each pick needs "why": one or two short plain sentences naming the trade-off, using only names and ranks from the compare result.`,
      parameters: {
        type: 'object', properties: {
          part: { type: 'string', enum: PARTS },
          picks: { type: 'array', items: { type: 'object', properties: { ref: { type: 'string' }, kind: { type: 'string', enum: ['shared', 'turnA', 'turnB'] }, why: { type: 'string' } }, required: ['ref', 'kind', 'why'] } },
          reason: { type: 'string' },
        }, required: ['part', 'picks', 'reason'],
      },
    },
  },
  {
    type: 'function', function: {
      name: 'finish',
      description: 'Finish with two or three plain sentences about the whole day: where the two really meet, and whose turn it is when. Only names from your choices.',
      parameters: { type: 'object', properties: { summary: { type: 'string' }, reason: { type: 'string' } }, required: ['summary'] },
    },
  },
];

function systemPrompt(engine) {
  const A = engine.people.a.label, B = engine.people.b.label;
  return [
    `You are the planning agent of "Saturday for Two". ${A} and ${B} have very different tastes and spend one Saturday together.`,
    'Plan five parts of the day: morning (outing), lunch, movie, music (songs for the car, up to 3 artists), evening (one TV episode before bed).',
    'You only know what Qloo returns through your tools. Never name a place, film, artist or show that is not in a tool result. Never invent facts (prices, distances, opening hours, lyrics).',
    'Work like this:',
    '1. You work in three steps (re-plan, choose, finish); each message tells you which step you are in.',
    `2. Read each result's "checks". If a check says a favourite's genre is missing from a person's artist list, call find_genre_tag if you need an id, then compare music again with genre_a or genre_b for that person. If lunch has too few kid-friendly restaurants, compare lunch again with lunch_filter "no_alcohol". Re-plan at most twice per part.`,
    `3. Call choose for every part. Prefer a shared candidate (in both lists) whose worse rank is best; you may take another shared candidate if its tags suit these two people better, and say why. If nothing is shared, give each person a turn (turnA = ${A}, turnB = ${B}): from that person's own top, the one the other person ranks best. Music may have up to 3 picks.`,
    `4. "why" for each pick: one or two short sentences a grandparent would understand, in this order: what it is (use its Qloo tags or description words, lowercase), then the trade-off with both ranks. Examples: "A lakeside park Qloo tags good for kids: #2 for ${A}, #3 for ${B}, so nobody gives anything up." / "Nothing overlaps in songs, so take turns: ${A} gets her #1 first, then ${B} gets his." Use only names, tags and ranks from the tool results; ranks like #12. Never write a ref like m1. No praise words like perfect or great.`,
    '5. Call finish with 2-3 sentences: where they really meet, and whose turn it is when.',
    'Every tool call needs a short "reason" (one plain sentence) that the user sees. Do not write anything outside tool calls.',
  ].join('\n');
}

function brief(engine) {
  const who = (k) => ({ label: engine.people[k].label, age: engine.people[k].age || 'not given', favourites: engine.fav[k].map((f) => ({ name: f.name, type: f.type, qloo_tags: (f.tags || []).slice(0, 8).map((t) => t.name) })) });
  return JSON.stringify({ A: who('a'), B: who('b'), city: engine.city || null, coming_along: engine.audience });
}

// What a "why" sentence may mention for one part of the day.
function allowedFor(engine, part) {
  const cmp = engine.last.get(part);
  const names = [engine.people.a.label, engine.people.b.label, ...engine.fav.a.map((f) => f.name), ...engine.fav.b.map((f) => f.name), ...[...engine.fav.a, ...engine.fav.b].map((f) => f.phrase)];
  const numbers = [10, 3, 2, 1];
  if (cmp && !cmp.skipped) {
    for (const [id, e] of cmp.pool) {
      names.push(e.name, ...(e.tags || []).map((t) => t.name));
      // Capitalised words in Qloo's own description may be repeated (e.g. "Han River").
      for (const m of String(e.desc || '').matchAll(/\p{Lu}[\p{L}'-]*(?:\s+\p{Lu}[\p{L}'-]*)*/gu)) names.push(m[0]);
    }
    for (const x of cmp.scored) numbers.push(x.ra, x.rb);
    numbers.push(cmp.depth, cmp.overlap.length, cmp.pool.size);
    if (cmp.naive) names.push(cmp.naive.name);
    names.push(...cmp.checks.flatMap((c) => (c.genres || []).map((g) => g.name)));
    names.push(cmp.listNames.a, cmp.listNames.b, cmp.slot.title, engine.city || '');
  }
  return { names: names.filter(Boolean), numbers };
}

export async function runModel(engine, cfg, { say, deadline = Date.now() + 60000 }) {
  const A = engine.people.a.label, B = engine.people.b.label;
  const decisions = [];
  const decide = (tool, reason, extra = '') => { const text = `${reason}${extra ? ` (${extra})` : ''}`; decisions.push({ by: 'model', tool, text }); say('decide', text); };
  const stats = { turns: 0, toolCalls: 0, modelMs: 0, rejectedWhy: 0, acceptedWhy: 0, invalidPicks: 0, replans: 0, retries: 0, error: null };
  const tools = TOOLS(A, B);
  const pick = (...names) => tools.filter((t) => names.includes(t.function.name));
  const retries = new Map();
  let summary = null, summaryBy = 'template';

  // One model call with retries (a hosted model sometimes returns an empty answer).
  async function ask(messages, toolset, maxTokens = 3000) {
    let lastErr;
    for (let attempt = 0; attempt < 3 && Date.now() < deadline - 3000; attempt++) {
      try {
        const res = await chat(cfg, { messages, tools: toolset, maxTokens, timeoutMs: Math.max(5000, Math.min(40000, deadline - Date.now())) });
        stats.turns++; stats.modelMs += res.ms;
        if (process.env.DEBUG_LLM) console.error(`[llm] ${res.ms} ms, ${res.usage?.completion_tokens} tokens, ${(res.message.tool_calls || []).map((c) => c.function?.name).join(',')}`);
        return res.message;
      } catch (e) { lastErr = e; stats.retries++; if (process.env.DEBUG_LLM) console.error(`[llm] error: ${e.message}`); }
    }
    throw lastErr || new Error('time budget used up');
  }

  const exec = async (call) => {
    let args = {};
    try { args = JSON.parse(call.function?.arguments || '{}'); } catch { return 'Error: arguments were not valid JSON.'; }
    const name = call.function?.name;
    const reason = String(args.reason || '').slice(0, 200) || name;
    stats.toolCalls++;
    if (name === 'compare') {
      if (!PARTS.includes(args.part)) return `Error: part must be one of ${PARTS.join(', ')}.`;
      stats.replans++; if (stats.replans > 6) return 'Error: too many re-plans; choose from what you have.';
      const opts = { genre: { a: args.genre_a || [], b: args.genre_b || [] }, lunch: args.lunch_filter };
      const extra = [args.genre_a?.length && `${poss(A)} artists limited to ${args.genre_a.map(tagName).join('/')}`, args.genre_b?.length && `${poss(B)} artists limited to ${args.genre_b.map(tagName).join('/')}`, args.lunch_filter && `lunch filter: ${args.lunch_filter.replace('_', ' ')}`].filter(Boolean).join('; ');
      decide('compare', reason, extra);
      const cmp = await engine.compare(args.part, opts);
      cmp.replanReason = reason;
      return JSON.stringify(engine.summary(cmp));
    }
    if (name === 'find_genre_tag') {
      decide('find_genre_tag', reason, `"${String(args.word || '').slice(0, 30)}"`);
      return JSON.stringify((await engine.findGenreTag(args.word)).slice(0, 5));
    }
    if (name === 'ready') return 'DONE';
    if (name === 'choose') {
      const part = args.part;
      const v = engine.validatePicks(part, args.picks);
      if (v.error) {
        stats.invalidPicks++;
        // Choosers run in parallel, so an item can be taken by another part meanwhile: send the fresh comparison.
        return `Error: ${v.error}${/already used/.test(v.error) ? ` Updated comparison: ${JSON.stringify(engine.summary(engine.last.get(part)))}` : ''}`;
      }
      const allowed = allowedFor(engine, part);
      const bad = [];
      for (const p of v.picks) {
        const c = checkClaims(p.why || '', allowed);
        if (!c.ok) bad.push(`why for ${engine.last.get(part).refOf.get(p.id)}: ${c.problems.join('; ')}`);
      }
      const n = (retries.get(part) || 0) + 1;
      retries.set(part, n);
      if (bad.length && n <= 2) { stats.rejectedWhy += bad.length; return `Error: these sentences state things that are not in the Qloo data; rewrite them using only names and ranks from the compare result: ${bad.join(' | ')}`; }
      const picks = v.picks.map((p) => {
        const ok = checkClaims(p.why || '', allowed).ok;
        if (ok) stats.acceptedWhy++; else stats.rejectedWhy++;
        return { ...p, why: ok ? clip(p.why) : null, whyBy: ok ? 'model' : 'template' };
      });
      engine.setChoice(part, picks, 'model');
      const cmp = engine.last.get(part);
      decide('choose', reason, picks.map((p) => `${cmp.pool.get(p.id).name}: ${p.kind === 'shared' ? 'shared' : p.kind === 'turnA' ? `${poss(A)} turn` : `${poss(B)} turn`}`).join('; '));
      return 'DONE';
    }
    if (name === 'finish') {
      const names = [A, B, ...engine.fav.a.map((f) => f.name), ...engine.fav.b.map((f) => f.name)];
      const numbers = [1, 2, 3, 5, 10];
      for (const p of PARTS) {
        const cmp = engine.last.get(p); const ch = engine.chosen.get(p);
        if (!cmp || cmp.skipped || !ch) continue;
        names.push(cmp.slot.title, cmp.listNames.a, cmp.listNames.b, ...ch.picks.map((x) => cmp.pool.get(x.id).name));
        for (const x of ch.picks) numbers.push(x.ra, x.rb);
      }
      if (engine.city) names.push(engine.city);
      const c = checkClaims(args.summary || '', { names, numbers });
      if (!c.ok && (retries.get('finish') || 0) < 1) { retries.set('finish', 1); stats.rejectedWhy++; return `Error: rewrite the summary using only names from the plan: ${c.problems.join('; ')}`; }
      if (c.ok) { summary = clip(args.summary, 420); summaryBy = 'model'; stats.acceptedWhy++; } else stats.rejectedWhy++;
      return 'DONE';
    }
    return `Error: unknown tool ${name}.`;
  };

  // A short tool-calling conversation: run tool calls (in parallel) until one returns DONE.
  async function converse(messages, toolset, maxTurns, stopWhenSettled = false) {
    let nudges = 0;
    for (let t = 0; t < maxTurns; t++) {
      const msg = await ask(messages, toolset);
      const calls = msg.tool_calls || [];
      messages.push({ role: 'assistant', content: msg.content || null, ...(calls.length ? { tool_calls: calls } : {}) });
      if (!calls.length) { if (++nudges > 1) return false; messages.push({ role: 'user', content: `Answer with a tool call (${toolset.map((x) => x.function.name).join(' or ')}).` }); continue; }
      const outs = await Promise.all(calls.map((c) => exec(c).catch((e) => `Error: ${e.message}`)));
      let done = false;
      calls.forEach((c, k) => { messages.push({ role: 'tool', tool_call_id: c.id, content: outs[k] }); if (outs[k] === 'DONE') done = true; });
      if (done) return true;
      // Re-plan step: once every re-asked part comes back without an actionable check, stop without another model turn.
      if (stopWhenSettled && calls.every((c) => c.function?.name === 'compare') && outs.every((o) => !/favourite is tagged|too few|restaurants are tagged as serving/.test(o))) return true;
    }
    return false;
  }

  const sys = systemPrompt(engine);
  // Each phase is guarded on its own: a failed model call in one phase never throws away the others.
  const phase = async (name, fn) => { try { await fn(); } catch (e) { stats.error = stats.error || `${name}: ${e.message}`; } };

  // 1. First pass, fixed and parallel (the slow part is Qloo's rate limit, not the model).
  say('decide', 'First pass: compare both people\'s own Qloo lists for all five parts of the day.');
  decisions.push({ by: 'fixed', tool: 'compare', text: 'First pass: compare all five parts of the day.' });
  await Promise.all(PARTS.map((p) => engine.compare(p).catch(() => null)));

  // 2. The model reads a compact view of all five (counts, checks, each person's top 3) and decides what to re-ask.
  const compact = (p) => {
    const sm = engine.summary(engine.last.get(p), 3);
    if (sm.skipped) return sm;
    return { part: p, in_both_lists: sm.in_both_lists, lists: sm.lists, [`${A}_top3`]: (sm[`${A}_top`] || []).map((r) => r.name), [`${B}_top3`]: (sm[`${B}_top`] || []).map((r) => r.name), checks: sm.checks };
  };
  await phase('re-plan', () => converse([
    { role: 'system', content: sys },
    { role: 'user', content: `Step 1 of 3: re-plan. ${brief(engine)}\nFirst pass, all five parts:\n${JSON.stringify(PARTS.map(compact))}\nIf a check needs it, call compare / find_genre_tag for that part (all in one turn). Otherwise, or when done, call ready.` },
  ], [...pick('compare', 'find_genre_tag'), READY], 4, true));

  // 3. One chooser per part, at most two at a time: each sees only its part's latest comparison.
  const queue = PARTS.filter((p) => engine.last.get(p) && !engine.last.get(p).skipped);
  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      if (Date.now() > deadline - 4000) return;
      const part = p;
      await phase(`choose ${part}`, () => converse([
        { role: 'system', content: sys },
        { role: 'user', content: `Step 2 of 3: choose for "${part}" only. ${brief(engine)}\nLatest comparison:\n${JSON.stringify(engine.summary(engine.last.get(part)))}\nCall choose for "${part}".` },
      ], pick('choose'), 3));
    }
  };
  await Promise.all([worker(), worker()]);

  // 4. One short summary of the day.
  const plan = PARTS.map((p) => { const cmp = engine.last.get(p); const ch = engine.chosen.get(p); if (!cmp || cmp.skipped || !ch) return null; return { part: cmp.slot.title, picks: ch.picks.map((x) => ({ name: cmp.pool.get(x.id).name, kind: x.kind === 'shared' ? 'shared' : x.kind === 'turnA' ? `${A}'s turn` : `${B}'s turn`, [`${A} rank`]: rankText(x.ra, cmp.depth), [`${B} rank`]: rankText(x.rb, cmp.depth) })) }; }).filter(Boolean);
  if (plan.length && Date.now() < deadline - 6000) {
    await phase('finish', () => converse([
      { role: 'system', content: sys },
      { role: 'user', content: `Step 3 of 3: the chosen plan is ${JSON.stringify(plan)}. Call finish with 2-3 plain sentences: where ${A} and ${B} really meet, and whose turn it is when. Only names from this plan.` },
    ], pick('finish'), 2));
  }
  const completed = PARTS.every((p) => engine.chosen.has(p) || engine.last.get(p)?.skipped);
  if (!completed && !stats.error) stats.error = 'model did not choose every part';
  return { decisions, summary, summaryBy, stats, completed };
}

const READY = { type: 'function', function: { name: 'ready', description: 'No (more) re-planning needed.', parameters: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] } } };

const tagName = (id) => String(id).split(':').pop().replace(/_/g, ' ');
const clip = (s, n = 300) => String(s).replace(/\s+/g, ' ').trim().slice(0, n);
