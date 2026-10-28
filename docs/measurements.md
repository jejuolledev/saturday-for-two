# Measurements

Run: 2026-10-28T03:45:01.437Z · 8 fixed pairs × 5 parts of the day · live Qloo hackathon API · fresh cache per pair. Re-run: `npm run measure` (add `MEASURE_LLM=1` and an LLM endpoint for sections 4 and 5).

These numbers say where each pick sits in Qloo's own taste lists for both people. They do not measure whether real people enjoyed the day; that has not been tested.

## 1. Agent vs one mixed Qloo call

For each part of the day the agent fetches each person's own Qloo list (top 100 places in the city, top 200 films / artists / shows). A pick is "shared" only if it is in both lists. "Worse rank" is the lower of the two ranks. The baseline is one Qloo call with both people's favourites (and both age bands) mixed, top result. Rule-based planner (deterministic).

| | Places (outing + lunch) | Films, artists, shows |
|---|---|---|
| Parts of the day planned | 16 | 24 |
| …with a shared pick (in both lists) | 16 (100%) | 17 (71%) |
| …where the plan takes turns instead | 0 | 7 |
| Mixed call: top pick is outside at least one person's list | 1 of 16 | 10 of 24 |
| When shared: median worse rank, agent pick | 7 | 62 |
| When shared: median worse rank, mixed-call pick (outside = list length + 1) | 13 | 94 |
| When shared: mixed call picked the same item | 10 of 16 | 9 of 17 |

Speed (rule-based planner): median 33.4 s and 63.5 Qloo calls per plan.

## 2. A favourite's music genre (the trot problem)

For every person whose favourite carries a Qloo music genre: how many of their own top 10 artists (first pass, no genre filter) carry that genre, whether the planner re-asked Qloo within the genre (rule: 2 or fewer of 10), and how many of that person's song picks carry the genre at the end (checked with Qloo `filter.tags` + `filter.results.entities`).

| Pair | Person | Favourite → Qloo genre | Top 10 in genre, first pass | Re-planned | Their song picks in genre |
|---|---|---|---|---|---|
| Lim Young-woong+Reply 1988 × Minecraft+Pokémon | Grandma | Lim Young-woong + Reply 1988 → Trot | 0 of 10 | yes | 2 of 2 |
| Metallica+The Godfather × Olivia Rodrigo+Stranger Things | Dad | Metallica + The Godfather → Hard Rock/Thrash Metal/Heavy Metal | 7 of 10 | no | 1 of 2 |
| Metallica+The Godfather × Olivia Rodrigo+Stranger Things | Daughter | Olivia Rodrigo + Stranger Things → Pop - Rock/Rock/Indie Pop | 1 of 10 | yes | 2 of 2 |
| Radiohead+The Grand Budapest Hotel × Bad Bunny+Fast & Furious | Roommate 1 | Radiohead + The Grand Budapest Hotel → Electronic/Indie/Alternative Rock | 8 of 10 | no | 1 of 2 |
| Radiohead+The Grand Budapest Hotel × Bad Bunny+Fast & Furious | Roommate 2 | Bad Bunny + Fast & Furious → Latin Pop/Puerto Rican | 2 of 10 | yes | 2 of 2 |
| Frank Sinatra+Casablanca × Bluey+Frozen | Grandpa | Frank Sinatra + Casablanca → Jazz/Oldies/Vocal Jazz | 10 of 10 | no | 2 of 2 |
| Taylor Swift+Gilmore Girls × Fortnite+Spider-Man | Mom | Taylor Swift + Gilmore Girls → Country Pop/American Folk | 0 of 10 | yes | 2 of 2 |
| BTS+Squid Game × Pink Floyd+Star Wars | Partner 1 | BTS + Squid Game → Korean/K Pop/Kpop | 10 of 10 | no | 2 of 2 |
| BTS+Squid Game × Pink Floyd+Star Wars | Partner 2 | Pink Floyd + Star Wars → Psychedelic/Rock/Psychedelic Rock | 9 of 10 | no | 2 of 2 |
| Adele+Downton Abbey × Travis Scott+Call of Duty | Aunt | Adele + Downton Abbey → Indie/Singer & Songwriter/British | 8 of 10 | no | 1 of 2 |
| Elvis Presley+The Sound of Music × MrBeast+Spider-Man | Grandma | Elvis Presley + The Sound of Music → Oldies/Rock/Classic Rock | 10 of 10 | no | 3 of 3 |

## 2b. Songs with a child in the car

