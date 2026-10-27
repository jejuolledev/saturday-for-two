const PRESETS = {
  grandma: { aLabel: 'Grandma', aLike1: 'Lim Young-woong', aLike2: '', aLike3: '', aAge: '55_and_older', bLabel: 'Me', bLike1: 'Minecraft', bLike2: 'Pokémon', bLike3: '', bAge: '24_and_younger', city: 'Seoul', audience: 'child' },
  dad: { aLabel: 'Dad', aLike1: 'Metallica', aLike2: 'The Godfather', aLike3: '', aAge: '45_to_54', bLabel: 'Maya', bLike1: 'Olivia Rodrigo', bLike2: 'Stranger Things', bLike3: '', bAge: '24_and_younger', city: 'New York', audience: 'teen' },
  roommates: { aLabel: 'Sam', aLike1: 'Radiohead', aLike2: 'The Grand Budapest Hotel', aLike3: '', aAge: '30_to_34', bLabel: 'Jo', bLike1: 'Bad Bunny', bLike2: 'Fast & Furious', bLike3: '', bAge: '25_to_29', city: 'London', audience: 'adults' },
};

const $ = (s) => document.querySelector(s);
const form = $('#form');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rank = (r, depth) => (r <= depth ? `#${r}` : `outside top ${depth}`);
const poss = (l) => (/^(me|i)$/i.test(String(l).trim()) ? 'my' : `${l}'s`);
const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const SLOT_ICON = { morning: '🌳', lunch: '🍜', movie: '🎬', music: '🎧', evening: '📺' };
const SLOT_NOUN = { morning: 'place', lunch: 'restaurant', movie: 'film', music: 'artist', evening: 'show' };

document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
  const p = PRESETS[b.dataset.preset];
  for (const [k, v] of Object.entries(p)) {
    const el = form.elements[k];
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = v; else el.value = v;
  }
  form.requestSubmit();
}));

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = form.elements;
  const body = {
    a: { label: f.aLabel.value, likes: [f.aLike1.value, f.aLike2.value, f.aLike3.value], age: f.aAge.value },
    b: { label: f.bLabel.value, likes: [f.bLike1.value, f.bLike2.value, f.bLike3.value], age: f.bAge.value },
    city: f.city.value,
    audience: f.audience.value,
  };
  $('#error').hidden = true;
  $('#result').hidden = true;
  $('#steps').innerHTML = '';
  $('#working').hidden = false;
  $('#go').disabled = true;
  $('#working').scrollIntoView({ behavior: 'smooth', block: 'center' });
  try {
    const res = await fetch('api/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok || !res.body) throw new Error(`The server answered ${res.status}.`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let done = false;
    while (!done) {
      const chunk = await reader.read();
      done = chunk.done;
      buf += dec.decode(chunk.value || new Uint8Array(), { stream: !done });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) handle(JSON.parse(line));
      }
    }
  } catch (e) {
    showError(e.message || 'Could not reach the planner.');
  } finally {
    $('#working').hidden = true;
    $('#go').disabled = false;
  }
});

function handle(msg) {
  if (msg.type === 'step') {
    const li = document.createElement('li');
    if (msg.step === 'decide' || msg.step === 'planner') { li.className = 'decide'; li.textContent = (msg.step === 'decide' ? 'Agent: ' : '') + msg.detail; }
    else li.textContent = msg.detail;
    $('#steps').appendChild(li);
    li.scrollIntoView({ block: 'nearest' });
  } else if (msg.type === 'plan') render(msg.plan);
  else if (msg.type === 'error') showError(msg.error);
}

function showError(text) {
  const e = $('#error');
  e.textContent = text;
  e.hidden = false;
}

function about(p) {
  return p.about?.length ? `<p class="why">${p.about.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}</p>` : '';
}

