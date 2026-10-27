// Shared helpers for the planner (pure functions and constants).
export const rankText = (r, depth = SHARED_MAX_RANK) => (r <= depth ? `#${r}` : `outside top ${depth}`);

// "Me" becomes "my", everything else gets 's.
export const poss = (label) => (/^(me|i)$/i.test(String(label).trim()) ? 'my' : `${label}'s`);

export const ageText = (band) => ({ '24_and_younger': 'under 25', '25_to_29': '25-29', '30_to_34': '30-34', '35_to_44': '35-44', '45_to_54': '45-54', '55_and_older': '55+' }[band] || 'any age');

export const AGE_BANDS = ['24_and_younger', '25_to_29', '30_to_34', '35_to_44', '45_to_54', '55_and_older'];

export const PLACE_TAG = (s) => `urn:tag:category:place:${s}`;

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
  { id: 'movie', time: '15:00', title: 'Afternoon movie', type: 'movie', depth: 200, ratings: { child: 'G,PG', teen: 'G,PG,PG-13' } },
  { id: 'music', time: 'On the way', title: 'Songs for the car', type: 'artist', depth: 200, count: 3 },
  { id: 'evening', time: '19:30', title: 'One episode before bed', type: 'tv_show', depth: 200, ratings: { child: 'TV-Y,TV-Y7,TV-G,TV-PG,G,PG', teen: 'TV-Y,TV-Y7,TV-G,TV-PG,TV-14,G,PG,PG-13' } },
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
  // Who is coming along: 'child' (films and shows G/PG, no bars), 'teen' (up to PG-13 / TV-14, no bars), or 'adults'.
  const audience = ['child', 'teen', 'adults'].includes(body?.audience) ? body.audience : body?.kidSafe ? 'child' : 'adults';
  const kidSafe = audience !== 'adults';
  const errors = [];
  if (!a.likes.length) errors.push(`Add at least one thing ${a.label} loves.`);
  if (!b.likes.length) errors.push(`Add at least one thing ${b.label} loves.`);
  return { a, b, city, audience, kidSafe, errors };
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

export const shortType = (types) => (types?.[0] || '').split(':').pop().replace('videogame', 'video game').replace('tv_show', 'TV show');

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
export const round3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);

// Qloo short descriptions come in several languages; use the English one when there is one.
export function englishShort(p) {
  const list = Array.isArray(p.short_descriptions) ? p.short_descriptions : [];
  const en = list.find((d) => (d.languages || []).some((l) => String(l).startsWith('en')));
  return en?.value || p.short_description || p.plot_summary || '';
}

export function entityOf(e) {
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
    tagIds: (e.tags || []).map((t) => t.tag_id || t.id).filter(Boolean),
  };
}

export const slotInfo = (s) => ({ id: s.id, time: s.time, title: s.title, type: s.type });
export const entities = (body) => body?.results?.entities || [];
export const errText = (body) => body?.errors?.[0]?.message || '';


// Shorten long id lists in the visible trace; nothing secret is in params.
export function redactParams(params) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    const s = String(v);
    out[k] = s.length > 90 ? `${s.slice(0, 80)}… (${s.split(',').length} ids)` : s;
  }
  return out;
}
