// Measures the planner against the "one mixed call" baseline on fixed pairs.
// Writes aggregate numbers to docs/measurements.md. Raw Qloo results go to
// measurements-raw/ (git-ignored: Qloo data must not be published in a repo).
//   npm run measure
import { mkdir, writeFile } from 'node:fs/promises';
import { createQloo } from '../lib/qloo.mjs';
import { planSaturday, normalizeRequest } from '../lib/agent.mjs';

const PAIRS = [
  { a: { label: 'Grandma', likes: ['Lim Young-woong'], age: '55_and_older' }, b: { label: 'Grandkid', likes: ['Minecraft', 'Pokémon'], age: '24_and_younger' }, city: 'Seoul', kidSafe: true },
  { a: { label: 'Dad', likes: ['Metallica', 'The Godfather'], age: '45_to_54' }, b: { label: 'Daughter', likes: ['Olivia Rodrigo', 'Stranger Things'], age: '24_and_younger' }, city: 'New York' },
  { a: { label: 'Roommate 1', likes: ['Radiohead', 'The Grand Budapest Hotel'], age: '30_to_34' }, b: { label: 'Roommate 2', likes: ['Bad Bunny', 'Fast & Furious'], age: '25_to_29' }, city: 'London' },
  { a: { label: 'Grandpa', likes: ['Frank Sinatra', 'Casablanca'], age: '55_and_older' }, b: { label: 'Grandkid', likes: ['Bluey', 'Frozen'], age: '24_and_younger' }, city: 'Chicago', kidSafe: true },
  { a: { label: 'Mom', likes: ['Taylor Swift', 'Gilmore Girls'], age: '35_to_44' }, b: { label: 'Son', likes: ['Fortnite', 'Spider-Man'], age: '24_and_younger' }, city: 'Los Angeles' },
  { a: { label: 'Partner 1', likes: ['BTS', 'Squid Game'], age: '25_to_29' }, b: { label: 'Partner 2', likes: ['Pink Floyd', 'Star Wars'], age: '30_to_34' }, city: 'Tokyo' },
  { a: { label: 'Aunt', likes: ['Adele', 'Downton Abbey'], age: '45_to_54' }, b: { label: 'Nephew', likes: ['Travis Scott', 'Call of Duty'], age: '24_and_younger' }, city: 'London' },
  { a: { label: 'Grandma', likes: ['Elvis Presley', 'The Sound of Music'], age: '55_and_older' }, b: { label: 'Grandson', likes: ['MrBeast', 'Spider-Man'], age: '24_and_younger' }, city: 'Paris', kidSafe: true },
];

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : 'n/a');

const raw = [];
const rows = [];
for (const body of PAIRS) {
  const plan = await planSaturday(createQloo({ cache: new Map() }), normalizeRequest(body));
  raw.push({ input: body, plan });
  if (!plan.ok) { rows.push({ pair: `${body.a.likes.join('+')} × ${body.b.likes.join('+')}`, error: plan.error }); continue; }
  for (const s of plan.slots) {
    if (s.skipped) { rows.push({ pair: `${body.a.likes.join('+')} × ${body.b.likes.join('+')}`, slot: s.slot.id, skipped: true }); continue; }
    const first = s.picks[0];
    rows.push({
      pair: `${body.a.likes.join('+')} × ${body.b.likes.join('+')}`, slot: s.slot.id, type: s.slot.type, depth: first?.depth,
      overlap: s.overlapCount, shared: first?.kind === 'shared',
      ourWorse: first?.kind === 'shared' ? Math.max(first.ra, first.rb) : null,
      naiveWorse: s.naive ? Math.max(s.naive.ra, s.naive.rb) : null,
      naiveOutside: s.naive ? (s.naive.ra > s.naive.depth || s.naive.rb > s.naive.depth) : null,
      naiveSame: s.naive && first ? s.naive.name === first.name : null,
    });
  }
  rows.at(-1).ms = plan.stats.ms;
  rows.at(-1).calls = plan.stats.qlooCalls;
  raw.at(-1).stats = plan.stats;
  console.error(`done: ${body.a.likes[0]} × ${body.b.likes[0]} (${plan.stats?.qlooCalls} calls, ${plan.stats?.ms} ms)`);
}

