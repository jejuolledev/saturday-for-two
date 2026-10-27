// Offline tests of the agent loop: a fake Qloo and a scripted fake model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSaturday, normalizeRequest } from '../lib/agent.mjs';
import { checkClaims } from '../lib/ground.mjs';
import { genreIdsFromTags, genreWordsFromTags, hasAlcoholTag } from '../lib/engine.mjs';

// Fake Qloo. Person A's lists are items 0..199, B's 100..299 (overlap 100..199) — except artists, where they never
// overlap, and A's artist list is not in A's genre unless filter.tags asks for the Trot genre.
function fakeQloo() {
  const calls = [];
  const aff = (who, n) => 1 - Math.abs(n - (who === 'A' ? 0 : 150)) / 1000;
  const who = (sig) => (String(sig).includes('E_Grandma') && String(sig).includes('E_Kid') ? 'AB' : String(sig).includes('E_Grandma') ? 'A' : 'B');
  const ent = (type, n, w) => ({ entity_id: `${type}_${n}`, name: `${type} item ${n}`, properties: {}, tags: [], query: { affinity: aff(w === 'AB' ? 'A' : w, n) } });
  const get = (path, p) => {
    calls.push({ path, params: p, cached: false, ok: true });
    if (path === '/search') return { results: [{ entity_id: `E_${p.query}`, name: p.query, types: ['urn:entity:artist'], tags: p.query === 'Grandma' ? [{ id: 'urn:tag:genre:trot', type: 'urn:tag:genre', name: 'Trot' }] : [] }] };
    if (path === '/v2/tags') return { results: { tags: [{ id: 'urn:tag:genre:music:trot', name: 'Trot' }] } };
    const type = String(p['filter.type']).split(':').pop();
    const w = who(p['signal.interests.entities']);
    const trot = String(p['filter.tags'] || '').includes('genre:music:trot');
    let range;
    if (type === 'artist') range = trot ? [900, 930] : w === 'B' ? [500, 700] : [0, 200];
    else range = w === 'B' ? [100, 300] : [0, 200];
    if (p['filter.results.entities']) {
      const ids = String(p['filter.results.entities']).split(',');
      const out = ids.map((id) => Number(id.split('_').pop())).filter((n) => !trot || (n >= 900 && n < 930));
      return { results: { entities: out.map((n) => ({ ...ent(type, n, w), query: { affinity: aff(w === 'AB' ? 'A' : w, n) } })) } };
    }
    const page = Number(p.page || 1), take = Number(p.take || 20);
    const all = [];
    for (let n = range[0]; n < range[1]; n++) all.push(ent(type, n, w));
    all.sort((x, y) => y.query.affinity - x.query.affinity);
    return { results: { entities: all.slice((page - 1) * take, page * take) } };
  };
  return { calls, search: async (query, take) => get('/search', { query, take }), insights: async (p) => get('/v2/insights', p), tags: async (p) => get('/v2/tags', p) };
}

// Scripted model: re-plans music when a check names a genre, chooses the first shared ref or one turn each.
function fakeModel(log) {
  const reply = (calls) => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: null, tool_calls: calls.map((c, i) => ({ id: `c${log.length}_${i}`, type: 'function', function: { name: c[0], arguments: JSON.stringify(c[1]) } })) } }] }), { status: 200 });
  return async (url, opts) => {
    const body = JSON.parse(opts.body);
    log.push(body);
    const msgs = body.messages;
    const user = msgs.find((m) => m.role === 'user').content;
    const lastTool = [...msgs].reverse().find((m) => m.role === 'tool');
    if (user.startsWith('Step 1')) {
      if (!lastTool && /favourite is tagged Trot/.test(user)) return reply([['compare', { part: 'music', genre_a: ['urn:tag:genre:music:trot'], reason: 'Grandma likes trot; her artist list has none.' }]]);
      return reply([['ready', { reason: 'Nothing else to re-plan.' }]]);
    }
    if (user.startsWith('Step 2')) {
      const part = user.match(/choose for "(\w+)"/)[1];
      const src = lastTool && /Updated comparison: /.test(lastTool.content) ? lastTool.content.slice(lastTool.content.indexOf('Updated comparison: ') + 20) : user.slice(user.indexOf('Latest comparison:') + 19, user.lastIndexOf('}') + 1);
      const cmp = JSON.parse(src);
      if (lastTool?.content === 'DONE') return reply([]);
      const rank = (r, k) => r[k].replace('outside top ', '>');
      if (cmp.shared_candidates.length) {
        const c = cmp.shared_candidates[0];
        // First try an invented claim; the check must reject it.
        if (!lastTool && part === 'movie') return reply([['choose', { part, picks: [{ ref: c.ref, kind: 'shared', why: 'Critics at Cannes adored it.' }], reason: 'Best worse rank.' }]]);
        return reply([['choose', { part, picks: [{ ref: c.ref, kind: 'shared', why: `${rank(c, 'Grandma rank')} for Grandma and ${rank(c, 'Kid rank')} for Kid.` }], reason: 'Best worse rank.' }]]);
      }
      const a = cmp.Grandma_top[0], b = cmp.Kid_top[0];
      return reply([['choose', { part, picks: [{ ref: a.ref, kind: 'turnA', why: 'Grandma goes first.' }, { ref: b.ref, kind: 'turnB', why: 'Then Kid.' }], reason: 'Nothing shared.' }]]);
    }
    return reply([['finish', { summary: 'Grandma and Kid share most of the day and take turns in the car.', reason: 'Done.' }]]);
  };
}

