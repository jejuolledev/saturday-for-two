// The Qloo side of the agent: every tool the planner (a language model, or the rule-based fallback)
// can use. Each tool is one or more Qloo calls plus a rule you can read; nothing here invents an item.
import {
  SLOTS, POOL, PLACE_TAG, SHARED_MAX_RANK, poss, rankText, orderCandidates, shortType, ownRank, bridgeKey,
  aboutTags, round3, entityOf, slotInfo, entities, errText,
} from './util.mjs';

// Places Qloo files as bars or nightlife: left out whenever someone under 18 is coming.
export const BAR_TAGS = ['bar', 'night_club', 'pub', 'cocktail_bar', 'wine_bar', 'beer_hall', 'gay_bar', 'karaoke_bar'].map(PLACE_TAG);
// Qloo tags that say a place serves alcohol. With a child along, lunch leaves these out.
export const ALCOHOL_TAGS = [
  'urn:tag:offerings:place:alcohol', 'urn:tag:offerings:place:beer', 'urn:tag:offerings:place:wine', 'urn:tag:offerings:place:cocktails',
  'urn:tag:offerings:place:hard_liquor', 'urn:tag:offerings:place:happy_hour_drinks', 'urn:tag:offerings:place:ok_to_order_just_drinks',
  'urn:tag:amenity:qloo:full_bar', 'urn:tag:amenity:qloo:alcohol_service', 'urn:tag:amenity:qloo:alcohol', 'urn:tag:amenity:qloo:beer', 'urn:tag:amenity:qloo:bar',
];
export const FAMILY_MUSIC_TAGS = ['urn:tag:audience:qloo:family_friendly', 'urn:tag:style:qloo:family_friendly'];
export const KID_TAGS = ['urn:tag:children:place:good_for_kids', 'urn:tag:children:place:kids_menu', 'urn:tag:children:place:high_chairs'];
export const hasAlcoholTag = (ids = []) => ids.some((t) => ALCOHOL_TAGS.includes(t));
export const hasKidTag = (ids = []) => ids.some((t) => KID_TAGS.includes(t));

// Music genre tags from a favourite's own Qloo tags. Artist entities carry urn:tag:genre:<x>;
// the music genre tag Qloo filters on is urn:tag:genre:music:<x>.
export function genreIdsFromTags(tags = []) {
  const out = [];
  for (const t of tags) {
    const id = String(t.id || t.tag_id || '');
    const type = String(t.type || '');
    let m;
    if ((m = id.match(/^urn:tag:genre:music:([a-z0-9_]+)$/))) out.push({ id, name: t.name });
    else if (type === 'urn:tag:genre' && (m = id.match(/^urn:tag:genre:([a-z0-9_]+)$/))) out.push({ id: `urn:tag:genre:music:${m[1]}`, name: t.name });
  }
  const seen = new Set();
  return out.filter((g) => !seen.has(g.id) && seen.add(g.id)).slice(0, 3);
}