await mkdir('measurements-raw', { recursive: true });
await writeFile(`measurements-raw/run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(raw, null, 1));

const ok = rows.filter((r) => r.slot && !r.skipped);
const byType = (t) => ok.filter((r) => (t === 'place' ? r.type === 'place' : r.type !== 'place'));
const stats = raw.filter((r) => r.stats).map((r) => r.stats);
const lines = [];
lines.push('# Measurements', '');
lines.push(`Run: ${new Date().toISOString()} · ${PAIRS.length} fixed pairs × 5 parts of the day · live Qloo hackathon API · no cache.`, '');
lines.push('How to read: for each part of the day the agent fetches each person\'s own Qloo list (top 100 places in the city, top 200 films / artists / shows). A pick is "shared" only if it is in both lists. "Worse rank" is the lower of the two people\'s ranks for that pick. The baseline is one Qloo call with both people\'s favourites mixed together, top result.', '');
lines.push('These numbers say how well each pick sits in Qloo\'s own taste lists for both people. They do not measure whether real people enjoyed the day; that has not been tested.', '');
lines.push('| | Places (morning + lunch) | Films, artists, shows |', '|---|---|---|');
for (const [label, f] of [
  ['Parts of the day planned', (rs) => rs.length],
  ['…with at least one item in both people\'s lists (overlap > 0)', (rs) => `${rs.filter((r) => r.overlap > 0).length} (${pct(rs.filter((r) => r.overlap > 0).length, rs.length)})`],
  ['…where the plan has a shared pick', (rs) => `${rs.filter((r) => r.shared).length} (${pct(rs.filter((r) => r.shared).length, rs.length)})`],
  ['…where the plan honestly falls back to taking turns', (rs) => `${rs.filter((r) => !r.shared).length}`],
  ['Mixed-call baseline: top pick is outside at least one person\'s list', (rs) => { const n = rs.filter((r) => r.naiveOutside !== null); return `${n.filter((r) => r.naiveOutside).length} of ${n.length} (${pct(n.filter((r) => r.naiveOutside).length, n.length)})`; }],
  ['When shared: median worse rank, agent pick', (rs) => median(rs.filter((r) => r.shared).map((r) => r.ourWorse)) ?? 'n/a'],
  ['When shared: median worse rank, mixed-call pick (outside list counted as list length + 1)', (rs) => median(rs.filter((r) => r.shared && r.naiveWorse != null).map((r) => r.naiveWorse)) ?? 'n/a'],
  ['When shared: mixed call picked the same item', (rs) => `${rs.filter((r) => r.shared && r.naiveSame).length} of ${rs.filter((r) => r.shared).length}`],
]) lines.push(`| ${label} | ${f(byType('place'))} | ${f(byType('media'))} |`);
lines.push('');
lines.push(`Speed: median ${(median(stats.map((s) => s.ms)) / 1000).toFixed(1)} s per plan (min ${(Math.min(...stats.map((s) => s.ms)) / 1000).toFixed(1)}, max ${(Math.max(...stats.map((s) => s.ms)) / 1000).toFixed(1)}), median ${median(stats.map((s) => s.qlooCalls))} Qloo calls per plan. The hackathon key allows 10 calls per second, so the agent paces itself at 8.`, '');
const failed = rows.filter((r) => r.error || r.skipped);
lines.push(`Pairs that failed or slots skipped: ${failed.length}.`, '');
lines.push('## Per pair', '', '| Pair | Part of day | Overlap in both lists | Shared pick? | Agent worse rank | Mixed-call worse rank |', '|---|---|---|---|---|---|');
for (const r of rows) {
  if (r.error) { lines.push(`| ${r.pair} | — | error: ${r.error} | | | |`); continue; }
  if (r.skipped) { lines.push(`| ${r.pair} | ${r.slot} | skipped | | | |`); continue; }
  const rt = (x) => (x == null ? '—' : x > r.depth ? `outside top ${r.depth}` : `#${x}`);
  lines.push(`| ${r.pair} | ${r.slot} | ${r.overlap} of top ${r.depth} | ${r.shared ? 'yes' : 'no, take turns'} | ${rt(r.ourWorse)} | ${rt(r.naiveWorse)} |`);
}
await mkdir('docs', { recursive: true });
await writeFile('docs/measurements.md', lines.join('\n') + '\n');
console.log(lines.slice(0, 20).join('\n'));