const INPUT = normalizeRequest({ a: { label: 'Grandma', likes: ['Grandma'] }, b: { label: 'Kid', likes: ['Kid'] }, city: 'Seoul', audience: 'child' });

test('model loop: re-plans the genre, rejects an invented claim, completes all five parts', async () => {
  const log = [];
  const llm = { base: 'http://fake/v1', key: '', model: 'fake', provider: 'test', local: false, fetchImpl: fakeModel(log) };
  const plan = await planSaturday(fakeQloo(), INPUT, { llm, budgetMs: 20000 });
  assert.equal(plan.ok, true);
  assert.equal(plan.planner.kind, 'model');
  assert.equal(plan.planner.completed, true, JSON.stringify(plan.planner));
  const music = plan.slots.find((s) => s.slot.id === 'music');
  assert.match(music.lists.a, /Trot list/);
  assert.ok(music.replanned, 'music shows the re-plan');
  assert.ok(music.picks.every((p) => p.kind !== 'shared'));
  assert.ok(plan.planner.rejectedWhy >= 1, 'invented claim was rejected');
  const movie = plan.slots.find((s) => s.slot.id === 'movie');
  assert.equal(movie.picks[0].kind, 'shared');
  assert.equal(movie.picks[0].whyBy, 'model');
  assert.ok(!/Cannes/.test(JSON.stringify(plan.slots)));
  assert.equal(plan.summaryBy, 'model');
});

test('rules fallback does the same re-plan without a model and says so', async () => {
  const plan = await planSaturday(fakeQloo(), INPUT, { llm: null });
  assert.equal(plan.planner.kind, 'rules');
  assert.match(plan.slots.find((s) => s.slot.id === 'music').lists.a, /Trot list/);
  assert.ok(plan.slots.every((s) => s.skipped || s.picks.length));
});

test('a dead model endpoint falls back to rules for the parts it did not finish', async () => {
  const llm = { base: 'http://fake/v1', key: '', model: 'fake', provider: 'test', local: false, fetchImpl: async () => { throw new Error('connect ECONNREFUSED'); } };
  const plan = await planSaturday(fakeQloo(), INPUT, { llm, budgetMs: 8000 });
  assert.equal(plan.ok, true);
  assert.equal(plan.planner.completed, false);
  assert.equal(plan.planner.ruleParts.length, 5);
  assert.ok(plan.slots.every((s) => s.skipped || s.picks.length));
});

test('checkClaims accepts data, rejects invented names, numbers and refs', () => {
  const allowed = { names: ['Grandma', 'Me', 'Seokchon Lake', '석촌호수', 'Good for kids'], numbers: [2, 3] };
  assert.ok(checkClaims('A lake walk good for kids: #2 for Grandma, #3 for me.', allowed).ok);
  assert.ok(checkClaims('석촌호수 is #2 for Grandma.', allowed).ok);
  assert.equal(checkClaims('Grandma will love Mamma Mia.', allowed).ok, false);
  assert.equal(checkClaims('It is #7 for Grandma.', allowed).ok, false);
  assert.equal(checkClaims('Go to 롯데월드 after.', allowed).ok, false);
  assert.equal(checkClaims('m1 is #2 for Grandma.', allowed).ok, false);
  assert.equal(checkClaims('Tickets cost $20.', allowed).ok, false);
});

test('genre tags: artist genres map to music genres, person categories give words', () => {
  assert.deepEqual(genreIdsFromTags([{ id: 'urn:tag:genre:hard_rock', type: 'urn:tag:genre', name: 'Hard Rock' }]).map((g) => g.id), ['urn:tag:genre:music:hard_rock']);
  assert.deepEqual(genreWordsFromTags([{ name: 'Trot Singers' }, { name: '21st-century South Korean Male Singers' }, { name: 'Pledis Entertainment Artists' }]), ['Trot']);
  assert.ok(hasAlcoholTag(['urn:tag:offerings:place:beer']));
  assert.ok(!hasAlcoholTag(['urn:tag:children:place:good_for_kids']));
});
