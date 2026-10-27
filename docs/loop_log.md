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
