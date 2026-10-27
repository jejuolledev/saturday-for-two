// Saturday for Two — the planning agent.
//
// Goal: two people with very different tastes, one Saturday. For each slot of the day
// the agent looks for the thing that sits high in BOTH people's Qloo taste graph,
// not the thing one person loves and the other tolerates.
//
// Every decision below is a Qloo call plus a rule you can read. No language model is
// in the loop, so nothing in the plan can be invented: each pick is a Qloo entity.

export const rankText = (r, depth = SHARED_MAX_RANK) => (r <= depth ? `#${r}` : `outside top ${depth}`);

// "Me" becomes "my", everything else gets 's.
export const poss = (label) => (/^(me|i)$/i.test(String(label).trim()) ? 'my' : `${label}'s`);

export const ageText = (band) => ({ '24_and_younger': 'under 25', '25_to_29': '25-29', '30_to_34': '30-34', '35_to_44': '35-44', '45_to_54': '45-54', '55_and_older': '55+' }[band] || 'any age');

export const AGE_BANDS = ['24_and_younger', '25_to_29', '30_to_34', '35_to_44', '45_to_54', '55_and_older'];

const PLACE_TAG = (s) => `urn:tag:category:place:${s}`;

export const SLOTS = [
  {
    id: 'morning', time: '10:00', title: 'Morning outing', type: 'place', usesCity: true,
    depth: 100,
    params: {
      'filter.tags': ['museum', 'park', 'aquarium', 'amusement_park', 'zoo', 'botanical_garden', 'science_museum'].map(PLACE_TAG).join(','),
      'filter.hours': 'Saturday',
    },
  },
  {
    id: 'lunch', time: '12:30', title: 'Lunch', type: 'place', usesCity: true, depth: 100,
    params: { 'filter.tags': PLACE_TAG('restaurant'), 'filter.hours': 'Saturday' },
  },
  { id: 'movie', time: '15:00', title: 'Afternoon movie', type: 'movie', depth: 200, kidRating: 'G,PG' },
  { id: 'music', time: 'On the way', title: 'Songs for the car', type: 'artist', depth: 200, count: 3 },
  { id: 'evening', time: '19:30', title: 'One episode before bed', type: 'tv_show', depth: 200, kidRating: 'TV-Y,TV-Y7,TV-G,TV-PG,G,PG' },
];


// Pool sources (sum must stay <= 50, Qloo's take limit, because the pool is scored in one call).
export const POOL = { combined: Number(process.env.POOL_COMBINED ?? 15), each: Number(process.env.POOL_EACH ?? 12) };

