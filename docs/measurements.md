# Measurements

Run: 2026-10-27T13:03:47.055Z · 8 fixed pairs × 5 parts of the day · live Qloo hackathon API · no cache.

How to read: for each part of the day the agent fetches each person's own Qloo list (top 100 places in the city, top 200 films / artists / shows). A pick is "shared" only if it is in both lists. "Worse rank" is the lower of the two people's ranks for that pick. The baseline is one Qloo call with both people's favourites mixed together (and both age bands), top result.

These numbers say how well each pick sits in Qloo's own taste lists for both people. They do not measure whether real people enjoyed the day; that has not been tested.

| | Places (morning + lunch) | Films, artists, shows |
|---|---|---|
| Parts of the day planned | 16 | 24 |
| …with at least one item in both people's lists (overlap > 0) | 16 (100%) | 15 (63%) |
| …where the plan has a shared pick | 16 (100%) | 15 (63%) |
| …where the plan honestly falls back to taking turns | 0 | 9 |
| Mixed-call baseline: top pick is outside at least one person's list | 2 of 16 (13%) | 12 of 24 (50%) |
| When shared: median worse rank, agent pick | 10 | 62 |
| When shared: median worse rank, mixed-call pick (outside list counted as list length + 1) | 15 | 100 |
| When shared: mixed call picked the same item | 9 of 16 | 8 of 15 |

Speed: median 14.0 s per plan (min 13.5, max 16.0), median 60 Qloo calls per plan. The hackathon key allows 10 calls per second, so the agent paces itself at 8.

Pairs that failed or slots skipped: 0.

## Per pair

| Pair | Part of day | Overlap in both lists | Shared pick? | Agent worse rank | Mixed-call worse rank |
|---|---|---|---|---|---|
| Lim Young-woong × Minecraft+Pokémon | morning | 41 of top 100 | yes | #3 | #33 |
| Lim Young-woong × Minecraft+Pokémon | lunch | 15 of top 100 | yes | #10 | #10 |
| Lim Young-woong × Minecraft+Pokémon | movie | 34 of top 200 | yes | #42 | #196 |
| Lim Young-woong × Minecraft+Pokémon | music | 0 of top 200 | no, take turns | — | outside top 200 |
| Lim Young-woong × Minecraft+Pokémon | evening | 4 of top 200 | yes | #62 | outside top 200 |
| Metallica+The Godfather × Olivia Rodrigo+Stranger Things | morning | 24 of top 100 | yes | #5 | #25 |
| Metallica+The Godfather × Olivia Rodrigo+Stranger Things | lunch | 8 of top 100 | yes | #17 | #21 |
| Metallica+The Godfather × Olivia Rodrigo+Stranger Things | movie | 1 of top 200 | yes | #145 | #145 |
| Metallica+The Godfather × Olivia Rodrigo+Stranger Things | music | 0 of top 200 | no, take turns | — | outside top 200 |
| Metallica+The Godfather × Olivia Rodrigo+Stranger Things | evening | 6 of top 200 | yes | #55 | #55 |
| Radiohead+The Grand Budapest Hotel × Bad Bunny+Fast & Furious | morning | 41 of top 100 | yes | #1 | #1 |
| Radiohead+The Grand Budapest Hotel × Bad Bunny+Fast & Furious | lunch | 14 of top 100 | yes | #26 | outside top 100 |
| Radiohead+The Grand Budapest Hotel × Bad Bunny+Fast & Furious | movie | 0 of top 200 | no, take turns | — | outside top 200 |
| Radiohead+The Grand Budapest Hotel × Bad Bunny+Fast & Furious | music | 1 of top 200 | yes | #135 | outside top 200 |
| Radiohead+The Grand Budapest Hotel × Bad Bunny+Fast & Furious | evening | 19 of top 200 | yes | #49 | #49 |
| Frank Sinatra+Casablanca × Bluey+Frozen | morning | 79 of top 100 | yes | #1 | #1 |
| Frank Sinatra+Casablanca × Bluey+Frozen | lunch | 6 of top 100 | yes | #7 | #7 |
| Frank Sinatra+Casablanca × Bluey+Frozen | movie | 7 of top 200 | yes | #110 | #115 |
| Frank Sinatra+Casablanca × Bluey+Frozen | music | 0 of top 200 | no, take turns | — | outside top 200 |
| Frank Sinatra+Casablanca × Bluey+Frozen | evening | 6 of top 200 | yes | #129 | #152 |
| Taylor Swift+Gilmore Girls × Fortnite+Spider-Man | morning | 49 of top 100 | yes | #16 | #16 |
| Taylor Swift+Gilmore Girls × Fortnite+Spider-Man | lunch | 7 of top 100 | yes | #10 | #10 |
| Taylor Swift+Gilmore Girls × Fortnite+Spider-Man | movie | 0 of top 200 | no, take turns | — | outside top 200 |
| Taylor Swift+Gilmore Girls × Fortnite+Spider-Man | music | 0 of top 200 | no, take turns | — | outside top 200 |
| Taylor Swift+Gilmore Girls × Fortnite+Spider-Man | evening | 5 of top 200 | yes | #78 | #78 |
| BTS+Squid Game × Pink Floyd+Star Wars | morning | 58 of top 100 | yes | #7 | #12 |
| BTS+Squid Game × Pink Floyd+Star Wars | lunch | 3 of top 100 | yes | #31 | #31 |
| BTS+Squid Game × Pink Floyd+Star Wars | movie | 28 of top 200 | yes | #7 | #7 |
| BTS+Squid Game × Pink Floyd+Star Wars | music | 0 of top 200 | no, take turns | — | outside top 200 |
| BTS+Squid Game × Pink Floyd+Star Wars | evening | 18 of top 200 | yes | #38 | #100 |
| Adele+Downton Abbey × Travis Scott+Call of Duty | morning | 56 of top 100 | yes | #10 | #10 |
| Adele+Downton Abbey × Travis Scott+Call of Duty | lunch | 6 of top 100 | yes | #14 | #14 |
| Adele+Downton Abbey × Travis Scott+Call of Duty | movie | 1 of top 200 | yes | #177 | outside top 200 |
| Adele+Downton Abbey × Travis Scott+Call of Duty | music | 0 of top 200 | no, take turns | — | outside top 200 |
| Adele+Downton Abbey × Travis Scott+Call of Duty | evening | 6 of top 200 | yes | #35 | #35 |
| Elvis Presley+The Sound of Music × MrBeast+Spider-Man | morning | 58 of top 100 | yes | #7 | #32 |
| Elvis Presley+The Sound of Music × MrBeast+Spider-Man | lunch | 6 of top 100 | yes | #22 | outside top 100 |
| Elvis Presley+The Sound of Music × MrBeast+Spider-Man | movie | 6 of top 200 | yes | #80 | #80 |
| Elvis Presley+The Sound of Music × MrBeast+Spider-Man | music | 0 of top 200 | no, take turns | — | outside top 200 |
| Elvis Presley+The Sound of Music × MrBeast+Spider-Man | evening | 10 of top 200 | yes | #12 | #12 |
