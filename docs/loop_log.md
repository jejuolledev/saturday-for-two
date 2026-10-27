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
