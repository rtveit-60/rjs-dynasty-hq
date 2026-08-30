# RJ's Dynasty HQ

A live companion dashboard for **EA Sports College Football 27** dynasty mode on PC.

Point it at your dynasty save once — from then on, every time the game writes that save, the dashboard refreshes itself. No screenshots, no spreadsheets, no manual entry. When you load a different save, it finds the program you're coaching on its own.

![Program Dashboard](docs/screenshots/program-dashboard.png)

## What it does

### Team HQ

Everything about your program, in one place.

- **Program Dashboard** — a win/loss graph of your seasons in your school's colors, with national titles carrying the CFP mark and every bowl showing its own logo. Beside it, your **athletic director's mandate**: this season's expectation in the AD's own words, a job-security meter with your national standing, contract years remaining, and your active season goals.
- **Roster & depth chart** — overalls, dev traits, class years, redshirts, size and speed, archetypes and hometowns; the full depth chart including situational spots. Every column sorts.
- **Recruiting Office** — your board with the game's own **Team Needs strip** (targeted/needed at every position, red while a need is unfilled), gem/bust flags, NIL offers against expectations, scheduled visits, your standing in each race, and **dealbreakers** — with a quiet warning dot when two of your own targets both demand playing time at the same spot. Click any target for their At a Glance card.
- **NIL & Budget** — income pillars with grades, spending, weekly staff points, NIL commitments.
- **Tendencies** — your real run/pass splits, third and fourth down rates, red-zone efficiency, and each coach's temperament sliders.
- **Playbook** — the actual book your coordinators run, browsable by formation family, with personnel groupings and every play listed.
- **Team History** — the all-time ledger and your rivalry series.

![Recruiting Office](docs/screenshots/recruiting-office.png)

### Profiles — click any name, anywhere

Every player, coach and school name in the app opens an ESPN-style profile card. Names inside a profile open more profiles; Esc walks back out.

- **Players** — a **Previous Game** score bug with their line from that game as stat tiles, season-by-season and career stats (transfers show every stop), full game logs, all ratings, named abilities, and — for quarterbacks — **NCAA passer rating** computed for every game, season and career line.
- **Recruits** — stars and ranks, the full pursuit race with influence bars, their dealbreaker, and their **three motivations with the ideal pitch** that matches them, straight from the game's own pitch definitions.
- **Coaches** — bio, contract and job security, the career ledger, and their full coaching history.
- **Schools** — a season browser with schedules and results, team stat panels, records and coaches year by year, and the all-time program ledger.
- **Real headshots** — profiles show actual in-game player and coach portraits once you extract them from your own installed game (see below).

![Player profile](docs/screenshots/profile.png)

### Recruiting

Three boards over the national class.

- **Highschool Recruiting** — every prospect in the class with stars, true overall, gem/bust, dev trait, pipeline, position and national rank, offers and commit tracking, under the same Team Needs strip as the office. **Clicking any recruit expands their At a Glance card**: the skills their position lives on, their mental and physical abilities, and their motivations and ideal pitch.
- **Transfer Portal** — the same board for portal transfers, which fills once your save reaches the offseason window.
- **Scouting Reports** — search the class by attribute. *Receivers with 92+ speed. Quarterbacks with 94+ throw power. Tackles over 6'6" and 300 pounds.* Stack as many thresholds as you like; each becomes its own sortable column.
- **Your edge** — flags recruits where your pipelines and program grades genuinely beat the schools actually competing for them.

![Recruiting board](docs/screenshots/recruiting-board.png)

![Scouting Reports](docs/screenshots/scouting-reports.png)

### Dynasty Media

A generated sports-media world built by diffing your saves — fully offline, no accounts, no API calls.