// "Trot Singers" -> "Trot". Person entities (e.g. Lim Young-woong) carry Wikipedia-style categories instead of genres.
export function genreWordsFromTags(tags = []) {
  const words = [];
  for (const t of tags) {
    const m = String(t.name || '').match(/^([A-Za-z][A-Za-z&' -]{1,24}?) (singers|musicians|bands|rappers|vocalists)$/i);
    if (m && m[1].split(' ').length <= 2 && !/\d/.test(m[1])) words.push(m[1].trim());
  }
  return [...new Set(words)].slice(0, 3);
}

// Kinds of outing the planner may narrow the morning to (all are Qloo place category tags).
export const OUTING_KINDS = ['museum', 'park', 'aquarium', 'amusement_park', 'zoo', 'botanical_garden', 'science_museum', 'natural_history_museum', 'history_museum', 'art_museum', 'planetarium', 'theme_park', 'water_park', 'video_arcade', 'bowling_alley', 'library'];
const REF_PREFIX = { morning: 'o', lunch: 'l', movie: 'f', music: 'm', evening: 'e' };
const LUNCH_MODES = ['kids', 'no_alcohol', 'off'];

export function createEngine(qloo, input, { say = () => {}, progress = () => {} } = {}) {
  const { a, b, city } = input;
  const audience = input.audience || (input.kidSafe ? 'child' : 'adults');
  const kidSafe = audience !== 'adults';
  const people = { a, b };
  const fav = { a: [], b: [] };
  const genreCache = new Map();
  const last = new Map(); // slotId -> latest comparison
  const history = new Map(); // slotId -> earlier comparisons (for "first pass" notes)
  const chosen = new Map(); // slotId -> { picks, whyBy }
  const used = new Set();
  const alone = new Map(); // slotId -> what the model said with no Qloo, placed in both first-pass lists

  // --- tool: look up a favourite (search, then check it has taste data) -----------------------
  async function resolve(phrase, who) {
    const label = people[who].label;
    const found = await qloo.search(phrase, 6, `look up "${phrase}"`);
    const cands = orderCandidates(phrase, found.results || []).slice(0, 4);
    const skipped = [];
    for (const c of cands) {
      const probe = await qloo.insights({ 'filter.type': 'urn:entity:movie', 'signal.interests.entities': c.entity_id, take: 1 }, `check "${c.name}" has taste data`);
      if (entities(probe).length) {
        say('resolve', `${label}: "${phrase}" → ${c.name} (${shortType(c.types)})` + (skipped.length ? `; skipped ${skipped.join(', ')} (no taste data)` : ''));
        return { phrase, id: c.entity_id, name: c.name, type: shortType(c.types), tags: (c.tags || []).map((t) => ({ id: t.id || t.tag_id, name: t.name, type: t.type })) };
      }
      skipped.push(`${c.name} (${shortType(c.types)})`);
    }
    say('resolve', `${label}: "${phrase}" → not found in Qloo with taste data, left out`);
    return null;
  }

  async function resolveAll() {
    const [ra, rb] = await Promise.all([
      Promise.all(a.likes.map((l) => resolve(l, 'a'))),
      Promise.all(b.likes.map((l) => resolve(l, 'b'))),
    ]);
    fav.a = ra.filter(Boolean);
    fav.b = rb.filter(Boolean);
    return { ra, rb };
  }

  // --- tool: find a Qloo music genre tag by word ---------------------------------------------
  async function findGenreTag(word) {
    const w = String(word || '').trim().slice(0, 40);
    if (!w) return [];
    const r = await qloo.tags({ 'filter.query': w, 'filter.tag.types': 'urn:tag:genre:music', take: 5 }, `find Qloo music genre tag "${w}"`);
    return (r?.results?.tags || []).map((t) => ({ id: t.id || t.tag_id, name: t.name })).filter((t) => t.id);
  }

  // What music genres do this person's favourites belong to, according to Qloo's own tags?
  async function genresOf(who) {
    if (genreCache.has(who)) return genreCache.get(who);
    let out = [];
    for (const f of fav[who]) out.push(...genreIdsFromTags(f.tags));
    if (!out.length) {
      for (const f of fav[who]) {
        for (const word of genreWordsFromTags(f.tags)) {
          const hit = (await findGenreTag(word)).find((t) => t.name.toLowerCase() === word.toLowerCase());
          if (hit) out.push(hit);
        }
      }
    }
    const seen = new Set();
    out = out.filter((g) => !seen.has(g.id) && seen.add(g.id)).slice(0, 3);
    genreCache.set(who, out);
    return out;
  }

  const idsOf = (who) => fav[who].map((e) => e.id).join(',');

  // --- tool: compare the two people's own lists for one part of the day ------------------------
  // opts.genre = { a: [tagIds], b: [tagIds] } limits that person's artist list to those genres.
  // opts.lunch = 'kids' | 'no_alcohol' | 'off' (only with a child along).
  async function compare(slotId, opts = {}) {
    const slot = SLOTS.find((s) => s.id === slotId);
    if (!slot) throw new Error(`unknown part of the day "${slotId}"`);
    const depth = slot.depth || 100;
    const genre = slot.type === 'artist' ? { a: (opts.genre?.a || []).slice(0, 3), b: (opts.genre?.b || []).slice(0, 3) } : { a: [], b: [] };
    // Lunch: with a child, restaurants tagged good for kids with no alcohol tags; with a teenager, no alcohol tags.
    const lunch = slot.id !== 'lunch' ? 'off' : audience === 'child' ? (LUNCH_MODES.includes(opts.lunch) ? opts.lunch : 'kids') : audience === 'teen' ? 'no_alcohol' : 'off';

    const base = { 'filter.type': `urn:entity:${slot.type}`, ...(slot.params || {}) };
    const kinds = slot.id === 'morning' ? (opts.kinds || []).filter((k) => OUTING_KINDS.includes(k)).slice(0, 6) : [];
    if (kinds.length) base['filter.tags'] = kinds.map(PLACE_TAG).join(',');
    if (slot.usesCity) {
      if (!city) return remember(slot, { slot: slotInfo(slot), skipped: 'No city given, so no places.' });
      base['filter.location.query'] = city;
    }
    if (kidSafe && slot.ratings) base['filter.content_rating'] = slot.ratings[audience];
    if (kidSafe && slot.type === 'place') base['filter.exclude.tags'] = BAR_TAGS.join(',');
    if (lunch !== 'off') base['filter.exclude.tags'] = [...BAR_TAGS, ...ALCOHOL_TAGS].join(',');
    if (lunch === 'kids') { base['filter.tags'] = `${PLACE_TAG('restaurant')},urn:tag:children:place:good_for_kids`; base['operator.filter.tags'] = 'intersection'; }
    // With a child along, the youngest person's artists are limited to ones Qloo tags family-friendly
    // (Qloo has no lyric rating for artists). Opt out with opts.family = false.
    const family = { a: false, b: false };
    if (slot.type === 'artist' && audience === 'child' && opts.family !== false) {
      // (popularity floor: without it Qloo's top family-friendly artists for a Minecraft fan include a 1992 baby novelty hit)
      const young = ['a', 'b'].filter((w) => people[w].age === '24_and_younger');
      for (const w of young.length ? young : ['a', 'b']) if (!genre[w].length) family[w] = true;
    }
    const withGenre = (who) => (genre[who].length ? { ...base, 'filter.tags': genre[who].join(',') } : family[who] ? { ...base, 'filter.tags': FAMILY_MUSIC_TAGS.join(','), 'filter.popularity.min': 0.9 } : base);

    const pages = Array.from({ length: Math.ceil(depth / 50) }, (_, i) => i + 1);
    const listName = (who) => `${poss(people[who].label)} ${genre[who].length ? `${genre[who].map(gName).join('/')} ` : family[who] ? 'family-friendly ' : ''}list`;
    const own = (who) => Promise.all(pages.map((page) =>
      qloo.insights({ ...withGenre(who), 'signal.interests.entities': idsOf(who), 'signal.demographics.age': people[who].age || undefined, take: 50, page }, `${slot.title}: ${listName(who)}, page ${page}`),
    )).then((rs) => rs.flatMap(entities));

    progress(`${slot.title}: asking Qloo for each person's own top ${depth}…`);
    let [listA, listB, comb] = await Promise.all([
      own('a'), own('b'),
      qloo.insights({ ...base, 'signal.interests.entities': `${idsOf('a')},${idsOf('b')}`, 'signal.demographics.age': [...new Set([a.age, b.age].filter(Boolean))].join(',') || undefined, take: POOL.combined }, `${slot.title}: everyone's likes mixed in one call`),
    ]);
    // A family-friendly artist list Qloo barely fills is no better: fall back to the person's own list, and say so.
    const familyNotes = [];
    for (const w of ['a', 'b']) {
      if (family[w] && (w === 'a' ? listA : listB).length < 3) {
        family[w] = false;
        familyNotes.push(`Qloo has fewer than 3 family-friendly artists for ${people[w].label}; using ${poss(people[w].label)} own list.`);
        if (w === 'a') listA = await own('a'); else listB = await own('b');
      }
    }
    const ownA = listA.map((e) => e.query?.affinity ?? 0);
    const ownB = listB.map((e) => e.query?.affinity ?? 0);
    const inB = new Set(listB.map((e) => e.entity_id));
    const overlap = listA.filter((e) => inB.has(e.entity_id));
    const favIds = new Set([...fav.a, ...fav.b].map((e) => e.id));

    const pool = new Map();
    const sourceOf = new Map();
    const add = (list, src, n = Infinity) => {
      for (const e of list.slice(0, n)) {
        if (pool.size >= 50) return;
        if (pool.has(e.entity_id) || favIds.has(e.entity_id)) continue;
        pool.set(e.entity_id, entityOf(e));
        sourceOf.set(e.entity_id, src);
      }
    };
    add(overlap, `in both top-${depth} lists`, 15);
    add(entities(comb), `everyone's likes mixed`, 1);
    add(listA, listName('a'), POOL.each);
    add(listB, listName('b'), POOL.each);
    add(entities(comb), `everyone's likes mixed`);
    if (pool.size < 2) {
      say(slot.id, `${slot.title}: Qloo returned too few candidates${slot.usesCity ? ` for "${city}"` : ''} (${errText(comb) || 'empty'}).`);
      return remember(slot, { slot: slotInfo(slot), skipped: `Qloo had nothing for this part of the day${slot.usesCity ? ` in ${city}` : ''}.`, opts: { genre, lunch, kinds } });
    }
    const ids = [...pool.keys()];
    progress(`${slot.title}: ${overlap.length} items are in both lists; scoring ${ids.length} candidates for each person…`);

    // Score every candidate for each person (filter.results.entities) and place it in that person's own list.
    const scoreFor = async (who) => {
      const m = new Map();
      const q = withGenre(who);
      const run = async (chunk, note) => {
        const r = await qloo.insights({ ...q, 'signal.interests.entities': idsOf(who), 'signal.demographics.age': people[who].age || undefined, 'filter.results.entities': chunk.join(','), take: chunk.length }, note);
        for (const e of entities(r)) m.set(e.entity_id, e.query?.affinity ?? 0);
      };
      await run(ids, `${slot.title}: score ${ids.length} candidates for ${people[who].label}`);
      // A genre-limited list legitimately drops candidates outside the genre; only retry the unlimited case.
      if (!genre[who].length && !family[who] && m.size < ids.length / 2) {
        const rest = ids.filter((id) => !m.has(id));
        const half = Math.ceil(rest.length / 2);
        await Promise.all([run(rest.slice(0, half), `${slot.title}: re-score part 1 for ${people[who].label}`), run(rest.slice(half), `${slot.title}: re-score part 2 for ${people[who].label}`)]);
      }
      return m;
    };
    const [affA, affB] = await Promise.all([scoreFor('a'), scoreFor('b')]);
    const scored = ids.map((id) => ({ id, ra: ownRank(affA.get(id), ownA), rb: ownRank(affB.get(id), ownB) }));
    const byId = new Map(scored.map((x) => [x.id, x]));
    const naiveTop = entities(comb).find((e) => pool.has(e.entity_id));
    const naive = naiveTop ? { id: naiveTop.entity_id, name: naiveTop.name, ra: Math.min(byId.get(naiveTop.entity_id).ra, depth + 1), rb: Math.min(byId.get(naiveTop.entity_id).rb, depth + 1), depth } : null;

    // Checks the planner can act on.
    const checks = familyNotes.map((text) => ({ kind: 'family_thin', text }));
    if (!overlap.length) checks.push({ kind: 'no_overlap', text: `No ${slot.type === 'place' ? 'place' : slot.type.replace('_', ' ')} is in both people's own top ${depth}.` });
    if (slot.type === 'artist') {
      for (const who of ['a', 'b']) {
        if (genre[who].length) continue;
        const g = await genresOf(who);
        const top = (who === 'a' ? listA : listB).slice(0, 10).map((e) => e.entity_id);
        if (!g.length || !top.length) continue;
        const r = await qloo.insights({ 'filter.type': 'urn:entity:artist', 'signal.interests.entities': idsOf(who), 'filter.tags': g.map((x) => x.id).join(','), 'filter.results.entities': top.join(','), take: top.length }, `Songs: how many of ${poss(people[who].label)} top 10 artists are tagged ${g.map((x) => x.name).join('/')}?`);
        const n = entities(r).length;
        if (n <= 2) checks.push({ kind: 'genre_mismatch', who, genres: g, inGenre: n, of: top.length, text: `${poss(people[who].label)} favourite is tagged ${g.map((x) => x.name).join('/')} in Qloo, but ${n ? `only ${n}` : 'none'} of ${poss(people[who].label)} top ${top.length} artists ${n === 1 ? 'is' : 'are'}.` });
      }
    }
    if (slot.id === 'lunch' && audience === 'child') {
      const small = Math.min(listA.length, listB.length);
      if (lunch === 'kids' && small < 20) checks.push({ kind: 'few_kid_places', text: `Only ${small} restaurants in ${city} are tagged good for kids with no alcohol listed in Qloo for one of you.` });
      if (lunch === 'off') {
        const n = [...pool.values()].filter((e) => hasAlcoholTag(e.tagIds)).length;
        checks.push({ kind: 'alcohol', text: `${n} of ${pool.size} candidate restaurants are tagged as serving alcohol.` });
      }
    }

    const cmp = {
      slot: slotInfo(slot), slotDef: slot, depth, opts: { genre, lunch, kinds }, listA, listB, overlap, pool, sourceOf, affA, affB, scored, byId, naive, checks,
      listNames: { a: listName('a'), b: listName('b') },
      refs: new Map(), refOf: new Map(),
    };
    // Short references (m1, m2 …) so a model never has to copy a long Qloo id.
    const sorted = [...scored].sort((x, y) => bridgeKey(x.ra, x.rb) - bridgeKey(y.ra, y.rb));
    sorted.forEach((x, i) => { const r = `${REF_PREFIX[slot.id]}${i + 1}`; cmp.refs.set(r, x.id); cmp.refOf.set(x.id, r); });
    say(slot.id, `${slot.title}: ${listA.length} + ${listB.length} own-list results${genre.a.length || genre.b.length ? ` (${[genre.a.length && listName('a'), genre.b.length && listName('b')].filter(Boolean).join(', ')})` : ''}${lunch === 'kids' ? ' (restaurants tagged good for kids, no alcohol tags)' : lunch === 'no_alcohol' ? ' (restaurants with no alcohol tags)' : ''}${kinds.length ? ` (only ${kinds.join(', ').replace(/_/g, ' ')})` : ''}, ${overlap.length} in both top-${depth} lists; scored ${pool.size} candidates for both people.`);
    return remember(slot, cmp);
  }

  function remember(slot, cmp) {
    if (last.has(slot.id)) { const h = history.get(slot.id) || []; h.push(last.get(slot.id)); history.set(slot.id, h); }
    last.set(slot.id, cmp);
    return cmp;
  }

  const gName = (id) => {
    for (const who of ['a', 'b']) for (const g of genreCache.get(who) || []) if (g.id === id) return g.name;
    return String(id).split(':').pop().replace(/_/g, ' ');
  };

  // What the planner sees about a comparison: short, with refs, no long ids.
  function summary(cmp, n = 5) {
    if (!cmp || cmp.skipped) return { part: cmp?.slot?.id, skipped: cmp?.skipped || 'not compared yet' };
    const A = people.a.label, B = people.b.label;
    const row = (x) => {
      const e = cmp.pool.get(x.id);
      const tags = cmp.slot.type === 'place' ? [...aboutTags(e.tags, 3), ...(hasKidTag(e.tagIds) ? ['good for kids'] : []), ...(hasAlcoholTag(e.tagIds) ? ['serves alcohol'] : [])] : aboutTags(e.tags, 3);
      return { ref: cmp.refOf.get(x.id), name: e.name, also_called: e.alt || undefined, about: e.desc ? e.desc.slice(0, 90) : undefined, [`${A} rank`]: rankText(x.ra, cmp.depth), [`${B} rank`]: rankText(x.rb, cmp.depth), tags };
    };
    const free = cmp.scored.filter((x) => !used.has(x.id) || chosen.get(cmp.slot.id)?.picks?.some((p) => p.id === x.id));
    const shared = free.filter((x) => Math.max(x.ra, x.rb) <= cmp.depth).sort((x, y) => bridgeKey(x.ra, x.rb) - bridgeKey(y.ra, y.rb));
    const topOf = (k) => free.filter((x) => x[k] <= 10).sort((x, y) => x[k] - y[k]).slice(0, n);
    return {
      part: cmp.slot.id, title: cmp.slot.title, picks_wanted: cmp.slotDef.count || 1, list_length: cmp.depth,
      lists: { [A]: cmp.listNames.a, [B]: cmp.listNames.b }, outing_kinds: cmp.opts.kinds?.length ? cmp.opts.kinds : undefined, lunch_filter: cmp.opts.lunch !== 'off' ? cmp.opts.lunch : undefined,
      in_both_lists: cmp.overlap.length,
      shared_candidates: shared.slice(0, n).map(row),
      [`${A}_top`]: topOf('ra').map(row),
      [`${B}_top`]: topOf('rb').map(row),
      mixed_call_pick: cmp.naive ? { name: cmp.naive.name, [`${A} rank`]: rankText(cmp.naive.ra, cmp.depth), [`${B} rank`]: rankText(cmp.naive.rb, cmp.depth) } : null,
      checks: cmp.checks.map((c) => c.text),
    };
  }

  // --- tool: choose the picks for a part of the day (validated against the comparison) --------
  function validatePicks(slotId, picks) {
    const cmp = last.get(slotId);
    if (!cmp || cmp.skipped) return { error: `Compare "${slotId}" first.` };
    const count = cmp.slotDef.count || 1;
    const max = count > 1 ? count + 1 : 2; // music: up to 3 shared, or two turns each
    if (!Array.isArray(picks) || !picks.length) return { error: 'Give at least one pick.' };
    if (picks.length > max) return { error: `At most ${max} picks for ${cmp.slot.title}.` };
    const out = [];
    for (const p of picks) {
      const id = cmp.refs.get(String(p.ref || '').trim());
      if (!id) return { error: `Unknown ref "${p.ref}". Use a ref from the latest compare of ${slotId}.` };
      if (out.some((x) => x.id === id)) return { error: `"${p.ref}" is listed twice.` };
      const prev = chosen.get(slotId)?.picks || [];
      if (used.has(id) && !prev.some((x) => x.id === id)) return { error: `"${p.ref}" is already used in another part of the day.` };
      const x = cmp.byId.get(id);
      const kind = p.kind === 'shared' || p.kind === 'turnA' || p.kind === 'turnB' ? p.kind : (p.kind === `turn_${people.a.label}` ? 'turnA' : p.kind === `turn_${people.b.label}` ? 'turnB' : p.kind);
      if (kind === 'shared' && Math.max(x.ra, x.rb) > cmp.depth) return { error: `"${p.ref}" is not in both lists (${people.a.label} ${rankText(x.ra, cmp.depth)}, ${people.b.label} ${rankText(x.rb, cmp.depth)}), so it cannot be "shared".` };
      if (kind === 'turnA' && x.ra > 20) return { error: `"${p.ref}" is ${rankText(x.ra, cmp.depth)} for ${people.a.label}; a turn must come from that person's top 20.` };
      if (kind === 'turnB' && x.rb > 20) return { error: `"${p.ref}" is ${rankText(x.rb, cmp.depth)} for ${people.b.label}; a turn must come from that person's top 20.` };
      if (!['shared', 'turnA', 'turnB'].includes(kind)) return { error: `kind must be shared, turnA (${people.a.label}) or turnB (${people.b.label}).` };
      out.push({ ...x, kind, why: p.why });
    }
    const hasShared = out.some((x) => x.kind === 'shared');
    if (!hasShared && !(out.some((x) => x.kind === 'turnA') && out.some((x) => x.kind === 'turnB'))) {
      return { error: 'When nothing is shared, give each person a turn (at least one turnA and one turnB).' };
    }
    return { picks: out };
  }

  function setChoice(slotId, picks, whyBy) {
    const prev = chosen.get(slotId)?.picks || [];
    prev.forEach((p) => used.delete(p.id));
    picks.forEach((p) => used.add(p.id));
    chosen.set(slotId, { picks, whyBy });
  }

  // The rule the fallback uses (and the model's default): best shared by worse rank, else take turns.
  function autoPicks(slotId) {
    const cmp = last.get(slotId);
    if (!cmp || cmp.skipped) return [];
    const count = cmp.slotDef.count || 1;
    const free = cmp.scored.filter((x) => !used.has(x.id));
    const sharedList = free.filter((x) => Math.max(x.ra, x.rb) <= cmp.depth).sort((x, y) => bridgeKey(x.ra, x.rb) - bridgeKey(y.ra, y.rb));
    const turns = (key, other) => free.filter((x) => x[key] <= 10 && !sharedList.some((s) => s.id === x.id)).sort((x, y) => x[other] - y[other] || x[key] - y[key]);
    const picks = sharedList.slice(0, count).map((x) => ({ ...x, kind: 'shared' }));
    if (picks.length < count) {
      const ta = turns('ra', 'rb'), tb = turns('rb', 'ra');
      const want = picks.length ? count : count > 1 ? count + 1 : 2; // with nothing shared, turns are even
      for (let i = 0; picks.length < want && (i < ta.length || i < tb.length); i++) {
        if (ta[i] && picks.length < want) picks.push({ ...ta[i], kind: 'turnA' });
        if (tb[i] && picks.length < want) picks.push({ ...tb[i], kind: 'turnB' });
      }
    }
    return picks;
  }

  function templateWhy(cmp, p) {
    const A = people.a.label, B = people.b.label;
    const me = (l) => (/^(me|i)$/i.test(String(l).trim()) ? 'my' : `${l}'s`);
    if (p.kind === 'shared') return `In both lists: ${rankText(p.ra, cmp.depth)} in ${cmp.listNames.a}, ${rankText(p.rb, cmp.depth)} in ${cmp.listNames.b}.`;
    const [own, other, ownList, otherLabel] = p.kind === 'turnA' ? [p.ra, p.rb, cmp.listNames.a, B] : [p.rb, p.ra, cmp.listNames.b, A];
    const tail = other <= cmp.depth ? ` Of that top 10, it is the one ${/^(me|i)$/i.test(otherLabel) ? 'I' : otherLabel} would mind least (${rankText(other, cmp.depth)} in ${me(otherLabel)} list).` : '';
    return `${rankText(own, cmp.depth)} in ${ownList}.${tail}`;
  }

  // Place a name the model gave WITHOUT Qloo into both people's first-pass lists for that part of the day.
  async function placeAlone(slotId, name) {
    const cmp = (history.get(slotId) || [])[0] || last.get(slotId);
    if (!cmp || cmp.skipped || !name) return null;
    const type = `urn:entity:${cmp.slotDef.type}`;
    const found = await qloo.search(String(name).slice(0, 80), 3, `${cmp.slot.title}: look up what the model said alone ("${String(name).slice(0, 40)}")`, type);
    const hit = (found.results || [])[0];
    if (!hit) { alone.set(slotId, { said: String(name).slice(0, 80), found: null }); return alone.get(slotId); }
    const q = { 'filter.type': type, 'filter.results.entities': hit.entity_id, take: 1, ...(cmp.slotDef.usesCity && city ? { 'filter.location.query': city } : {}) };
    const sc = async (who) => entities(await qloo.insights({ ...q, 'signal.interests.entities': idsOf(who), 'signal.demographics.age': people[who].age || undefined }, `${cmp.slot.title}: score "${hit.name}" for ${people[who].label}`))[0]?.query?.affinity;
    const [fa, fb] = await Promise.all([sc('a'), sc('b')]);
    const n = (x) => String(x || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const isFav = (w) => fav[w].some((f) => f.id === hit.entity_id || n(f.phrase) === n(name) || n(f.name) === n(hit.name));
    const favOf = isFav('a') ? people.a.label : isFav('b') ? people.b.label : null;
    const r = { said: String(name).slice(0, 80), found: hit.name, favouriteOf: favOf, ra: Math.min(ownRank(fa, cmp.listA.map((e) => e.query?.affinity ?? 0)), cmp.depth + 1), rb: Math.min(ownRank(fb, cmp.listB.map((e) => e.query?.affinity ?? 0)), cmp.depth + 1), depth: cmp.depth };
    alone.set(slotId, r);
    return r;
  }

  // Output cards for a part of the day.
  function slotResult(slotId) {
    const cmp = last.get(slotId);
    if (!cmp) return null;
    if (cmp.skipped) return { slot: cmp.slot, skipped: cmp.skipped };
    const ch = chosen.get(slotId) || { picks: [], whyBy: 'none' };
    const picks = ch.picks.map((p) => {
      const ent = cmp.pool.get(p.id);
      return {
        id: ent.id, name: ent.name, alt: ent.alt, sub: ent.sub, desc: ent.desc, image: ent.image,
        kind: p.kind, source: cmp.sourceOf.get(p.id), ra: Math.min(p.ra, cmp.depth + 1), rb: Math.min(p.rb, cmp.depth + 1), depth: cmp.depth,
        affinity: { a: round3(cmp.affA.get(p.id)), b: round3(cmp.affB.get(p.id)) },
        about: aboutTags(ent.tags), kidTag: hasKidTag(ent.tagIds), alcoholTag: hasAlcoholTag(ent.tagIds),
        why: p.why || templateWhy(cmp, p), whyBy: p.whyBy || (p.why ? 'model' : 'template'),
      };
    });
    const earlier = history.get(slotId) || [];
    const first = earlier.find((h) => !h.skipped);
    const replanned = first ? {
      before: { lists: first.listNames, topA: first.listA.slice(0, 3).map((e) => e.name), topB: first.listB.slice(0, 3).map((e) => e.name), checks: first.checks.filter((c) => c.kind !== 'no_overlap').map((c) => c.text) },
      after: { lists: cmp.listNames, topA: cmp.listA.slice(0, 3).map((e) => e.name), topB: cmp.listB.slice(0, 3).map((e) => e.name) },
      reason: cmp.replanReason || '',
    } : null;
    return { slot: cmp.slot, picks, naive: cmp.naive && { name: cmp.naive.name, ra: cmp.naive.ra, rb: cmp.naive.rb, depth: cmp.naive.depth }, overlapCount: cmp.overlap.length, poolSize: cmp.pool.size, lists: cmp.listNames, lunchFilter: cmp.opts.lunch, checks: cmp.checks.map((c) => c.text), replanned, alone: alone.get(slotId) || null };
  }

  return {
    people, fav, audience, kidSafe, city, last, history, chosen, used,
    resolveAll, findGenreTag, genresOf, compare, summary, placeAlone, alone, validatePicks, setChoice, autoPicks, templateWhy, slotResult,
  };
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
