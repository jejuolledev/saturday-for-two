# Devpost submission text — Saturday for Two

Copy each block into the matching Devpost field. Every number here comes from `docs/measurements.md` (live Qloo hackathon API).

## Project name

```
Saturday for Two
```

## Elevator pitch (200 characters max)

```
Grandma loves trot, I love Minecraft. An agent finds what sits in BOTH our Qloo taste lists, re-asks Qloo when an answer looks wrong, and plans one Saturday. Nothing shared? It says so.
```

## Thumbnail

`docs/thumbnail.png` (1200 × 800, 3:2)

## About the project

```
## Inspiration

A grandmother who loves the trot singer Lim Young-woong and a grandkid who loves Minecraft. The weekend question is always the same: what can we do that both of us will actually enjoy? Ask a chatbot and you get something that sounds nice. It cannot tell you whether that film is really high on both lists, or whether nothing is.

## What it does

You type what two people love (up to 3 artists, films, shows, games or brands each), optional age bands, a city, and who is coming along. The agent plans one Saturday: a morning outing and a lunch spot in that city (open on Saturdays), a film, songs for the car, and one episode before bed.

Every pick shows where it sits in EACH person's own Qloo list ("Grandma: #45 · Me: #15" for Coco), a one-line reason that was checked against Qloo's data, what the obvious approach (one Qloo call with everyone's favourites mixed) would have picked, and what the same language model said when asked alone, without Qloo, placed in both lists. When nothing is in both lists, the plan says so and they take turns. A box at the top lists everything the agent re-asked and why.

When an answer looks wrong, the agent re-plans. Grandma's favourite is tagged Trot in Qloo, but none of her own top 10 artists are (they are K-pop idols). The agent notices, re-asks Qloo within the Trot genre, and her songs become artists Qloo tags Trot. With a child coming, lunch is a restaurant Qloo tags "good for kids" with no alcohol tags, and the kid's songs come from artists Qloo tags family-friendly.

## Who pays and why

First buyer: family day-out and travel apps, which already sell "what shall we do on Saturday" and lose the booking when the plan suits only one person. They would call the "shared plan" step as an API (POST /api/plan with "stream": false returns one JSON plan) or as an agent tool (an MCP tool is included). The same step fits ticketing apps and streaming services with several profiles in one household. Only a per-person taste graph can answer "is this high for both of us", which is why it needs Qloo, and every plan is dozens of Insights calls. Why now: assistants are starting to plan and book for groups, and a plan that names real places and films has to be grounded.

## How we built it

- /search turns each favourite into a Qloo entity; if the best match has no taste data, the agent tries the next (real case: Lim Young-woong's artist entity has no taste data in the hackathon API; his person entity does).
- First pass, all five parts in parallel: each person's own list with /v2/insights (filter.location.query, place category tags, filter.hours=Saturday, signal.demographics.age, filter.content_rating for a child or teenager, bars excluded with anyone under 18), top 100 places / top 200 films, artists, shows; a pool of up to 50 candidates scored for each person with filter.results.entities and placed inside that person's own list.
- Checks: a favourite's Qloo genre tested against the person's own top 10 (filter.tags + filter.results.entities, one call); lunch with a child = restaurants tagged good for kids (tag intersection) with every alcohol tag excluded; nothing in both lists = take turns.
- The planner is a language model on any OpenAI-compatible endpoint (we used NVIDIA Nemotron 3.5 Lightning, through Meterless Nightshift). It reads the checks and decides which Qloo calls to make again (compare with a genre, lunch filter or kinds of outing that fit both people, find_genre_tag via /v2/tags), then one chooser per part picks by reference and writes the reason, then a short day summary. In parallel the same model is asked alone, with no Qloo, and its answers are placed in both lists for comparison.
- The model cannot invent: picks are Qloo entities taken by reference and validated (shared must be in both lists, a turn must come from that person's top 20, no repeats). Every sentence is checked: numbers must be ranks in the data, names must be Qloo names or tags or what the user typed. A failing sentence goes back to the model with the reason; if it still fails, a template is shown.
- With no model configured, the same tools run under fixed rules and the page says so.
- The page streams every step and lists every Qloo call with its parameters. Keys stay on the server. The planner is also an MCP tool (plan_shared_saturday).
- Plain Node.js, no dependencies. Static page plus one serverless function.

## What we measured

8 fixed pairs (e.g. Lim Young-woong × Minecraft + Pokémon in Seoul, Metallica + The Godfather × Olivia Rodrigo + Stranger Things in New York) × 5 parts of the day, live API.

- The same language model without Qloo: asked for a film, an artist and a show both would enjoy, it named 24 real titles (all exist in Qloo), but 0 of 24 sat in both people's own lists, and 10 of the 24 simply repeated one person's own favourite. None of its lunch restaurants was in both lists either.
- One mixed Qloo call picked a film, artist or show outside one person's top 200 in 10 of 24 cases. The agent found a pick in both lists in 17 of 24 and said "take turns" in the other 7. When something was shared, the median worse rank was #62 for the agent vs #94 for the mixed call. For places the mixed call is often fine (#8.5 vs #15); we say so.
- Trot: none of Grandma's own top 10 artists carry Qloo's Trot tag; after the re-plan, 2 of 2 of her song picks do.
- Lunch with a child, 8 pairs in 7 cities: picks carrying a Qloo alcohol tag went from 6 of 8 to 0 of 8, and all 8 still sit in both people's lists.
- Model planner: on NVIDIA's free hosted endpoint the model chose 33 of 40 parts of the day (the rules finished the other 7 after empty or timed-out responses, and the page marks them); 43 of 56 picks show a model-written reason that passed the check; 15 sentences were rejected; median 110 s per plan.

These are ranks in Qloo's lists, not a user study. We have not tested whether real families enjoyed the day.

## Challenges we ran into

- Mixing both people's favourites into one Insights call looked like the answer. For films, music and shows one person's taste often drowns out the other, so we fetch each person's own list and score candidates per person.
- Qloo's neighbours for a trot singer are K-pop idols. The fix had to come from Qloo itself: the favourite's own genre tag, tested against the list in one call, then a genre-limited list.
- "No bars" was not enough for a child's lunch: most top restaurants carry alcohol tags. Tag intersection (restaurant AND good for kids) plus excluding every alcohol tag fixed it without losing overlap.
- A free hosted model endpoint sometimes times out or returns nothing. The planner runs in short guarded steps; whatever the model does not finish, the rules finish, and the page says which.

## Accomplishments that we're proud of

- The plan is honest: both ranks, the naive answer next to it, "take turns" instead of pretending, and a model that is checked sentence by sentence.
- A finding from the data: families meet in places and split on music.

## What we learned

Taste overlap between very different people is rare in films and music and common in places. A good agent should know the difference, check its own answers, and say it.

## What's next

- A third person (the whole family), and fairness of turns over several weekends.
- Booking links and travel time between the outing and lunch.
- A short user test with real grandparent–grandchild pairs.
```