Qloo has no lyric rating for artists. With a child along, the youngest person's artists come only from those Qloo tags family-friendly (`urn:tag:audience:qloo:family_friendly`, `urn:tag:style:qloo:family_friendly`). Below: their own top 10 with no filter, and their song picks now.

| Pair | Person | Own top 3, no filter | Own top 10 tagged family-friendly | Their song picks now | …tagged family-friendly |
|---|---|---|---|---|---|
| Lim Young-woong+Reply 1988 × Minecraft+Pokémon | Grandkid | Quadeca, XXXTENTACION, bbno$ | 0 of 10 | Cimorelli, Jonas Brothers | 2 of 2 |
| Frank Sinatra+Casablanca × Bluey+Frozen | Grandkid | Vance Joy, Birdy, Gabrielle Aplin | 0 of 10 | Pat Boone, Disney Characters | 2 of 2 |
| Elvis Presley+The Sound of Music × MrBeast+Spider-Man | Grandson | d4vd, Panic! at the Disco, Chase Atlantic | 0 of 10 | John Denver, B.J. Thomas, Gene Autry | 3 of 3 |

## 3. Lunch with a child (the alcohol problem)

Every city, as if a child were coming. Old filter: restaurants open on Saturday, bars and nightclubs excluded. New filter: restaurants Qloo tags "good for kids" (tag intersection) with every alcohol tag excluded (alcohol, beer, wine, cocktails, hard liquor, full bar, happy-hour drinks …). "Alcohol tag" means Qloo lists it; a place without the tag may still serve alcohol.

