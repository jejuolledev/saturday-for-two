// Measures the planner on fixed pairs, against two baselines:
//  1. one mixed Qloo call (both people's favourites and age bands together, top result)
//  2. the same language model with no Qloo (it names a film, an artist, a show and a lunch place;
//     each name is then looked up in Qloo and placed in both people's own lists)
// and measures the two fixes: a favourite's music genre (e.g. trot) and a child's lunch.
// Writes docs/measurements.md. Raw Qloo results go to measurements-raw/ (git-ignored: Qloo data must not be
// published in a repository).
//   npm run measure                  rules planner + mixed-call baseline + genre + child lunch
//   MEASURE_LLM=1 npm run measure    also the model planner and the LLM-only baseline (needs LLM_BASE_URL)
import { mkdir, writeFile } from 'node:fs/promises';
import { createQloo } from '../lib/qloo.mjs';
import { planSaturday, normalizeRequest, ownRank, entities } from '../lib/agent.mjs';
import { createEngine, hasAlcoholTag, hasKidTag } from '../lib/engine.mjs';
import { llmConfig, chat } from '../lib/llm.mjs';

const PAIRS = [
  { a: { label: 'Grandma', likes: ['Lim Young-woong'], age: '55_and_older' }, b: { label: 'Grandkid', likes: ['Minecraft', 'Pokémon'], age: '24_and_younger' }, city: 'Seoul', audience: 'child' },
  { a: { label: 'Dad', likes: ['Metallica', 'The Godfather'], age: '45_to_54' }, b: { label: 'Daughter', likes: ['Olivia Rodrigo', 'Stranger Things'], age: '24_and_younger' }, city: 'New York', audience: 'teen' },
  { a: { label: 'Roommate 1', likes: ['Radiohead', 'The Grand Budapest Hotel'], age: '30_to_34' }, b: { label: 'Roommate 2', likes: ['Bad Bunny', 'Fast & Furious'], age: '25_to_29' }, city: 'London' },
  { a: { label: 'Grandpa', likes: ['Frank Sinatra', 'Casablanca'], age: '55_and_older' }, b: { label: 'Grandkid', likes: ['Bluey', 'Frozen'], age: '24_and_younger' }, city: 'Chicago', audience: 'child' },
  { a: { label: 'Mom', likes: ['Taylor Swift', 'Gilmore Girls'], age: '35_to_44' }, b: { label: 'Son', likes: ['Fortnite', 'Spider-Man'], age: '24_and_younger' }, city: 'Los Angeles', audience: 'teen' },
  { a: { label: 'Partner 1', likes: ['BTS', 'Squid Game'], age: '25_to_29' }, b: { label: 'Partner 2', likes: ['Pink Floyd', 'Star Wars'], age: '30_to_34' }, city: 'Tokyo' },
  { a: { label: 'Aunt', likes: ['Adele', 'Downton Abbey'], age: '45_to_54' }, b: { label: 'Nephew', likes: ['Travis Scott', 'Call of Duty'], age: '24_and_younger' }, city: 'London' },
  { a: { label: 'Grandma', likes: ['Elvis Presley', 'The Sound of Music'], age: '55_and_older' }, b: { label: 'Grandson', likes: ['MrBeast', 'Spider-Man'], age: '24_and_younger' }, city: 'Paris', audience: 'child' },
];
const withLLM = !!process.env.MEASURE_LLM;
const llm = llmConfig();
if (withLLM && !llm) { console.error('MEASURE_LLM=1 needs LLM_BASE_URL'); process.exit(1); }