## Built with

```
qloo, nvidia-nemotron, meterless-nightshift, node.js, javascript, html, css, mcp, vercel
```

## Try it out links

```
LIVE_DEMO_URL
GITHUB_URL
```

## Video demo link (optional for this hackathon)

```
VIDEO_URL
```

## Testing instructions (if asked)

```
Open the live demo and press "Grandma & grandkid · Seoul", or type any two people. No login. The page says which planner made the plan (the language model, or the rule-based fallback). A new plan takes about 30 to 50 s with the rules (about 65 Qloo calls) and 45 to 150 s with the model (median 110 s, about 80 to 110 Qloo calls), paced under Qloo's 10-per-second limit; repeated requests come from a 6-hour server cache and are labelled. Locally: Node.js 20.6+, copy .env.example to .env.local with a Qloo hackathon key (and optionally LLM_BASE_URL / LLM_API_KEY / LLM_MODEL), run "npm run dev", open http://127.0.0.1:5173. "npm test" runs 17 offline tests including the agent loop with a scripted model; "npm run measure" re-runs the measurements.
```

## What is Qloo-powered (if asked)

```
Everything that decides the plan: entity lookup (/search), genre lookup (/v2/tags), each person's own list per part of the day (/v2/insights with location, category tags, tag intersection, excluded bar and alcohol tags, Saturday hours, age band and content rating), the genre check (filter.tags + filter.results.entities), per-person scoring of every candidate (filter.results.entities), and the descriptions and tags shown. The language model only chooses among Qloo's results and explains; without Qloo it has nothing to choose from, and when we asked it alone, none of the 24 films, artists and shows it named was in both people's lists.
```

## Was this built during the submission period?

```
Yes. The code was written from 27 October 2026, within the submission period. It does not reuse an earlier project.
```
