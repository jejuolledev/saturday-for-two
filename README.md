# Saturday for Two

**Grandma likes trot. I like Minecraft. What do we do on Saturday?**

Type what two people love. An agent asks Qloo's taste graph where their tastes really meet and plans one Saturday: a morning outing and a lunch spot in your city, a film, songs for the car, and one episode before bed. Every pick shows where it sits in *each* person's own Qloo list. When nothing meets, it says so and you take turns. When a list looks wrong (Grandma's "music" list is full of K-pop idols although her singer is a trot star), the agent notices and re-asks Qloo.

![Saturday for Two](docs/thumbnail.png)

- Live demo: **LIVE_DEMO_URL**
- Demo video: **VIDEO_URL**
- Built for the [Qloo Agentic Hackathon 2026](https://qloo.devpost.com/) by Jeonggil Bae (MoaHub, Korea). MIT licence.

**Who pays and why.** First buyer: family day-out and travel apps, which already sell "what shall we do on Saturday" and lose the booking when the plan suits only one person. They would call the "shared plan" step as an API (`POST /api/plan` with `"stream": false` returns one JSON plan) or as an agent tool (an MCP tool is included). The same step fits ticketing apps ("which show do we both want to see") and streaming services with several profiles in one household. For Qloo it is a use case that only a per-person taste graph can serve, and every plan is dozens of Insights calls. Why now: assistants are starting to plan and book for groups, and a plan that names a real place or film has to be grounded, not invented. (No market numbers here: we have not measured any.)

## Why this needs Qloo (measured)

Live Qloo hackathon API, 8 fixed pairs × 5 parts of the day ([docs/measurements.md](docs/measurements.md), every pair listed). "In both lists" means in both people's own Qloo top 100 (places in the city) or top 200 (films, artists, shows).

| What we compared | Result |
|---|---|
| **The same language model without Qloo**, asked for a film, an artist and a show both people would enjoy (each name then looked up in Qloo) | it named 24 real titles (all found in Qloo), but **0 of 24** sat in both people's own lists, and 10 of the 24 simply repeated one person's own favourite; its lunch restaurants: **none** in both lists |
| **One mixed Qloo call** (both people's favourites and age bands together, top result), films / artists / shows | outside one person's top 200 in **10 of 24** |
| The agent, films / artists / shows | a pick in both lists in **17 of 24**; in the other 7 it says "take turns" instead of pretending |
| The agent vs the mixed call when something is shared (median of the worse of the two ranks) | **#62 vs #94** (places: #8.5 vs #15; for places the mixed call is often fine, and we say so) |
| **Grandma's trot.** Her favourite (Lim Young-woong) is tagged *Trot* in Qloo, but 0 of her own top 10 artists are | the agent re-asks Qloo within the Trot genre; her song picks become artists Qloo tags Trot (**2 of 2**) |
| **Lunch with a child.** Old filter (bars excluded) vs new (Qloo tag "good for kids", every alcohol tag excluded), 8 pairs in 7 cities | picks carrying an alcohol tag: **6 of 8 → 0 of 8**; all 8 new picks carry the "good for kids" tag and are still in both people's lists |

What these numbers do **not** show: whether real families enjoyed the day. They show where each pick sits in Qloo's lists for each person. We have not run a user study.

## Try it

1. Open the demo and press **Grandma & grandkid · Seoul** (Grandma: Lim Young-woong and the drama *Reply 1988*; the kid: Minecraft and Pokémon), or type your own two people.
2. Watch the agent work: each Qloo comparison and each decision streams in.
3. Read the plan. Each card shows:
   - **Grandma: #3 · Me: #7**: where the pick sits in each person's own Qloo list.
   - a one-line reason; **checked against Qloo** means the model wrote it and every name, tag and rank in it was verified against this plan's Qloo data.
   - **The agent re-planned this**: what the first Qloo answer looked like, why it was rejected, and what the second call returned.
   - **Mixing everyone's likes into one Qloo call would have picked …**: the obvious answer and its two ranks.
   - **Asked alone, without Qloo, the model said …**: the same model's own guess, looked up in Qloo and placed in both lists (when a model is configured). Sometimes it agrees; usually it does not, or it simply repeats one person's favourite.
   - **What the agent did** at the top: every re-plan and filter in one list.
   - **Grandma's turn / My turn** when nothing overlaps.
4. Open **Show the agent's work** for every Qloo call with its parameters (the key never reaches the browser).

## The agent

```
favourites ──/search──▶ Qloo entities (+ their tags)
                │
     first pass, all five parts in parallel: each person's own list (/v2/insights) ─▶ score every candidate for both
                │
     planner (language model, or rules) reads counts, top items and checks ─▶ re-asks Qloo where a check fails
                │                                       (genre missing, too few kid-friendly places, nothing shared)
     one chooser per part picks from the comparison by reference ─▶ picks validated, sentences checked
                │
     day summary (checked) ─▶ plan
```

**Tools the planner can call** (all are Qloo calls plus a readable rule; `lib/engine.mjs`):

- `compare(part, genre_a?, genre_b?, lunch_filter?)`: each person's own list for that part of the day (`/v2/insights` with `filter.location.query`, place category tags, `filter.hours=Saturday`, `signal.demographics.age`, `filter.content_rating` for a child or teenager, bars excluded with anyone under 18), a pool of at most 50 candidates (items in both lists first), every candidate scored for each person with `filter.results.entities` and placed inside that person's own list, the mixed-call pick for comparison, and **checks**:
  - *genre*: the favourite's Qloo genre (artist tags, or a category such as "Trot Singers" resolved with `/v2/tags`) is tested against the person's own top 10 with `filter.tags` + `filter.results.entities` in one call. 2 or fewer of 10 → re-plan within that genre.
  - *teen lunch*: with a teenager, restaurants with no Qloo alcohol tags.
  - *kids' lunch*: with a child, lunch is restaurants Qloo tags **good for kids** (tag intersection) with every alcohol tag excluded (alcohol, beer, wine, cocktails, hard liquor, full bar, happy-hour drinks …). Fewer than 20 → widen to "no alcohol tags".
  - *songs with a child*: Qloo has no lyric rating for artists, so with a child along the youngest person's artists come only from those Qloo tags family-friendly (fewer than 3 → their own list, and the plan says so).
  - *no overlap*: nothing in both lists → take turns (two each for songs).
- `compare(morning, outing_kinds)`: the model may narrow the outing to kinds of place that fit both people's favourites (aquarium, science museum, planetarium, video arcade …, all Qloo category tags), and go back if both rank the result worse.
- `find_genre_tag(word)`: `/v2/tags` search for a music genre.
- `choose(part, picks[{ref, kind, why}])`: picks by short reference from the latest comparison. Rejected if the reference is unknown, a "shared" pick is not in both lists, a turn is not from that person's top 20, or the item is already used elsewhere in the day.
- `finish(summary)`.

**The model cannot invent.** Every pick is a Qloo entity taken by reference. Every sentence the model writes goes through `lib/ground.mjs`: any number must be a rank or count in the data, any capitalised name or non-Latin name must be a Qloo name, tag or something the user typed, no internal references, no prices. A rejected sentence goes back to the model once or twice with the reason; if it still fails, a template sentence is shown instead. In the measured runs (8 plans) the check rejected 15 sentences; 43 of 56 picks show the model's own sentence, the rest a template sentence.

**Which model.** Any OpenAI-compatible `/chat/completions` endpoint, set by three variables (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`); switching provider is one change. We developed and measured with **NVIDIA Nemotron 3.5 Lightning** through **Meterless Nightshift** on a Mac (Nightshift routes it to NVIDIA's hosted endpoint), and the hosted demo uses whatever model its three variables point to (the page names the model and provider on every plan). With no model configured the same tools run under fixed rules (same checks and re-plans, template sentences), and the page says which planner made the plan.

**Why not let the model do everything?** We measured that too: the same model asked directly named films, artists and shows that sat in both people's lists 0 times in 24 (its restaurants: none), and 10 times it just repeated one person's own favourite back. The model is good at reading the checks, choosing between close candidates and saying the trade-off in plain words; Qloo is what knows whether anything is actually shared.

### Use it from your own agent (MCP)

`mcp/server.mjs` is a small MCP server (stdio, no dependencies) with one tool, `plan_shared_saturday`:

```json
{ "mcpServers": { "saturday-for-two": { "command": "node", "args": ["--env-file=/path/to/.env.local", "/path/to/mcp/server.mjs"] } } }
```

It returns a short text plan plus the full JSON (ranks, re-plans, the mixed-call comparison, the planner used).

## Run it locally

Node.js 20.6 or newer and a Qloo hackathon key. No `npm install` (no dependencies).

```sh
cp .env.example .env.local      # Qloo key; optionally LLM_BASE_URL / LLM_API_KEY / LLM_MODEL
npm run dev                      # http://127.0.0.1:5173
npm test                         # 17 offline tests, including the agent loop with a scripted model
npm run measure                  # sections 1-3 of docs/measurements.md (about 600 Qloo calls)
MEASURE_LLM=1 npm run measure    # also the LLM-only baseline and the model planner
```

## Hosting

Static page (`public/`) plus one serverless function (`api/plan.js`) that streams newline-delimited JSON, so it runs on Vercel's free tier (`vercel.json` allows the function 300 s; a plan takes about 30 to 50 s with the rule-based planner (Qloo pacing; about 65 calls) and 45 to 150 s (median 110 s, about 80 to 110 Qloo calls) with the model on a free hosted endpoint). Environment variables: `QLOO_API_URL`, `QLOO_API_KEY`, and optionally `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`. `npm start` runs it on any Node host (`HOST=0.0.0.0`).

The keys stay on the server: the browser only talks to `/api/plan`, and the call log on the page has no key in it. To protect the shared quota (50,000 Qloo calls a month on a hackathon key) the server caches Qloo responses and finished plans for 6 hours (cached plans are labelled), allows 6 new plans per connection per 10 minutes and 200 a day per server instance (`PLANS_PER_DAY`). These limits are in memory, so per instance.

## Files

- `lib/engine.mjs`: the Qloo tools (compare, checks, genre lookup, choose/validate)
- `lib/planner.mjs`: the model planner (re-plan → choose → summary) and the rule-based planner
- `lib/ground.mjs`: the sentence check
- `lib/llm.mjs`: OpenAI-compatible client
- `lib/qloo.mjs`: Qloo client: key in a header only, pacing under 10 calls a second, retries on 429
- `lib/agent.mjs`, `lib/handler.mjs`, `api/plan.js`, `server.mjs`: orchestration and the streaming endpoint
- `public/`: the page (plain HTML, CSS, JavaScript)
- `mcp/server.mjs`: MCP tool
- `scripts/measure.mjs`, `docs/measurements.md`, `docs/loop_log.md`: measurements and the improvement log. Raw Qloo responses go to `measurements-raw/`, which is git-ignored (the Qloo FAQ asks not to publish response data in a repository).

## Limits

- Qloo knows some places and people better than others. Korean names come back in Korean; the card adds Qloo's own Latin-script alias when it has one, and Qloo's English description.
- The example pair's second favourite (*Reply 1988*) was chosen by us after trying three, because its film pick (*Coco*) reads best. With Lim Young-woong alone the shared film was a World War I dog film (docs/loop_log.md, loop 2).
- In several cities Qloo has fewer than 100 places that match the outing filters (Seoul: 41), so both people's lists hold the same places in a different order and every place is "in both lists". There the 100% shared rate for places says nothing; what matters is which place both rank highest (the worse of the two ranks).
- "Shared" means "in both people's Qloo top 100 (places) or top 200 (films, artists, shows)". It is a statement about Qloo's lists, not a promise that anyone will like it.
- A genre re-plan narrows that person's list to the genre (Qloo returned only 10 trot-tagged artists for Grandma), so music usually becomes taking turns. That is the honest answer.
- "No alcohol tag" means Qloo lists none; a place can still serve alcohol. Paris with a child ends at McDonald's: that is what the tags allow.
- The model planner needs a working endpoint. On NVIDIA's free hosted endpoint some calls time out or come back empty; the agent retries, and any part the model did not finish is completed by the rules and marked on the page.
- The abuse limits are in memory, so per server instance.

## Built during the hackathon

Everything here was written from 27 October 2026, within the submission period.