const median = (xs) => { const s = [...xs].filter((x) => x != null).sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const pairName = (p) => `${p.a.likes.join('+')} × ${p.b.likes.join('+')}`;
const cell = (x) => (x == null ? x : String(x).replace(/\|/g, '/'));
const firstCmp = (engine, id) => (engine.history.get(id) || [])[0] || engine.last.get(id);
const sig = (engine, who) => engine.fav[who].map((f) => f.id).join(',');

const raw = [], rows = [], genreRows = [], lunchRows = [], llmOnlyRows = [], modelRuns = [];

for (const body of PAIRS) {
  const qloo = createQloo({ cache: new Map() });
  let engine;
  const plan = await planSaturday(qloo, normalizeRequest(body), { llm: null, onEngine: (e) => { engine = e; } });
  raw.push({ input: body, plan });
  if (!plan.ok) { rows.push({ pair: pairName(body), error: plan.error }); continue; }
  for (const s of plan.slots) {
    if (s.skipped) { rows.push({ pair: pairName(body), slot: s.slot.id, skipped: true }); continue; }
    const first = s.picks[0];
    rows.push({
      pair: pairName(body), slot: s.slot.id, type: s.slot.type, depth: first?.depth, overlap: s.overlapCount, shared: first?.kind === 'shared',
      ourWorse: first?.kind === 'shared' ? Math.max(first.ra, first.rb) : null,
      naiveWorse: s.naive ? Math.max(s.naive.ra, s.naive.rb) : null,
      naiveOutside: s.naive ? (s.naive.ra > s.naive.depth || s.naive.rb > s.naive.depth) : null,
      naiveSame: s.naive && first ? s.naive.name === first.name : null,
      replanned: !!s.replanned,
    });
  }
  raw.at(-1).stats = plan.stats;

  // Genre: for every person whose favourite carries a Qloo music genre.
  const m1 = firstCmp(engine, 'music');
  const ms = plan.slots.find((s) => s.slot.id === 'music');
  for (const who of ['a', 'b']) {
    const g = await engine.genresOf(who);
    if (!g.length || !m1 || m1.skipped) continue;
    const ids = (who === 'a' ? m1.listA : m1.listB).slice(0, 10).map((e) => e.entity_id);
    const inG = await qloo.insights({ 'filter.type': 'urn:entity:artist', 'signal.interests.entities': sig(engine, who), 'filter.tags': g.map((x) => x.id).join(','), 'filter.results.entities': ids.join(','), take: ids.length });
    const mine = (ms?.picks || []).filter((p) => p.kind === (who === 'a' ? 'turnA' : 'turnB') || p.kind === 'shared');
    let pickIn = null;
    if (mine.length) {
      const chk = await qloo.insights({ 'filter.type': 'urn:entity:artist', 'signal.interests.entities': sig(engine, who), 'filter.tags': g.map((x) => x.id).join(','), 'filter.results.entities': mine.map((p) => p.id).join(','), take: mine.length });
      pickIn = `${entities(chk).length} of ${mine.length}`;
    }
    genreRows.push({ pair: pairName(body), who: body[who].label, fav: engine.fav[who].map((f) => f.name).join(' + '), genres: g.map((x) => x.name).join('/'), top10InGenre: entities(inG).length, replanned: !!ms?.lists && ms.lists[who] !== m1.listNames[who], pickIn });
  }

  // Child lunch: old filter (bars excluded) vs new (tagged good for kids, no alcohol tags), every city, as if a child came.
  if (body.city) {
    const ke = createEngine(qloo, normalizeRequest({ ...body, audience: 'child' }));
    ke.fav.a = engine.fav.a; ke.fav.b = engine.fav.b;
    const oldC = await ke.compare('lunch', { lunch: 'off' });
    const oldPick = ke.autoPicks('lunch')[0];
    const newC = await ke.compare('lunch', { lunch: 'kids' });
    const newPick = ke.autoPicks('lunch')[0];
    const info = (cmp, p) => (p ? { name: cell(cmp.pool.get(p.id).name), alcohol: hasAlcoholTag(cmp.pool.get(p.id).tagIds), kid: hasKidTag(cmp.pool.get(p.id).tagIds), shared: p.kind === 'shared', worse: Math.max(p.ra, p.rb) } : null);
    const top10alc = (cmp) => ['listA', 'listB'].map((k) => cmp[k].slice(0, 10).filter((e) => hasAlcoholTag((e.tags || []).map((t) => t.tag_id || t.id))).length);
    lunchRows.push({ pair: pairName(body), city: body.city, old: info(oldC, oldPick), neu: info(newC, newPick), oldTop10Alcohol: top10alc(oldC), listLen: [newC.listA.length, newC.listB.length] });
  }

  if (withLLM) {
    // LLM-only baseline: same model, no Qloo.
    const ask = `Two people spend a Saturday together${body.city ? ` in ${body.city}` : ''}. ${body.a.label} (${body.a.age || 'age not given'}) loves ${body.a.likes.join(', ')}. ${body.b.label} (${body.b.age || 'age not given'}) loves ${body.b.likes.join(', ')}.${body.audience === 'child' ? ' A child is coming.' : body.audience === 'teen' ? ' A teenager is coming.' : ''} Name ONE film, ONE music artist and ONE TV show that BOTH would enjoy, and ONE real restaurant for lunch in ${body.city}. Answer only JSON: {"film":"","artist":"","tv_show":"","restaurant":""}`;
    let picks = null, err = null;
    for (let i = 0; i < 3 && !picks; i++) {
      try {
        const r = await chat(llm, { messages: [{ role: 'user', content: ask }], maxTokens: 3000, timeoutMs: 60000 });
        const m = String(r.message.content || '').match(/\{[\s\S]*\}/);
        picks = m ? JSON.parse(m[0]) : null;
      } catch (e) { err = e.message; }
    }
    for (const [k, slotId, type] of [['film', 'movie', 'urn:entity:movie'], ['artist', 'music', 'urn:entity:artist'], ['tv_show', 'evening', 'urn:entity:tv_show'], ['restaurant', 'lunch', 'urn:entity:place']]) {
      const name = picks?.[k];
      const row = { pair: pairName(body), kind: k, name: cell(name) || null, error: picks ? null : err || 'no JSON' };
      const cmp = firstCmp(engine, slotId);
      if (name && cmp && !cmp.skipped) {
        const found = await qloo.search(name, 3, `LLM-only: look up ${name}`, type);
        const hit = (found.results || [])[0];
        row.found = hit ? cell(hit.name) : null;
        if (hit) {
          const base = { 'filter.type': type, 'filter.results.entities': hit.entity_id, take: 1, ...(type === 'urn:entity:place' ? { 'filter.location.query': body.city } : {}) };
          const sc = async (who) => entities(await qloo.insights({ ...base, 'signal.interests.entities': sig(engine, who), 'signal.demographics.age': body[who].age || undefined }))[0]?.query?.affinity;
          const [fa, fb] = await Promise.all([sc('a'), sc('b')]);
          row.depth = cmp.depth;
          row.ra = Math.min(ownRank(fa, cmp.listA.map((e) => e.query?.affinity ?? 0)), cmp.depth + 1);
          row.rb = Math.min(ownRank(fb, cmp.listB.map((e) => e.query?.affinity ?? 0)), cmp.depth + 1);
          row.inBoth = Math.max(row.ra, row.rb) <= cmp.depth;
          if (type === 'urn:entity:place') row.alcohol = hasAlcoholTag((hit.tags || []).map((t) => t.id || t.tag_id));
        }
        const ours = plan.slots.find((s) => s.slot.id === slotId)?.picks?.[0];
        row.ours = ours ? { name: cell(ours.name), worse: ours.kind === 'shared' ? Math.max(ours.ra, ours.rb) : null, shared: ours.kind === 'shared' } : null;
      }
      llmOnlyRows.push(row);
    }
    // The model planner on the same pair (Qloo answers mostly come from this pair's cache).
    const mp = await planSaturday(qloo, normalizeRequest(body), { llm });
    const all = mp.slots?.flatMap((s) => s.picks || []) || [];
    modelRuns.push({ pair: pairName(body), ok: mp.ok, planner: mp.planner, ms: mp.stats?.ms, music: mp.slots?.find((s) => s.slot.id === 'music')?.picks?.map((p) => cell(p.name)), whyModel: all.filter((p) => p.whyBy === 'model').length, whyTotal: all.length, summaryBy: mp.summaryBy, samePicks: plan.slots.filter((s, i) => s.picks?.[0]?.id && s.picks[0].id === mp.slots?.[i]?.picks?.[0]?.id).length });
    raw.at(-1).modelPlan = mp;
  }
  console.error(`done: ${pairName(body)} (${plan.stats?.qlooCalls} calls, ${plan.stats?.ms} ms)`);
}

await mkdir('measurements-raw', { recursive: true });
await writeFile(`measurements-raw/run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify({ raw, rows, genreRows, lunchRows, llmOnlyRows, modelRuns }, null, 1));

const ok = rows.filter((r) => r.slot && !r.skipped);
const byType = (t) => ok.filter((r) => (t === 'place' ? r.type === 'place' : r.type !== 'place'));
const stats = raw.filter((r) => r.stats).map((r) => r.stats);
const rt = (x, d) => (x == null ? '—' : x > d ? `outside top ${d}` : `#${x}`);
const L = [];
L.push('# Measurements', '');
L.push(`Run: ${new Date().toISOString()} · ${PAIRS.length} fixed pairs × 5 parts of the day · live Qloo hackathon API · fresh cache per pair. Re-run: \`npm run measure\` (add \`MEASURE_LLM=1\` and an LLM endpoint for sections 4 and 5).`, '');
L.push('These numbers say where each pick sits in Qloo\'s own taste lists for both people. They do not measure whether real people enjoyed the day; that has not been tested.', '');
L.push('## 1. Agent vs one mixed Qloo call', '');
L.push('For each part of the day the agent fetches each person\'s own Qloo list (top 100 places in the city, top 200 films / artists / shows). A pick is "shared" only if it is in both lists. "Worse rank" is the lower of the two ranks. The baseline is one Qloo call with both people\'s favourites (and both age bands) mixed, top result. Rule-based planner (deterministic).', '');
L.push('| | Places (outing + lunch) | Films, artists, shows |', '|---|---|---|');
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : 'n/a');
for (const [label, f] of [
  ['Parts of the day planned', (rs) => rs.length],
  ['…with a shared pick (in both lists)', (rs) => `${rs.filter((r) => r.shared).length} (${pct(rs.filter((r) => r.shared).length, rs.length)})`],
  ['…where the plan takes turns instead', (rs) => `${rs.filter((r) => !r.shared).length}`],
  ['Mixed call: top pick is outside at least one person\'s list', (rs) => { const n = rs.filter((r) => r.naiveOutside !== null); return `${n.filter((r) => r.naiveOutside).length} of ${n.length}`; }],
  ['When shared: median worse rank, agent pick', (rs) => median(rs.filter((r) => r.shared).map((r) => r.ourWorse)) ?? 'n/a'],
  ['When shared: median worse rank, mixed-call pick (outside = list length + 1)', (rs) => median(rs.filter((r) => r.shared && r.naiveWorse != null).map((r) => r.naiveWorse)) ?? 'n/a'],
  ['When shared: mixed call picked the same item', (rs) => `${rs.filter((r) => r.shared && r.naiveSame).length} of ${rs.filter((r) => r.shared).length}`],
]) L.push(`| ${label} | ${f(byType('place'))} | ${f(byType('media'))} |`);
L.push('', `Speed (rule-based planner): median ${(median(stats.map((s) => s.ms)) / 1000).toFixed(1)} s and ${median(stats.map((s) => s.qlooCalls))} Qloo calls per plan.`, '');

L.push('## 2. A favourite\'s music genre (the trot problem)', '');
L.push('For every person whose favourite carries a Qloo music genre: how many of their own top 10 artists (first pass, no genre filter) carry that genre, whether the planner re-asked Qloo within the genre (rule: 2 or fewer of 10), and how many of that person\'s song picks carry the genre at the end (checked with Qloo `filter.tags` + `filter.results.entities`).', '');
L.push('| Pair | Person | Favourite → Qloo genre | Top 10 in genre, first pass | Re-planned | Their song picks in genre |', '|---|---|---|---|---|---|');
for (const g of genreRows) L.push(`| ${g.pair} | ${g.who} | ${g.fav} → ${g.genres} | ${g.top10InGenre} of 10 | ${g.replanned ? 'yes' : 'no'} | ${g.pickIn ?? '—'} |`);
L.push('');

L.push('## 3. Lunch with a child (the alcohol problem)', '');
L.push('Every city, as if a child were coming. Old filter: restaurants open on Saturday, bars and nightclubs excluded. New filter: restaurants Qloo tags "good for kids" (tag intersection) with every alcohol tag excluded (alcohol, beer, wine, cocktails, hard liquor, full bar, happy-hour drinks …). "Alcohol tag" means Qloo lists it; a place without the tag may still serve alcohol.', '');
L.push('| City | Old pick | alcohol tag? | New pick | alcohol tag? | kids tag? | new pick shared? (worse rank) |', '|---|---|---|---|---|---|---|');
for (const r of lunchRows) L.push(`| ${r.city} | ${r.old?.name ?? '—'} | ${r.old ? (r.old.alcohol ? 'yes' : 'no') : '—'} | ${r.neu?.name ?? '—'} | ${r.neu ? (r.neu.alcohol ? 'yes' : 'no') : '—'} | ${r.neu ? (r.neu.kid ? 'yes' : 'no') : '—'} | ${r.neu ? `${r.neu.shared ? 'yes' : 'no'} (#${r.neu.worse})` : '—'} |`);
L.push('', `Old filter: ${lunchRows.filter((r) => r.old?.alcohol).length} of ${lunchRows.length} lunch picks carry an alcohol tag. New filter: ${lunchRows.filter((r) => r.neu?.alcohol).length} of ${lunchRows.length}, and ${lunchRows.filter((r) => r.neu?.kid).length} of ${lunchRows.length} carry a "good for kids" tag. Restaurants with an alcohol tag in each person's old top 10: ${lunchRows.map((r) => `${r.city} ${r.oldTop10Alcohol.join('/')}`).join(', ')}.`, '');

if (withLLM) {
  L.push('## 4. The same model without Qloo (LLM-only)', '');
  L.push(`Model: ${llm.model} via ${llm.provider}, asked once per pair for one film, one artist, one TV show both would enjoy and one real lunch restaurant in the city. Each name was looked up with Qloo /search (by type) and placed in both people's own lists exactly like the agent's picks (first-pass lists, no genre filter).`, '');
  L.push('| Pair | Kind | LLM named | Found in Qloo as | Rank A | Rank B | In both lists? | Agent pick (worse rank) |', '|---|---|---|---|---|---|---|---|');
  for (const r of llmOnlyRows) L.push(`| ${r.pair} | ${r.kind} | ${r.name ?? r.error} | ${r.found ?? 'not found'} | ${rt(r.ra, r.depth)} | ${rt(r.rb, r.depth)} | ${r.inBoth == null ? '—' : r.inBoth ? 'yes' : 'no'} | ${r.ours ? `${r.ours.name} (${r.ours.shared ? `#${r.ours.worse}` : 'take turns'})` : '—'} |`);
  const media = llmOnlyRows.filter((r) => r.kind !== 'restaurant');
  const rest = llmOnlyRows.filter((r) => r.kind === 'restaurant');
  const agentMedia = ok.filter((r) => ['movie', 'music', 'evening'].includes(r.slot));
  const agentLunch = ok.filter((r) => r.slot === 'lunch');
  L.push('', `Films, artists, shows: the LLM alone named ${media.filter((r) => r.name).length}; ${media.filter((r) => r.found).length} were found in Qloo; **${media.filter((r) => r.inBoth).length} were in both people's lists**; median worse rank of those found: ${rt(median(media.filter((r) => r.found).map((r) => Math.max(r.ra, r.rb))), 200)}. The agent had a shared pick in ${agentMedia.filter((r) => r.shared).length} of ${agentMedia.length} of the same parts of the day and said "take turns" in the rest.`);
  L.push(`Lunch: the LLM alone named ${rest.filter((r) => r.name).length} restaurants; ${rest.filter((r) => r.found).length} found in Qloo in that city; ${rest.filter((r) => r.inBoth).length} in both people's lists. The agent's lunch was shared in ${agentLunch.filter((r) => r.shared).length} of ${agentLunch.length}.`, '');
  L.push('## 5. Model planner', '');
  L.push('Same Qloo tools as the rule-based planner. The model decides what to re-ask Qloo, chooses, and writes the sentences; each pick is validated against the comparison and each sentence is checked against Qloo\'s names, tags and ranks before it is shown.', '');
  L.push('| Pair | Completed by the model | Re-plans | Sentences shown from the model / all picks | Sentences rejected by the check | Day summary | Same first pick as rules (of 5) | Time | Songs |', '|---|---|---|---|---|---|---|---|---|');
  for (const m of modelRuns) L.push(`| ${m.pair} | ${m.planner?.completed ? 'yes' : `no (${m.planner?.error || '?'}; rules finished ${(m.planner?.ruleParts || []).join(', ')})`} | ${m.planner?.replans ?? 0} | ${m.whyModel} / ${m.whyTotal} | ${m.planner?.rejectedWhy ?? 0} | ${m.summaryBy} | ${m.samePicks} | ${((m.ms || 0) / 1000).toFixed(0)} s | ${(m.music || []).join(', ')} |`);
  L.push('', `Model planner: completed ${modelRuns.filter((m) => m.planner?.completed).length} of ${modelRuns.length}; median ${(median(modelRuns.map((m) => m.ms)) / 1000).toFixed(0)} s per plan.`, '');
}

L.push('## Per pair (rule-based planner)', '', '| Pair | Part of day | In both lists | Shared pick? | Agent worse rank | Mixed-call worse rank | Re-planned |', '|---|---|---|---|---|---|---|');
for (const r of rows) {
  if (r.error) { L.push(`| ${r.pair} | — | error: ${r.error} | | | | |`); continue; }
  if (r.skipped) { L.push(`| ${r.pair} | ${r.slot} | skipped | | | | |`); continue; }
  L.push(`| ${r.pair} | ${r.slot} | ${r.overlap} of top ${r.depth} | ${r.shared ? 'yes' : 'no, take turns'} | ${rt(r.ourWorse, r.depth)} | ${rt(r.naiveWorse, r.depth)} | ${r.replanned ? 'yes' : ''} |`);
}
await mkdir('docs', { recursive: true });
await writeFile('docs/measurements.md', L.join('\n') + '\n');
console.log(L.slice(0, 70).join('\n'));