- **Media HQ** — a league dashboard: a **ticker** that switches between the Top 25 (with logos, records and poll movement), stat leaders ranked three deep per category, and award races projected under the game's **real award names**; the full AP Top 25; your program's season sheet; offense and defense leaders; and the award watch.
- **The Wire** — game stories with margin-aware writing, rivalry and bowl angles, poll movement, commits and flips, coaching changes, roster churn, weekly Players of the Week, stat lines, win streaks, the annual awards show and draft day — every article **bylined by a fictional press corps** of beat writers and columnists with their own voices, and no headline or story template repeating within a season. Click any story to read the full article.
- **Social** — a timeline of posts from the wire's personalities reacting to the news as it breaks.
- Real network branding by default, a fictional pack one toggle away.

![Media HQ](docs/screenshots/dynasty-media.png)

![The Wire](docs/screenshots/the-wire.png)

### Coaching Carousel

A league-wide job security board for every head coach and coordinator — hot seats, contract years, secure programs — plus an **openings forecast** built from save facts: who's on thin ice, whose deal is expiring, and which athletic directors have short patience.

![Coaching Carousel](docs/screenshots/carousel.png)

### Throughout

- **Auto-sync** — watches your save and re-reads it the moment the game writes. A status pill shows live/parsing/error at all times.
- **Knows whose dynasty it is** — loading a save selects the program you're coaching automatically; a save with several user-controlled teams asks which one is yours.
- **Real branding** — all 138 team logos and every bowl logo ship with the app; no downloads, no setup.
- **Correct names** — archetypes, award names, pitch names and ability names all read the way the game shows them, extracted from the game's own data rather than transcribed. (The identifiers lie: the save calls the "Gamer" pitch `ItsGameTime`.)
- **Team colors & themes** — the UI accents itself with your school's colors from the save; light, dark and system themes; an interface scale that fits itself to your window; remembers your save, school and window.

Everything works fully offline. Articles come from a deterministic template engine — no accounts, no API keys, no network calls. The only exception is an optional launch-time update check, which you can switch off.

## Requirements

- Windows 10/11
- EA Sports College Football 27 on PC (Steam, EA App, or Epic)
- An **offline (solo) dynasty** — online dynasty data lives on EA's servers, not in a local file

## Install

Grab the installer from the [Releases](../../releases) page and run it. That's it.

Your dynasty saves normally live in:

```
Documents\EA SPORTS College Football 27\saves\
```

The app auto-detects saves there (files starting with `DYNASTY-`) and lists them on first launch.

## Portraits

Profiles can show the game's real player and coach headshots. Because that art belongs to your installed copy of the game, it never ships with the app — you extract it yourself, once:

```
node scripts/extract-portraits.ts <your-save> <output-folder> --recruits
```

This reads your own install, pulls the portraits for your roster, the whole recruiting class and every coach, and writes them as PNGs (requires Node plus Python 3 with Pillow for the texture decode). Point the portrait folder in **Setup** at the output and every profile gains its headshot. The folder also accepts community portrait packs named by portrait id.

## Is my save safe?

Yes. The app is strictly **read-only** with your game files: it copies the save to its own cache folder before parsing and never opens your save for writing. Nothing it does can corrupt a dynasty.

## Build from source

```
npm install
npm run dev          # run in development
npm run parse:check  # parse a save from samples/ and print what the app sees
npm run dist         # build the Windows installer (release/)
```

Drop a dynasty save into `samples/` (gitignored) for `parse:check` and development.

Developer tools worth knowing about:

```
node scripts/filter-check.ts     # assert the recruiting filters and scouting queries hold
node scripts/profile-check.ts    # regression suite over the profile extractor
node scripts/media-check.ts      # run the media engine against a save and audit its output
node scripts/extract-awards.ts   # regenerate award names from the installed game
node scripts/extract-pitches.ts  # regenerate pitch names + motivations from the installed game
```

## Credits

- Save parsing is built on [madden-franchise](https://github.com/bep713/madden-franchise) (MIT) by bep713 — the backbone of the Madden/CFB save-editing community.
- Thanks to the CFB 27 modding community for the collective knowledge about the dynasty save format.

## License

[MIT](LICENSE)