| City | Old pick | alcohol tag? | New pick | alcohol tag? | kids tag? | new pick shared? (worse rank) |
|---|---|---|---|---|---|---|
| Seoul | 옥돌구이 | yes | Sedorak | no | yes | yes (#7) |
| New York | Niall's on 52nd | yes | Joe's Pizza | no | yes | yes (#2) |
| London | Alto by San Carlo / London | yes | The O2 | no | yes | yes (#2) |
| Chicago | Manny's Cafeteria & Delicatessen | no | Al's #1 Italian Beef | no | yes | yes (#28) |
| Los Angeles | In-N-Out Burger | no | Tiago Coffee Bar + Kitchen | no | yes | yes (#4) |
| Tokyo | Sushikuni | yes | Queen of Hearts Banquet Hall | no | yes | yes (#7) |
| London | Sea Containers Restaurant | yes | Bang Bang Oriental Foodhall | no | yes | yes (#7) |
| Paris | Le Relais Plaza | yes | McDonald's | no | yes | yes (#5) |

Old filter: 6 of 8 lunch picks carry an alcohol tag. New filter: 0 of 8, and 8 of 8 carry a "good for kids" tag. Restaurants with an alcohol tag in each person's old top 10: Seoul 8/9, New York 6/6, London 5/10, Chicago 6/6, Los Angeles 5/5, Tokyo 10/10, London 9/9, Paris 8/8.

## 4. The same model without Qloo (LLM-only)

Model: nvidia/nemotron-3.5-lightning-30b-a3b via Meterless Nightshift (this Mac), asked once per pair for one film, one artist, one TV show both would enjoy and one real lunch restaurant in the city. Each name was looked up with Qloo /search (by type) and placed in both people's own lists exactly like the agent's picks (first-pass lists, no genre filter).

| Pair | Kind | LLM named | Found in Qloo as | Rank A | Rank B | In both lists? | Agent pick (worse rank) |
|---|---|---|---|---|---|---|---|
| Lim Young-woong+Reply 1988 × Minecraft+Pokémon | film | Coco | Coco | #45 | #15 | yes | Coco (#45) |
| Lim Young-woong+Reply 1988 × Minecraft+Pokémon | artist | Lim Young-woong | Lim Young Woong | outside top 200 | #16 | no | 노라조 (take turns) |
| Lim Young-woong+Reply 1988 × Minecraft+Pokémon | tv_show | Reply 1988 | Reply 1988 | outside top 200 | outside top 200 | no | The Baby-Sitters Club (#62) |
| Lim Young-woong+Reply 1988 × Minecraft+Pokémon | restaurant | Gwangjang Market | Gwangjang Market | #7 | #42 | yes | Sedorak (#7) |
| Metallica+The Godfather × Olivia Rodrigo+Stranger Things | film | The Godfather | The Godfather | outside top 200 | outside top 200 | no | Split (#145) |
| Metallica+The Godfather × Olivia Rodrigo+Stranger Things | artist | Metallica | Metallica | outside top 200 | outside top 200 | no | The Cure (#147) |
| Metallica+The Godfather × Olivia Rodrigo+Stranger Things | tv_show | Stranger Things | Stranger Things | outside top 200 | outside top 200 | no | Raising Dion (#55) |
| Metallica+The Godfather × Olivia Rodrigo+Stranger Things | restaurant | Katz's Delicatessen | Katz's Delicatessen | outside top 100 | outside top 100 | no | Joe's Pizza (#10) |
| Radiohead+The Grand Budapest Hotel × Bad Bunny+Fast & Furious | film | The Grand Budapest Hotel | The Grand Budapest Hotel | outside top 200 | outside top 200 | no | Whiplash (take turns) |
| Radiohead+The Grand Budapest Hotel × Bad Bunny+Fast & Furious | artist | Radiohead | Radiohead | outside top 200 | outside top 200 | no | Muse (take turns) |
| Radiohead+The Grand Budapest Hotel × Bad Bunny+Fast & Furious | tv_show | The Office | The Office | outside top 200 | outside top 200 | no | Gyeongseong Creature (#49) |
| Radiohead+The Grand Budapest Hotel × Bad Bunny+Fast & Furious | restaurant | Dishoom | Dishoom King's Cross | outside top 100 | outside top 100 | no | Ku Bar (#26) |
| Frank Sinatra+Casablanca × Bluey+Frozen | film | The Wizard of Oz | The Wizard of Oz | #123 | outside top 200 | no | The Lego Movie (#110) |
| Frank Sinatra+Casablanca × Bluey+Frozen | artist | Frank Sinatra | Frank Sinatra | outside top 200 | #8 | no | Pat Boone (#149) |
| Frank Sinatra+Casablanca × Bluey+Frozen | tv_show | Bluey | Bluey | outside top 200 | outside top 200 | no | Little House on the Prairie (#129) |
| Frank Sinatra+Casablanca × Bluey+Frozen | restaurant | Lou Malnati's Pizzeria | Lou Malnati's Pizzeria | outside top 100 | outside top 100 | no | Al's #1 Italian Beef (#28) |
| Taylor Swift+Gilmore Girls × Fortnite+Spider-Man | film | Spider-Man: Into the Spider-Verse | Spider-Man: Into the Spider-Verse | outside top 200 | #7 | no | Pitch Perfect 3 (take turns) |
| Taylor Swift+Gilmore Girls × Fortnite+Spider-Man | artist | Post Malone | Post Malone | outside top 200 | #9 | no | Sam Hunt (take turns) |
| Taylor Swift+Gilmore Girls × Fortnite+Spider-Man | tv_show | Stranger Things | Stranger Things | outside top 200 | outside top 200 | no | The Baker and the Beauty (#78) |
| Taylor Swift+Gilmore Girls × Fortnite+Spider-Man | restaurant | In-N-Out Burger | In-N-Out Burger | #51 | #3 | yes | In-N-Out Burger (#5) |
| BTS+Squid Game × Pink Floyd+Star Wars | film | The Matrix | The Matrix | outside top 200 | outside top 200 | no | Maze Runner: The Death Cure (#7) |
| BTS+Squid Game × Pink Floyd+Star Wars | artist | Queen | Queen | outside top 200 | outside top 200 | no | Stray Kids (take turns) |
| BTS+Squid Game × Pink Floyd+Star Wars | tv_show | Stranger Things | Stranger Things | outside top 200 | outside top 200 | no | Suspicious Partner (#38) |
| BTS+Squid Game × Pink Floyd+Star Wars | restaurant | Ichiran Ramen (Shibuya branch) | Gyukatsu Motomura Shibuya Branch | #8 | outside top 100 | no | Sushikuni (#31) |
| Adele+Downton Abbey × Travis Scott+Call of Duty | film | The King's Speech | The King's Speech | outside top 200 | outside top 200 | no | Marriage Story (#177) |
| Adele+Downton Abbey × Travis Scott+Call of Duty | artist | Ed Sheeran | Ed Sheeran | outside top 200 | outside top 200 | no | Take That (take turns) |
| Adele+Downton Abbey × Travis Scott+Call of Duty | tv_show | The Crown | The Crown | outside top 200 | outside top 200 | no | Council of Dads (#35) |
| Adele+Downton Abbey × Travis Scott+Call of Duty | restaurant | Dishoom | Dishoom King's Cross | outside top 100 | outside top 100 | no | Sea Containers Restaurant (#14) |
| Elvis Presley+The Sound of Music × MrBeast+Spider-Man | film | The Sound of Music | The Sound of Music | outside top 200 | outside top 200 | no | Top Gun (#80) |
| Elvis Presley+The Sound of Music × MrBeast+Spider-Man | artist | Elvis Presley | Elvis Presley | outside top 200 | #8 | no | John Denver (#19) |
| Elvis Presley+The Sound of Music × MrBeast+Spider-Man | tv_show | MrBeast | MrBeast: Extreme Survival! | outside top 200 | outside top 200 | no | Big Shot (#12) |
| Elvis Presley+The Sound of Music × MrBeast+Spider-Man | restaurant | Le Procope | Le Procope | #1 | outside top 100 | no | McDonald's (#5) |

Films, artists, shows: the LLM alone named 24; 24 were found in Qloo; **1 were in both people's lists**; median worse rank of those found: outside top 200. The agent had a shared pick in 17 of 24 of the same parts of the day and said "take turns" in the rest.
Of the 24 films, artists and shows the LLM named alone, 12 simply repeated one person's own typed favourite.
Lunch: the LLM alone named 8 restaurants (Qloo search matched "Ichiran Ramen (Shibuya branch)" to a different Shibuya restaurant; it is not in both lists either way); 8 found in Qloo in that city; 2 in both people's lists. The agent's lunch was shared in 8 of 8.

## 5. Model planner

Same Qloo tools as the rule-based planner. The model decides what to re-ask Qloo, chooses, and writes the sentences; each pick is validated against the comparison and each sentence is checked against Qloo's names, tags and ranks before it is shown.

| Pair | Completed by the model | Re-plans | Sentences shown from the model / all picks | Sentences rejected by the check | Day summary | Same first pick as rules (of 5) | Time | Songs |
|---|---|---|---|---|---|---|---|---|
| Lim Young-woong+Reply 1988 × Minecraft+Pokémon | yes | 1 | 8 / 8 | 0 | model | 5 | 72 s | 노라조, Cimorelli, 조용필, Jonas Brothers |
| Metallica+The Godfather × Olivia Rodrigo+Stranger Things | yes | 1 | 6 / 6 | 0 | model | 4 | 68 s | Black Sabbath, Harry Styles |
| Radiohead+The Grand Budapest Hotel × Bad Bunny+Fast & Furious | yes | 1 | 7 / 7 | 1 | model | 5 | 69 s | Muse, Maluma |
| Frank Sinatra+Casablanca × Bluey+Frozen | yes | 0 | 5 / 5 | 2 | model | 5 | 114 s | Pat Boone |
| Taylor Swift+Gilmore Girls × Fortnite+Spider-Man | yes | 2 | 7 / 7 | 0 | model | 2 | 53 s | Danielle Bradbery, Don Toliver |
| BTS+Squid Game × Pink Floyd+Star Wars | no (re-plan: model endpoint: /nemotron-3.5-lightning-30b-a3b_empty_response; rules finished evening) | 0 | 6 / 7 | 0 | template | 4 | 153 s | TWICE, Rainbow, Stray Kids |
| Adele+Downton Abbey × Travis Scott+Call of Duty | yes | 1 | 6 / 6 | 1 | model | 4 | 82 s | Michael Grimm, Migos |
| Elvis Presley+The Sound of Music × MrBeast+Spider-Man | yes | 0 | 5 / 5 | 0 | model | 5 | 96 s | John Denver |

Model planner: completed 7 of 8; median 77 s per plan.

## Per pair (rule-based planner)

| Pair | Part of day | In both lists | Shared pick? | Agent worse rank | Mixed-call worse rank | Re-planned |
|---|---|---|---|---|---|---|
| Lim Young-woong+Reply 1988 × Minecraft+Pokémon | morning | 41 of top 100 | yes | #3 | #27 |  |
| Lim Young-woong+Reply 1988 × Minecraft+Pokémon | lunch | 44 of top 100 | yes | #7 | #10 |  |
| Lim Young-woong+Reply 1988 × Minecraft+Pokémon | movie | 39 of top 200 | yes | #45 | #77 |  |
| Lim Young-woong+Reply 1988 × Minecraft+Pokémon | music | 0 of top 200 | no, take turns | — | outside top 200 | yes |
| Lim Young-woong+Reply 1988 × Minecraft+Pokémon | evening | 3 of top 200 | yes | #62 | #94 |  |
| Metallica+The Godfather × Olivia Rodrigo+Stranger Things | morning | 24 of top 100 | yes | #5 | #25 |  |
| Metallica+The Godfather × Olivia Rodrigo+Stranger Things | lunch | 9 of top 100 | yes | #10 | #10 |  |
| Metallica+The Godfather × Olivia Rodrigo+Stranger Things | movie | 1 of top 200 | yes | #145 | #145 |  |
| Metallica+The Godfather × Olivia Rodrigo+Stranger Things | music | 1 of top 200 | yes | #147 | #147 | yes |
| Metallica+The Godfather × Olivia Rodrigo+Stranger Things | evening | 6 of top 200 | yes | #55 | #55 |  |
| Radiohead+The Grand Budapest Hotel × Bad Bunny+Fast & Furious | morning | 41 of top 100 | yes | #1 | #1 |  |
| Radiohead+The Grand Budapest Hotel × Bad Bunny+Fast & Furious | lunch | 14 of top 100 | yes | #26 | outside top 100 |  |
| Radiohead+The Grand Budapest Hotel × Bad Bunny+Fast & Furious | movie | 0 of top 200 | no, take turns | — | outside top 200 |  |
| Radiohead+The Grand Budapest Hotel × Bad Bunny+Fast & Furious | music | 0 of top 200 | no, take turns | — | outside top 200 | yes |
| Radiohead+The Grand Budapest Hotel × Bad Bunny+Fast & Furious | evening | 19 of top 200 | yes | #49 | #49 |  |
| Frank Sinatra+Casablanca × Bluey+Frozen | morning | 79 of top 100 | yes | #1 | #1 |  |
| Frank Sinatra+Casablanca × Bluey+Frozen | lunch | 22 of top 100 | yes | #28 | #28 |  |
| Frank Sinatra+Casablanca × Bluey+Frozen | movie | 7 of top 200 | yes | #110 | #115 |  |
| Frank Sinatra+Casablanca × Bluey+Frozen | music | 1 of top 200 | yes | #149 | outside top 200 |  |
| Frank Sinatra+Casablanca × Bluey+Frozen | evening | 6 of top 200 | yes | #129 | #152 |  |
| Taylor Swift+Gilmore Girls × Fortnite+Spider-Man | morning | 49 of top 100 | yes | #16 | #16 |  |
| Taylor Swift+Gilmore Girls × Fortnite+Spider-Man | lunch | 11 of top 100 | yes | #5 | #5 |  |
| Taylor Swift+Gilmore Girls × Fortnite+Spider-Man | movie | 0 of top 200 | no, take turns | — | outside top 200 |  |
| Taylor Swift+Gilmore Girls × Fortnite+Spider-Man | music | 0 of top 200 | no, take turns | — | outside top 200 | yes |
| Taylor Swift+Gilmore Girls × Fortnite+Spider-Man | evening | 5 of top 200 | yes | #78 | #78 |  |
| BTS+Squid Game × Pink Floyd+Star Wars | morning | 58 of top 100 | yes | #7 | #12 |  |
| BTS+Squid Game × Pink Floyd+Star Wars | lunch | 3 of top 100 | yes | #31 | #31 |  |
| BTS+Squid Game × Pink Floyd+Star Wars | movie | 28 of top 200 | yes | #7 | #7 |  |
| BTS+Squid Game × Pink Floyd+Star Wars | music | 0 of top 200 | no, take turns | — | outside top 200 |  |
| BTS+Squid Game × Pink Floyd+Star Wars | evening | 18 of top 200 | yes | #38 | #100 |  |
| Adele+Downton Abbey × Travis Scott+Call of Duty | morning | 56 of top 100 | yes | #10 | #10 |  |
| Adele+Downton Abbey × Travis Scott+Call of Duty | lunch | 6 of top 100 | yes | #14 | #14 |  |
| Adele+Downton Abbey × Travis Scott+Call of Duty | movie | 1 of top 200 | yes | #177 | outside top 200 |  |
| Adele+Downton Abbey × Travis Scott+Call of Duty | music | 0 of top 200 | no, take turns | — | outside top 200 |  |
| Adele+Downton Abbey × Travis Scott+Call of Duty | evening | 6 of top 200 | yes | #35 | #35 |  |
| Elvis Presley+The Sound of Music × MrBeast+Spider-Man | morning | 58 of top 100 | yes | #7 | #32 |  |
| Elvis Presley+The Sound of Music × MrBeast+Spider-Man | lunch | 62 of top 100 | yes | #5 | #5 |  |
| Elvis Presley+The Sound of Music × MrBeast+Spider-Man | movie | 6 of top 200 | yes | #80 | #80 |  |
| Elvis Presley+The Sound of Music × MrBeast+Spider-Man | music | 5 of top 200 | yes | #19 | outside top 200 |  |
| Elvis Presley+The Sound of Music × MrBeast+Spider-Man | evening | 10 of top 200 | yes | #12 | #12 |  |
