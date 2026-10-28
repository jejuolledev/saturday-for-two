# Improvement loop log

Each loop: change → tests + `scripts/measure.mjs` on the live Qloo API → an independent judge (a fresh agent that never saw our reasoning) scores the entry on the hackathon's four equal criteria against the 2025 winners, using five review methods (judge panel, 100-entrants overlap, blind ranking among past winners, red team, demo test) plus a business check. We stop when the judge rates it top-3 likely, or when two loops in a row add fewer than 3 points.

## Loop 0 — starting point (27 Oct, before this log)

Deterministic pipeline, no language model. Measured against one mixed Qloo call. Known weaknesses: "agentic" with no model and a fixed five-slot pipeline; a trot fan got K-pop and R&B; a child's lunch could be at a place tagged as serving alcohol.

## Loop 1 — agent loop, genre and kids' lunch fixes (27–28 Oct)

Changes:
- Real planner loop: a language model (any OpenAI-compatible endpoint; measured with NVIDIA Nemotron 3.5 Lightning via Meterless Nightshift) reads the first-pass comparisons and their checks, decides which Qloo calls to make again (`compare` with a genre or lunch filter, `find_genre_tag`), chooses by reference, explains, and summarises. Picks validated; every sentence checked against Qloo's data (`lib/ground.mjs`). Rule-based planner with the same tools when no model is reachable, labelled on the page.
- Genre check: a favourite's Qloo genre tested against the person's own top 10 in one call; re-plan within the genre when 2 or fewer of 10 match.
- Kids' lunch: restaurants tagged good for kids (tag intersection), every alcohol tag excluded.
- New baseline: the same model without Qloo.
- Page: re-plan card (first pass struck through → second call), reasons with "checked against Qloo", planner badge, day summary, "who would use this".

Judge (loop 1, fresh agent; the full method brief did not reach it, so it scored on the four criteria directly): **29 / 40** — Technological Implementation 8.5, Design 7, Potential Impact 6.5, Quality of the Idea 7. Verdict: can win a prize if deployed. Top fixes: deploy with the model planner and a warm cache; the hero film (*Sgt. Stubby*) looked worse than the naive pick (*Ralph Breaks the Internet*); no child-safety filter on music (a hip-hop artist as the kid's turn); music turns 2:1; Korean names without romanisation; "only 0 of" wording.

## Loop 2 — judge fixes (28 Oct)

Changes:
- With a child in the car, the youngest person's artists come only from artists Qloo tags family-friendly (`urn:tag:audience:qloo:family_friendly`, `urn:tag:style:qloo:family_friendly`); if Qloo has fewer than 3, their own list is used and the plan says so. (Qloo's `explicit` tags were tested first: none of the kid's top artists carry them, so they filter nothing.)
- Music turns are even: two each when nothing is shared.
- Non-Latin names show Qloo's own Latin-script alias (e.g. 홍진영 · Hong Jin-young).
- Hero example: Grandma loves Lim Young-woong **and Reply 1988** (a Korean family drama). The shared film becomes *Coco* (#45 for Grandma, #15 for the kid) instead of *Sgt. Stubby*; we tried three second favourites and kept the one whose picks read best, and say so here.
- Planner refuses no-op re-plans (same options again); invalid picks are logged.
- Wording: "none of Grandma's top 10", turns no longer say "minds least" when the other person has it outside their list.
- Daily plan cap per instance 80 → 200 for the judging weeks.

Judge (loop 2, fresh agent with the full method brief: judge panel, 100-entrants overlap, blind ranking among the 2025 winners, red team, demo test, business): **25.7 / 40** (Technological Implementation 7.3, Design 6.3, Potential Impact 5.3, Quality of the Idea 6.7), business 5/10, blind rank 4th and 5th of 8, verdict "borderline to unlikely". The drop from loop 1 is mostly the stricter method (loop 1's judge did not get the brief), not a regression. Top fixes: deploy with a reliable model and warm presets; show the LLM-only baseline on the page; put the re-plan story at the top; kid songs (a 1992 baby novelty hit came first); romanise every non-Latin name; the places overlap is trivial where Qloo has fewer than 100 places; pick one buyer; doc mismatches (daily cap, "8 cities" = 7, model timing, trot wording, a typo).

## Loop 3 — make the agent's value visible (28 Oct)

Changes:
- **The same model, asked alone, on every card.** While Qloo works, the model is asked (one tool call) for a film, artist, show and lunch place both would enjoy; each answer is looked up in Qloo and placed in both people's lists, next to the agent's pick. When it simply repeats one person's favourite, the card says so; when it agrees with the agent, the card says that too.
- **"What the agent did" box** at the top of the plan: every re-plan and filter in one list.
- **Outing kinds:** the model may narrow the morning to kinds of place that fit both people (aquarium, science museum, planetarium, arcade … — Qloo category tags) and go back if both rank it worse. A decision the rules never make.
- Kid songs: family-friendly artists with a popularity floor (Qloo `filter.popularity.min=0.9`), so the first pick is not a 1992 baby novelty hit.
- Hangul names without a Qloo alias are romanised on the page (Revised Romanization, marked as done by the page).
- Grounding check: Unicode hyphens normalised; tags and description words of the chosen picks allowed in the day summary (it was rejecting "Korean" and "Baby‑Sitters").
- `POST /api/plan` with `"stream": false` returns one JSON plan (the partner API).
- README: one first buyer (family day-out and travel apps), places-overlap caveat, fixed mismatches.

Measured after loop 3 (final code, 28 Oct): the same model alone put 1 of 24 films/artists/shows in both people's lists and repeated a typed favourite 12 times; one mixed Qloo call was outside a person's list 10 of 24 times; the agent shared 17 of 24; a child's lunch with an alcohol tag 6 of 8 → 0 of 8; the model planner finished 7 of 8 plans itself (median 77 s). Every number in `docs/measurements.md`.

Pre-deploy QA (fresh agent: real use, key exposure, overclaims, measurement reproduction): 2 🔴, 7 🟡, all fixed — when the model stopped early the rules skipped the genre re-plan (now the rules re-plan the parts the model left), degraded plans were cached for 6 hours (now 5 minutes), the planner label claimed the model planned when the rules had, oversized requests crashed the local server, timings and call counts understated, one wrong restaurant match noted, Node 20.6. Key: not in history, files, responses or the call log. All headline numbers reproduced from the raw run.

Deployment: public repository and Vercel. Vercel first picked `public/app.js` as a server entrypoint (renamed to `main.js`, `framework: null`). With a teenager, lunch now also leaves out restaurants with alcohol tags (a Dad & teen plan had put an Irish pub first).

Judge (loop 3, fresh agent, same full method brief, judging the live site): **25.6 / 40** (Tech 7.3, Design 6.7, Impact 5.3, Idea 6.3), business 5/10, blind rank 5th and 4th of 8, "borderline to unlikely". Two loops in a row moved the score by less than 3 points (25.7 → 25.6), so the loop stops here. What the judge says would move it most is not code: (1) a model key on the live site so judges see the model planner and the "asked alone, without Qloo" line (the hosted demo runs the rule-based planner until a key is set), (2) a named buyer and a small real-person check. Applied at once: a measured-results strip at the top of every plan, a GitHub link, form wording ("when a model is configured"), the median caveat in the README table.
