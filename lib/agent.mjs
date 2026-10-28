// Saturday for Two — the planning agent.
//
// Two people with very different tastes, one Saturday. A planner (a language model when one is configured,
// otherwise fixed rules, always labelled) drives Qloo tools: look up favourites, compare both people's own
// lists for each part of the day, re-plan when a check fails (a favourite's genre missing from the list, a
// child's lunch at a place tagged as serving alcohol, nothing in common), choose, and explain the trade-offs.
// Every pick is a Qloo entity validated against the comparison; every sentence a model writes is checked
// against the Qloo data before it is shown.
export * from './util.mjs';
import { SLOTS, redactParams } from './util.mjs';
import { createEngine } from './engine.mjs';
import { runModel, runRules, rulesReplan, templateSummary } from './planner.mjs';
import { llmConfig } from './llm.mjs';

export async function planSaturday(qloo, input, { onStep, onEngine, llm = llmConfig(), budgetMs = Number(process.env.PLAN_BUDGET_MS || 90000) } = {}) {
  const t0 = Date.now();
  const trace = [];
  const say = (step, detail) => { trace.push({ step, detail }); try { onStep?.({ step, detail }); } catch {} };
  const progress = (detail) => { try { onStep?.({ step: 'progress', detail }); } catch {} };
  const { a, b } = input;
  const engine = createEngine(qloo, input, { say, progress });
  onEngine?.(engine);

  const { ra, rb } = await engine.resolveAll();
  if (!engine.fav.a.length || !engine.fav.b.length) {
    const who = !engine.fav.a.length ? a.label : b.label;
    return { ok: false, error: `Qloo has no taste data for anything we typed for ${who}. Try a better-known artist, film, show, game or brand.`, trace, resolved: { a: ra, b: rb }, calls: qloo.calls.length, ms: Date.now() - t0 };
  }

  let planner, run;
  if (llm) {
    say('planner', `Planner: ${llm.model} via ${llm.provider}. It decides which Qloo comparisons to run and explains the picks; every pick and sentence is checked against Qloo's data.`);
    run = await runModel(engine, llm, { say, deadline: t0 + budgetMs });
    planner = { kind: 'model', model: llm.model, provider: llm.provider, ...run.stats, completed: run.completed };
    // Anything the model did not finish is completed by the rules, and marked.
    const left = SLOTS.map((s) => s.id).filter((p) => !engine.chosen.has(p));
    if (left.length) {
      say('decide', `The model ${run.stats.error ? `stopped (${run.stats.error})` : 'did not finish'}; the rule-based planner completes: ${left.join(', ')}.`);
      await Promise.all(left.filter((p) => !engine.last.has(p)).map((p) => engine.compare(p)));
      // The same re-plans the rules would make (genre, kids' lunch), for the parts the model did not finish.
      await rulesReplan(engine, (t) => say('decide', `Rules: ${t}`), left);
      for (const p of left) engine.setChoice(p, engine.autoPicks(p), 'template');
      planner.ruleParts = left;
    }
  } else {
    say('planner', 'Planner: rule-based fallback (no language model configured). Same Qloo tools and checks; fixed rules decide the re-plans and the sentences are templates.');
    run = await runRules(engine, { say });
    planner = { kind: 'rules' };
  }
  const summary = run.summary || templateSummary(engine);
  const summaryBy = run.summary ? run.summaryBy : 'template';

  const slots = SLOTS.map((s) => engine.slotResult(s.id) || { slot: { id: s.id, time: s.time, title: s.title, type: s.type }, skipped: 'Not planned.' });
  const usedCalls = qloo.calls.filter((c) => !c.cached).length;
  return {
    ok: true,
    people: { a: { label: a.label, age: a.age, likes: engine.fav.a.map(({ tags, ...f }) => f) }, b: { label: b.label, age: b.age, likes: engine.fav.b.map(({ tags, ...f }) => f) } },
    unresolved: { a: ra.map((r, i) => (r ? null : a.likes[i])).filter(Boolean), b: rb.map((r, i) => (r ? null : b.likes[i])).filter(Boolean) },
    city: input.city, audience: engine.audience, kidSafe: engine.kidSafe,
    planner, decisions: run.decisions, summary, summaryBy,
    slots,
    trace,
    calls: qloo.calls.map(({ path, params, note, ms, cached, ok }) => ({ path, params: redactParams(params), note, ms, cached, ok })),
    stats: { qlooCalls: qloo.calls.length, liveCalls: usedCalls, ms: Date.now() - t0 },
  };
}
