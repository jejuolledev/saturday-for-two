import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownRank, bridgeKey, normalizeRequest, orderCandidates, clean, rankText, SHARED_MAX_RANK } from '../lib/agent.mjs';
import { createGuard } from '../lib/guard.mjs';
import { createQloo } from '../lib/qloo.mjs';

test('ownRank places an affinity inside a descending list', () => {
  const own = [0.95, 0.9, 0.85, 0.8];
  assert.equal(ownRank(0.96, own), 1);
  assert.equal(ownRank(0.95, own), 1); // ties count as the same place
  assert.equal(ownRank(0.86, own), 3);
  assert.ok(ownRank(0.5, own) > own.length);
  assert.equal(ownRank(undefined, own), 999);
  assert.equal(ownRank(0.9, []), 999);
});

test('bridgeKey is decided by the worse of the two ranks', () => {
  assert.ok(bridgeKey(10, 12) < bridgeKey(2, 40));
  assert.ok(bridgeKey(5, 12) < bridgeKey(12, 12));
});

test('rankText never shows a fake precise rank beyond the list', () => {
  assert.equal(rankText(7, 100), '#7');
  assert.equal(rankText(101, 100), 'outside top 100');
  assert.equal(rankText(SHARED_MAX_RANK + 5), `outside top ${SHARED_MAX_RANK}`);
});

test('normalizeRequest trims, caps and rejects empty people', () => {
  const r = normalizeRequest({ a: { label: '<b>Gran</b>', likes: ['  BTS ', '', 'x'.repeat(200), 'a', 'b'] }, b: { likes: '' }, city: ' Seoul ' });
  assert.ok(!r.a.label.includes('<'));
  assert.equal(r.a.likes.length, 3);
  assert.equal(r.a.likes[1].length, 60);
  assert.equal(r.city, 'Seoul');
  assert.equal(r.errors.length, 1);
  assert.equal(r.b.label, 'Person B');
});

test('normalizeRequest drops unknown age bands', () => {
  const r = normalizeRequest({ a: { likes: ['x'], age: 'old' }, b: { likes: ['y'], age: '55_and_older' } });
  assert.equal(r.a.age, '');
  assert.equal(r.b.age, '55_and_older');
});

test('orderCandidates prefers exact names, skips cities', () => {
  const out = orderCandidates('Minecraft', [
    { name: 'Minecraft Dungeons', popularity: 0.99, types: ['urn:entity:videogame'] },
    { name: 'Minecraft', popularity: 0.5, types: ['urn:entity:brand'] },
    { name: 'Minecraft', popularity: 0.9, types: ['urn:entity:locality'] },
  ]);
  assert.equal(out[0].name, 'Minecraft');
  assert.equal(out[0].types[0], 'urn:entity:brand');
  assert.equal(out.length, 2);
});

test('clean removes control characters and angle brackets', () => {
  assert.equal(clean('a\u0000<script>b'), 'a script b');
});

test('guard limits per connection and per day', () => {
  const allow = createGuard({ perIp: 2, windowMs: 1000, perDay: 3 });
  assert.ok(allow('1', 0).ok);
  assert.ok(allow('1', 1).ok);
  assert.equal(allow('1', 2).ok, false);
  assert.ok(allow('2', 3).ok);
  assert.equal(allow('3', 4).ok, false); // day cap reached
});

test('Qloo client sends the key only as a header and never records it', async () => {
  const seen = [];
  const fake = async (url, opts) => { seen.push({ url, opts }); return new Response(JSON.stringify({ success: true, results: { entities: [] } }), { status: 200 }); };
  const q = createQloo({ baseUrl: 'https://example.test/', apiKey: 'SECRET-123', fetchImpl: fake, limiter: async () => {} });
  await q.insights({ 'filter.type': 'urn:entity:movie', take: 1 }, 'note');
  assert.equal(seen[0].opts.headers['X-Api-Key'], 'SECRET-123');
  assert.ok(!seen[0].url.includes('SECRET'));
  assert.ok(!JSON.stringify(q.calls).includes('SECRET'));
});

test('Qloo client retries once on 429 and then succeeds', async () => {
  let n = 0;
  const fake = async () => (++n === 1 ? new Response('{}', { status: 429 }) : new Response(JSON.stringify({ results: { entities: [{ entity_id: 'x' }] } }), { status: 200 }));
  const q = createQloo({ baseUrl: 'https://example.test', apiKey: 'k', fetchImpl: fake, limiter: async () => {} });
  const r = await q.insights({ 'filter.type': 'urn:entity:movie' });
  assert.equal(r.results.entities.length, 1);
  assert.equal(n, 2);
});

import { englishShort } from '../lib/agent.mjs';
test('englishShort prefers the English description', () => {
  assert.equal(englishShort({ short_descriptions: [{ value: 'Groupe', languages: ['fr'] }, { value: 'Band', languages: ['en'] }] }), 'Band');
  assert.equal(englishShort({ short_description: 'Lake' }), 'Lake');
  assert.equal(englishShort({}), '');
});

test('normalizeRequest: audience levels and old kidSafe flag', () => {
  const base = { a: { likes: ['x'] }, b: { likes: ['y'] } };
  assert.equal(normalizeRequest({ ...base, audience: 'teen' }).audience, 'teen');
  assert.equal(normalizeRequest({ ...base, kidSafe: true }).audience, 'child');
  assert.equal(normalizeRequest({ ...base }).audience, 'adults');
  assert.equal(normalizeRequest({ ...base, audience: 'nope' }).audience, 'adults');
});
