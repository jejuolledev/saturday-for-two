# Devpost submission text — Saturday for Two

Copy each block into the matching Devpost field. Replace the three `<...>` links after publishing (repository, live demo, YouTube). Every number here comes from `docs/measurements.md` (run 2026-10-27, live Qloo hackathon API).

## Project name

```
Saturday for Two
```

## Elevator pitch (200 characters max)

```
Grandma likes trot, I like Minecraft. An agent that uses Qloo's taste graph to find what sits high in BOTH people's lists and plans one Saturday together. If nothing overlaps, it says so.
```

## Thumbnail

`docs/thumbnail.png` (1200 × 800, 3:2)

## About the project

```
## Inspiration

Think of a grandmother who loves the trot singer Lim Young-woong and a grandkid who loves Minecraft. The weekend question is always the same: what can we do that both of them will actually enjoy? Ask a chatbot and you get something that sounds nice. It cannot tell you whether that film is really high on both lists, or whether nothing is.

## What it does

You type what two people love (up to 3 artists, films, shows, games or brands each), an optional age band, and a city. The agent plans one Saturday: a morning outing and a lunch spot in that city (open on Saturdays), an afternoon film, songs for the car, and one episode before bed.

It is an agentic tool: it decides which Qloo calls to make, recovers when a lookup has no taste data or a call is empty or rate-limited, judges whether an overlap is real, and switches to taking turns when it is not. Every pick shows where it sits in EACH person's own Qloo list, for example "Grandma: #9 · Me: #10". It also shows what the obvious approach would have picked (one Qloo call with everyone's favourites mixed), with its two ranks, so you can see the difference. When nothing is in both lists, the plan says so and you take turns: from each person's top 10, the item the other person minds least.

## How we built it

- /search turns each favourite into a Qloo entity. If the best match has no taste data, the agent tries the next one and says so (real case: Lim Young-woong's artist entity has no taste data in the hackathon API; his person entity does).
- /v2/insights gets each person's own list per part of the day: top 100 places (filter.location.query, filter.tags for museums/parks/aquariums/... or restaurants, filter.hours=Saturday) and top 200 films, artists and shows (four pages), using signal.demographics.age when given, and filter.content_rating=G,PG when a child is coming.
- filter.results.entities scores every candidate for each person separately. Qloo gives the same affinity for a person and an item whatever else is filtered, so each candidate can be placed inside each person's own list.
- A pick is "shared" only if it is in both lists; the best worse-rank wins.
- Each pick shows Qloo's English description and tags (cuisine, mood, "good for kids"; payment cards and raw keywords filtered out). We also request feature.explainability, but its shares came out close to even and mostly followed how many favourites each person typed, so we keep it in the JSON and do not present it as a reason.
- Who is coming along sets limits: with a child, films and shows G/PG; with a teenager, up to PG-13 / TV-14; with either, places Qloo files as bars or nightclubs are excluded.
- No language model in the loop, on purpose: every name in the plan is a Qloo entity, so nothing can be invented. The agent decides which calls to make, recovers from empty or rate-limited calls, judges whether an overlap is real, and switches to taking turns when it is not.
- The page streams the agent's steps as they happen and lists every Qloo call with its parameters. The key stays on the server.
- The same planner is an MCP tool (plan_shared_saturday), so other agents can call it.
- Plain Node.js, no dependencies. Static page plus one serverless function.

## What we measured

8 fixed pairs (for example Lim Young-woong × Minecraft + Pokémon in Seoul, Metallica + The Godfather × Olivia Rodrigo + Stranger Things in New York) × 5 parts of the day, live API, compared with the obvious approach: one Insights call with both people's favourites and both age bands mixed, top result.

- Places: 16 of 16 outings and lunches had something in both people's lists. Here the mixed call is usually fine too (outside one person's list 2 of 16 times; median worse rank #15 vs our #10). We say so.
- Films, artists and shows: the mixed call picked something outside one person's top 200 in 12 of 24 cases. When something is shared, the median worse rank is #62 for the agent vs #100 for the mixed call. 9 of 24 had no overlap at all, and the plan says "take turns".
- Music is where people split: in 7 of 8 pairs, not one artist was in both people's top 200.
- 14 to 17 seconds and about 60 Qloo calls per plan; the key allows 10 calls a second, so the agent paces itself at 8.

These are ranks in Qloo's lists, not a user study, and we did not compare against an LLM. We have not tested whether real families enjoyed the day.

## Challenges we ran into

- Mixing both people's favourites into one Insights call looked like the answer. For places it often is. For films, music and shows one person's taste often drowns out the other, so we fetch each person's own list and score candidates per person. An independent review also caught that our first baseline left out the age bands; with them added, the gap for places almost closed, and we report the fair numbers.
- take is capped at 50, and the API allows 10 calls a second: we page own lists, cap the scoring pool at 50 and pace requests, with retries on 429.
- Scoring a large place pool without the location filter returned nothing; with the filter it returned all 49. The agent now sends the same filters and retries in halves if a call comes back short.
- Tags include things like payment cards, so reasons are limited to useful tag types.

## Accomplishments that we're proud of

- The plan is honest. It shows both ranks, shows the naive answer next to it, and says "take turns" instead of pretending.
- A real, surprising finding from the data: families meet in places and split on music.

## What we learned

Taste overlap between very different people is rare in films and music and common in places. A good agent should know the difference and say it.

## What's next

- A third person (the whole family), weighting whose turn it is over several weekends.
- Booking links and travel time between the morning place and lunch.
- A short user test with real grandparent–grandchild pairs, to check whether "high on both lists" means "both enjoyed it".
```

## Built with

```
qloo, node.js, javascript, html, css, mcp
```

## Try it out links

```
<LIVE DEMO URL>
<PUBLIC GITHUB REPOSITORY URL>
```

## Video demo link (optional for this hackathon)

```
<YOUTUBE URL>
```

## Testing instructions (if asked)

```
Open the live demo and press "Grandma & grandkid · Seoul", or type any two people. No login. A new plan takes 14 to 17 seconds (about 60 Qloo calls, paced under the 10-per-second limit); repeated requests are served from a 6-hour server cache and labelled as cached. To run locally: Node.js 20+, copy .env.example to .env.local with a Qloo hackathon key, run "npm run dev" and open http://127.0.0.1:5173. "npm test" runs 12 offline tests; "npm run measure" re-runs the measurements.
```

## What is Qloo-powered (if asked)

```
Everything that decides the plan: entity lookup (/search), each person's own list per part of the day (/v2/insights with location, category tags, excluded bar tags, Saturday hours, age band and content rating), per-person scoring of every candidate (filter.results.entities), and the descriptions and tags shown. Without Qloo the app has nothing to compute.
```

## Was this built during the submission period?

```
Yes. The code was written from 27 October 2026, within the submission period. It does not reuse an earlier project.
```