export function clean(s, max = 60) {
  return String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function normalizeRequest(body) {
  const person = (p, fallback) => {
    const likes = (Array.isArray(p?.likes) ? p.likes : String(p?.likes ?? '').split(','))
      .map((x) => clean(x)).filter(Boolean).slice(0, 3);
    const age = AGE_BANDS.includes(p?.age) ? p.age : '';
    return { label: clean(p?.label, 24) || fallback, likes, age };
  };
  const a = person(body?.a, 'Person A');
  const b = person(body?.b, 'Person B');
  const city = clean(body?.city, 60);
  const kidSafe = Boolean(body?.kidSafe);
  const errors = [];
  if (!a.likes.length) errors.push(`Add at least one thing ${a.label} loves.`);
  if (!b.likes.length) errors.push(`Add at least one thing ${b.label} loves.`);
  return { a, b, city, kidSafe, errors };
}

const norm = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');

// Rank candidates: exact name match first, then by Qloo popularity.
export function orderCandidates(query, results) {
  const q = norm(query);
  return [...results]
    .filter((r) => !(r.types || []).some((t) => t === 'urn:entity:locality'))
    .sort((x, y) => {
      const ex = norm(x.name) === q ? 1 : 0;
      const ey = norm(y.name) === q ? 1 : 0;
      if (ex !== ey) return ey - ex;
      return (y.popularity || 0) - (x.popularity || 0);
    });
}

const shortType = (types) => (types?.[0] || '').split(':').pop().replace('videogame', 'video game').replace('tv_show', 'TV show');

// Where would this candidate sit in the person's OWN Qloo list for this slot?
// `own` = affinities of that person's top results (descending, up to 50).
// Qloo gives the same affinity for a (signal, entity) pair whatever else is filtered,
// so a candidate's affinity can be placed inside the person's own list.
// Returns 1..N inside the list; beyond it, N+1 or more (shown as "100+", never as a precise number).
export function ownRank(aff, own) {
  if (aff == null || !own.length) return 999;
  let r = 1;
  for (const x of own) if (x > aff + 1e-9) r++;
  if (r <= own.length) return r;
  const last = own[own.length - 1];
  return own.length + 1 + Math.round(Math.max(0, (last - aff) / Math.max(last, 1e-6)) * 1000);
}

// Both people must like it: the worse of the two ranks decides. Ties go to the better sum.
export function bridgeKey(ra, rb) {
  return Math.max(ra, rb) + 0.001 * Math.min(ra, rb);
}

// A pick counts as shared only if it is in BOTH people's own list for that slot:
// top 100 for places (city lists are short), top 200 for films, artists and shows.
export const SHARED_MAX_RANK = 200;

// Qloo tags worth showing as a reason (skips payment cards, raw keywords, parking and similar).
const WHY_TYPES = new Set(['theme:qloo', 'plot:qloo', 'character:qloo', 'genre:media', 'genre:qloo', 'subgenre:qloo', 'audience:qloo', 'style:qloo', 'archetype:qloo',
  'music:qloo', 'artist:qloo', 'genre:music', 'ambience:qloo', 'cuisine:qloo', 'interests:qloo', 'customer_identity:qloo', 'culinary_style:qloo', 'children:place', 'decor:qloo', 'activity_type:qloo', 'setting:qloo', 'visit_intent:qloo']);
const ABOUT_ORDER = ['genre:media', 'subgenre:qloo', 'genre:music', 'cuisine:qloo', 'theme:qloo', 'audience:qloo', 'ambience:qloo', 'children:place', 'music:qloo', 'plot:qloo', 'customer_identity:qloo', 'style:qloo', 'activity_type:qloo', 'interests:qloo'];
export function aboutTags(tags, n = 4) {
  const seen = new Set();
  const out = [];
  for (const type of ABOUT_ORDER) for (const t of tags) {
    const k = t.name.toLowerCase();
    if (t.type !== type || seen.has(k) || out.length >= n) continue;
    seen.add(k); out.push(t.name);
  }
  return out;
}
const round3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

// Qloo short descriptions come in several languages; use the English one when there is one.
export function englishShort(p) {
  const list = Array.isArray(p.short_descriptions) ? p.short_descriptions : [];
  const en = list.find((d) => (d.languages || []).some((l) => String(l).startsWith('en')));
  return en?.value || p.short_description || p.plot_summary || '';
}

function entityOf(e) {
  const p = e.properties || {};
  let sub = '';
  if (e.subtype === 'urn:entity:place') sub = p.address || '';
  else if (e.subtype === 'urn:entity:movie') sub = [p.release_year, p.content_rating].filter(Boolean).join(' · ');
  else if (e.subtype === 'urn:entity:tv_show') sub = [p.release_year, p.content_rating].filter(Boolean).join(' · ');
  else if (e.subtype === 'urn:entity:artist') sub = '';
  return {
    id: e.entity_id,
    name: e.name,
    sub: clean(sub, 120),
    image: p.image?.url || null,
    desc: clean(englishShort(p), 170),
    tags: (e.tags || []).map((t) => ({ id: t.tag_id || t.id, name: t.name, type: String(t.type || '').replace('urn:tag:', '') })).filter((t) => t.id && WHY_TYPES.has(t.type)),
  };
}

const slotInfo = (s) => ({ id: s.id, time: s.time, title: s.title, type: s.type });
const entities = (body) => body?.results?.entities || [];
const errText = (body) => body?.errors?.[0]?.message || '';

export async function planSaturday(qloo, input, { onStep } = {}) {
  const t0 = Date.now();
  const trace = [];
  const say = (step, detail) => { trace.push({ step, detail }); try { onStep?.({ step, detail }); } catch {} };
  const progress = (detail) => { try { onStep?.({ step: 'progress', detail }); } catch {} };
  const { a, b, city, kidSafe } = input;

  // 1. Turn each typed favourite into a Qloo entity the taste graph can use as a signal.
  async function resolve(phrase, who) {
    const found = await qloo.search(phrase, 6, `look up "${phrase}"`);
    const cands = orderCandidates(phrase, found.results || []).slice(0, 4);
    const skipped = [];
    for (const c of cands) {
      const probe = await qloo.insights({ 'filter.type': 'urn:entity:movie', 'signal.interests.entities': c.entity_id, take: 1 }, `check "${c.name}" has taste data`);
      if (entities(probe).length) {
        say('resolve', `${who}: "${phrase}" → ${c.name} (${shortType(c.types)})` + (skipped.length ? `; skipped ${skipped.join(', ')} (no taste data)` : ''));
        return { phrase, id: c.entity_id, name: c.name, type: shortType(c.types) };
      }
      skipped.push(`${c.name} (${shortType(c.types)})`);
    }
    say('resolve', `${who}: "${phrase}" → not found in Qloo with taste data, left out`);
    return null;
  }

  const [ra, rb] = await Promise.all([
    Promise.all(a.likes.map((l) => resolve(l, a.label))),
    Promise.all(b.likes.map((l) => resolve(l, b.label))),
  ]);
  const ea = ra.filter(Boolean);
  const eb = rb.filter(Boolean);
  if (!ea.length || !eb.length) {
    const who = !ea.length ? a.label : b.label;
    return { ok: false, error: `Qloo has no taste data for anything we typed for ${who}. Try a better-known artist, film, show, game or brand.`, trace, resolved: { a: ra, b: rb }, calls: qloo.calls.length, ms: Date.now() - t0 };
  }
  const idsA = ea.map((e) => e.id).join(',');
  const idsB = eb.map((e) => e.id).join(',');
  const aIds = new Set(ea.map((e) => e.id));
  const bIds = new Set(eb.map((e) => e.id));

  // 3. Slot by slot: build a candidate pool, score it for each person, keep what both like.
  const used = new Set();
  async function planSlot(slot) {
    const base = { 'filter.type': `urn:entity:${slot.type}`, ...(slot.params || {}) };
    if (slot.usesCity) {
      if (!city) return { slot, skipped: 'No city given, so no places.' };
      base['filter.location.query'] = city;
    }
    if (kidSafe && slot.kidRating) base['filter.content_rating'] = slot.kidRating;

    // Each person's own top 100 for this slot (two pages of 50).
    const depth = slot.depth || 100;
    const pages = Array.from({ length: Math.ceil(depth / 50) }, (_, i) => i + 1);
    const own = (ids, age, who) => Promise.all(pages.map((page) =>
      qloo.insights({ ...base, 'signal.interests.entities': ids, 'signal.demographics.age': age || undefined, take: 50, page }, `${slot.title}: ${poss(who)} own list, page ${page}`),
    )).then((rs) => rs.flatMap(entities));

    progress(`${slot.title}: asking Qloo for each person's own top ${depth}…`);
    const [listA, listB, comb] = await Promise.all([
      own(idsA, a.age, a.label),
      own(idsB, b.age, b.label),
      qloo.insights({ ...base, 'signal.interests.entities': `${idsA},${idsB}`, take: POOL.combined }, `${slot.title}: everyone's likes mixed in one call`),
    ]);
    const ownA = listA.map((e) => e.query?.affinity ?? 0);
    const ownB = listB.map((e) => e.query?.affinity ?? 0);
    const inB = new Set(listB.map((e) => e.entity_id));
    const overlap = listA.filter((e) => inB.has(e.entity_id));

    // Candidate pool, most promising first. Qloo scores at most 50 ids per call.
    const pool = new Map();
    const sourceOf = new Map();
    const add = (list, src, n = Infinity) => {
      for (const e of list.slice(0, n)) {
        if (pool.size >= 50) return;
        if (pool.has(e.entity_id) || aIds.has(e.entity_id) || bIds.has(e.entity_id)) continue;
        pool.set(e.entity_id, entityOf(e));
        sourceOf.set(e.entity_id, src);
      }
    };
    add(overlap, `in both top-${depth} lists`, 15);
    add(entities(comb), `everyone's likes mixed`, 1); // keep the naive pick so it can be compared
    add(listA, `${poss(a.label)} own list`, POOL.each);
    add(listB, `${poss(b.label)} own list`, POOL.each);
    add(entities(comb), `everyone's likes mixed`);
    if (pool.size < 2) {
      say(slot.id, `${slot.title}: Qloo returned too few candidates${slot.usesCity ? ` for "${city}"` : ''} (${errText(comb) || 'empty'}).`);
      return { slot: slotInfo(slot), skipped: `Qloo had nothing for this slot${slot.usesCity ? ` in ${city}` : ''}.` };
    }
    const ids = [...pool.keys()];
    progress(`${slot.title}: ${overlap.length} items are in both lists; scoring ${ids.length} candidates for each person…`);

    // Score every candidate for each person separately (filter.results.entities),
    // then place it inside that person's own top 100.
    // The same filters as the pool queries go along (Qloo returned nothing for a large place
    // pool without the location filter), and if a call still comes back short we retry in halves.
    const scoreFor = async (sig, age, who) => {
      const m = new Map();
      const run = async (chunk, note) => {
        const r = await qloo.insights({ ...base, 'signal.interests.entities': sig, 'signal.demographics.age': age || undefined, 'filter.results.entities': chunk.join(','), take: chunk.length }, note);
        for (const e of entities(r)) m.set(e.entity_id, e.query?.affinity ?? 0);
      };
      await run(ids, `${slot.title}: score ${ids.length} candidates for ${who}`);
      if (m.size < ids.length / 2) {
        const rest = ids.filter((id) => !m.has(id));
        const half = Math.ceil(rest.length / 2);
        await Promise.all([run(rest.slice(0, half), `${slot.title}: re-score part 1 for ${who}`), run(rest.slice(half), `${slot.title}: re-score part 2 for ${who}`)]);
      }
      return m;
    };
    const [affA, affB] = await Promise.all([scoreFor(idsA, a.age, a.label), scoreFor(idsB, b.age, b.label)]);
    const rank = (id) => ({ ra: ownRank(affA.get(id), ownA), rb: ownRank(affB.get(id), ownB) });

    const scored = ids.filter((id) => !used.has(id)).map((id) => ({ id, ...rank(id) }));
    const sharedList = scored.filter((x) => Math.max(x.ra, x.rb) <= depth).sort((x, y) => bridgeKey(x.ra, x.rb) - bridgeKey(y.ra, y.rb));
    // Taking turns: from each person's own top 10, the items the OTHER person minds least.
    const turns = (key, other) => scored.filter((x) => x[key] <= 10 && !sharedList.some((s) => s.id === x.id)).sort((x, y) => x[other] - y[other] || x[key] - y[key]);
    const count = slot.count || 1;
    const picks = sharedList.slice(0, count).map((x) => ({ ...x, kind: 'shared' }));
    if (picks.length < count) {
      const ta = turns('ra', 'rb'), tb = turns('rb', 'ra');
      // With no shared pick at all, show both turns even for a one-item slot.
      const want = picks.length ? count : Math.max(count, 2);
      for (let i = 0; picks.length < want && (i < ta.length || i < tb.length); i++) {
        if (ta[i] && picks.length < want) picks.push({ ...ta[i], kind: 'turnA' });
        if (tb[i] && picks.length < want) picks.push({ ...tb[i], kind: 'turnB' });
      }
    }
    picks.forEach((p) => used.add(p.id));

    // What a naive agent does: one Qloo call with everyone's likes mixed together, take the top.
    const naiveTop = entities(comb).find((e) => pool.has(e.entity_id));
    const naive = naiveTop ? (({ ra, rb }) => ({ name: naiveTop.name, ra: Math.min(ra, depth + 1), rb: Math.min(rb, depth + 1), depth }))(rank(naiveTop.entity_id)) : null;

    // Ask Qloo which person's favourites pulled each pick in (explainability).
    const share = new Map();
    const pulled = new Map();
    const nameOf = new Map([...ea.map((e) => [e.id, { name: e.name, who: 'a' }]), ...eb.map((e) => [e.id, { name: e.name, who: 'b' }])]);
    if (picks.length) {
      const ex = await qloo.insights({ ...base, 'signal.interests.entities': `${idsA},${idsB}`, 'filter.results.entities': picks.map((p) => p.id).join(','), 'feature.explainability': 'true', take: picks.length }, `${slot.title}: ask Qloo whose likes pulled each pick in`);
      for (const e of entities(ex)) {
        let sa = 0, sb = 0;
        const parts = e.query?.explainability?.['signal.interests.entities'] || [];
        for (const s of parts) {
          if (aIds.has(s.entity_id)) sa += s.score; else if (bIds.has(s.entity_id)) sb += s.score;
        }
        if (sa + sb > 0) {
          share.set(e.entity_id, { a: sa / (sa + sb), b: sb / (sa + sb) });
          pulled.set(e.entity_id, parts.filter((s) => nameOf.has(s.entity_id)).map((s) => ({ ...nameOf.get(s.entity_id), pct: Math.round((s.score / (sa + sb)) * 100) })).sort((x, y) => y.pct - x.pct));
        }
      }
    }

    const out = picks.map((p) => {
      const ent = pool.get(p.id);
      return {
        id: ent.id, name: ent.name, sub: ent.sub, desc: ent.desc, image: ent.image,
        kind: p.kind, source: sourceOf.get(p.id), ra: Math.min(p.ra, depth + 1), rb: Math.min(p.rb, depth + 1), depth,
        affinity: { a: round3(affA.get(p.id)), b: round3(affB.get(p.id)) },
        share: share.get(p.id) || null,
        pulledBy: pulled.get(p.id) || [],
        about: aboutTags(ent.tags),
      };
    });

    const shared = out.filter((p) => p.kind === 'shared');
    const best = shared[0];
    say(slot.id, `${slot.title}: ${listA.length} + ${listB.length} own-list results, ${overlap.length} in both top-${depth} lists; pooled ${pool.size} candidates and scored each for both people.`);
    if (best) say(slot.id, `${slot.title}: picked "${best.name}" — ${rankText(best.ra, depth)} in ${poss(a.label)} own list, ${rankText(best.rb, depth)} in ${poss(b.label)} own list` + (naive ? `. Mixing everyone's likes into one call would have picked "${naive.name}" (${rankText(naive.ra, depth)} for ${a.label}, ${rankText(naive.rb, depth)} for ${b.label})` : '') + '.');
    if (out.some((p) => p.kind !== 'shared')) say(slot.id, `${slot.title}: ${shared.length ? 'not enough' : 'nothing'} Qloo found sits in both people's own top ${depth}, so the plan takes turns: each person's own top-10 pick that the other minds least.`);
    return { slot: slotInfo(slot), picks: out, naive, overlapCount: overlap.length, poolSize: pool.size };
  }

  const slots = await Promise.all(SLOTS.map((s) => planSlot(s).catch((e) => ({ slot: s, skipped: `Error: ${e.message}` }))));
  const usedCalls = qloo.calls.filter((c) => !c.cached).length;
  return {
    ok: true,
    people: { a: { label: a.label, age: a.age, likes: ea }, b: { label: b.label, age: b.age, likes: eb } },
    unresolved: { a: ra.map((r, i) => (r ? null : a.likes[i])).filter(Boolean), b: rb.map((r, i) => (r ? null : b.likes[i])).filter(Boolean) },
    city, kidSafe,
    slots,
    trace,
    calls: qloo.calls.map(({ path, params, note, ms, cached, ok }) => ({ path, params: redactParams(params), note, ms, cached, ok })),
    stats: { qlooCalls: qloo.calls.length, liveCalls: usedCalls, ms: Date.now() - t0 },
  };
}

// Shorten long id lists in the visible trace; nothing secret is in params.
function redactParams(params) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    const s = String(v);
    out[k] = s.length > 90 ? `${s.slice(0, 80)}… (${s.split(',').length} ids)` : s;
  }
  return out;
}