function card(p, A, B, slot) {
  const img = p.image ? `<img src="${esc(p.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  let head = '';
  if (p.kind === 'turnA') head = `<p class="turn ta">${esc(cap1(poss(A)))} turn</p>`;
  if (p.kind === 'turnB') head = `<p class="turn tb">${esc(cap1(poss(B)))} turn</p>`;
  return `<div class="pick ${p.kind}">${img}<div class="pick-body">${head}
    <h4>${esc(p.name)}</h4>${p.desc ? `<p class="desc">${esc(p.desc)}</p>` : ''}${p.sub ? `<p class="sub">${esc(p.sub)}</p>` : ''}
    <p class="ranks"><span class="ra">${esc(A)}: ${rank(p.ra, p.depth)}</span><span class="rb">${esc(B)}: ${rank(p.rb, p.depth)}</span>${slot.id === 'lunch' && p.kidTag ? '<span class="safe">good for kids · no alcohol listed</span>' : ''}</p>
    ${p.why ? `<p class="reason">${esc(p.why)}${p.whyBy === 'model' ? ' <span class="checked" title="Written by the model, then checked: every name, tag and rank in it is in Qloo\'s data for this plan.">checked against Qloo</span>' : ''}</p>` : ''}
    ${about(p)}</div></div>`;
}

function render(plan) {
  const A = plan.people.a.label;
  const B = plan.people.b.label;
  const likes = (p) => p.likes.map((l) => l.name).join(' + ');
  $('#result-title').textContent = `${A} & ${B}: Saturday${plan.city ? ` in ${plan.city}` : ''}`;
  const shared = plan.slots.filter((s) => s.picks?.some((p) => p.kind === 'shared')).length;
  const total = plan.slots.filter((s) => s.picks?.length).length;
  let sub = `${likes(plan.people.a)} meets ${likes(plan.people.b)}. ${shared} of ${total} parts of the day have a pick that is in both of your own Qloo lists (top 100 places, top 200 films, artists and shows).`;
  const miss = [...plan.unresolved.a, ...plan.unresolved.b];
  if (miss.length) sub += ` Qloo had no taste data for: ${miss.join(', ')}.`;
  sub += ` ${plan.stats.qlooCalls} Qloo calls${plan.fromCache ? ' (shown from the server cache)' : `, ${(plan.stats.ms / 1000).toFixed(1)} s`}.`;
  $('#result-sub').textContent = sub;
  const pl = plan.planner || {};
  $('#planner').innerHTML = pl.kind === 'model'
    ? `<b>Planned by ${esc(pl.model)}</b> via ${esc(pl.provider)}: it chose what to re-ask Qloo (${pl.replans || 0} re-plan${pl.replans === 1 ? '' : 's'}), picked, and wrote the reasons. Every pick is a Qloo entity; every sentence was checked against Qloo's data (${pl.rejectedWhy || 0} rejected and rewritten or replaced).${pl.ruleParts?.length ? ` The rule-based planner finished: ${esc(pl.ruleParts.join(', '))}.` : ''}`
    : '<b>Rule-based planner</b> (no language model configured on this server): the same Qloo tools and checks, fixed rules for re-planning, template sentences.';
  $('#summary').textContent = plan.summary || '';
  $('#summary').hidden = !plan.summary;

  $('#timeline').innerHTML = plan.slots.map((s) => {
    const icon = SLOT_ICON[s.slot.id] || '•';
    if (s.skipped) return `<li class="slot skipped"><div class="time">${esc(s.slot.time)}</div><div class="slot-body"><h3>${icon} ${esc(s.slot.title)}</h3><p class="sub">${esc(s.skipped)}</p></div></li>`;
    const isTurns = s.picks.some((p) => p.kind !== 'shared');
    const note = isTurns && !s.picks.some((p) => p.kind === 'shared')
      ? `<p class="honest">No ${SLOT_NOUN[s.slot.id]} is in both of your own top ${s.picks[0].depth} lists, so: take turns. Each pick comes from one person's top 10, the one the other person minds least.</p>`
      : isTurns ? `<p class="honest">Only ${s.picks.filter((p) => p.kind === 'shared').length} shared; the rest is taking turns.</p>` : '';
    const naive = s.naive && !s.picks.some((p) => p.name === s.naive.name)
      ? `<p class="naive">Mixing everyone's likes into one Qloo call would have picked <b>${esc(s.naive.name)}</b>: ${rank(s.naive.ra, s.naive.depth)} for ${esc(A)}, ${rank(s.naive.rb, s.naive.depth)} for ${esc(B)}.</p>` : '';
    const rp = s.replanned;
    const replan = rp ? `<div class="replan"><p class="replan-h">The agent re-planned this</p>
      <p>${rp.before.checks.map(esc).join(' ') || esc(rp.reason)}</p>
      <div class="ba"><div><span class="lab">First pass · ${esc(rp.before.lists.a)}</span>${rp.before.topA.map((n) => `<span class="tag strike">${esc(n)}</span>`).join(' ')}</div>
      <div><span class="lab">Re-asked Qloo · ${esc(rp.after.lists.a)}</span>${rp.after.topA.map((n) => `<span class="tag ta">${esc(n)}</span>`).join(' ')}</div></div>
      ${rp.after.lists.b !== rp.before.lists.b ? `<div class="ba"><div><span class="lab">First pass · ${esc(rp.before.lists.b)}</span>${rp.before.topB.map((n) => `<span class="tag strike">${esc(n)}</span>`).join(' ')}</div><div><span class="lab">Re-asked Qloo · ${esc(rp.after.lists.b)}</span>${rp.after.topB.map((n) => `<span class="tag tb">${esc(n)}</span>`).join(' ')}</div></div>` : ''}</div>` : '';
    return `<li class="slot"><div class="time">${esc(s.slot.time)}</div><div class="slot-body"><h3>${icon} ${esc(s.slot.title)}</h3>${replan}${note}
      <div class="picks">${s.picks.map((p) => card(p, A, B, s.slot)).join('')}</div>${naive}</div></li>`;
  }).join('');

  $('#trace-steps').innerHTML = plan.trace.map((t) => `<li>${esc(t.detail)}</li>`).join('');
  $('#calls tbody').innerHTML = plan.calls.map((c, i) => `<tr class="${c.ok ? '' : 'bad'}"><td>${i + 1}</td><td>${esc(c.note)}</td><td><code>${esc(c.path)}?${esc(Object.entries(c.params).map(([k, v]) => `${k}=${v}`).join('&'))}</code></td><td>${c.cached ? 'cache' : c.ms}</td></tr>`).join('');
  $('#result').hidden = false;
  $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
