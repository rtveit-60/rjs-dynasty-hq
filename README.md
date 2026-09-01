# RJ's Dynasty HQ

A live companion dashboard for **EA Sports College Football 27** dynasty mode on PC.

Point it at your dynasty save once — from then on, every time the game writes that save, the dashboard refreshes itself. No screenshots, no spreadsheets, no manual entry. When you load a different save, it finds the program you're coaching on its own.

![Program Dashboard](docs/screenshots/program-dashboard.png)

## What it does

### Team HQ

Everything about your program, in one place — set on your stadium's real field, with your school's actual end-zone paint and midfield art pulled from your own installed game.

- **Program Dashboard** — a win/loss graph of your seasons in your school's colors, with national titles carrying the CFP mark and every bowl showing its own logo. Your **athletic director's mandate**: this season's expectation in the AD's own words, a job-security meter with your national standing, contract years remaining, and your active season goals. Your **pipeline map** with the game's own tier pins, and your full **program grades** sheet.
- **Roster & depth chart** — overalls, dev traits, class years, redshirts, size and speed, archetypes and hometowns; every column sorts. The **depth chart edits by drag and drop** — reorder any position window and save it back through the same protected copy the player editor uses.
- **Recruiting Office** — your board under the **Team Needs strip**: next season's 57-man floor drawn as literal seats per position — filled by returning players, gold for your commits, open where someone must be signed — with departures counted out the moment they're known. Each target row expands to their At a Glance card, and a quiet warning dot flags two of your own targets demanding playing time at the same spot.
- **Weekly Plan** — a per-target dialog with the game's real action prices: assign hours, schedule visits, offer the scholarship (against the hard 35-offer season cap), send the NIL offer, set the sway pitch — with your remaining hour pool bookkept live and options that would blow the week's budget locked out with a plain explanation.
- **Build the board** — add and drop targets right from either recruiting board, staged and saved in one write; **Create Recruit** invents a prospect from scratch: identity, stars, dev trait, measurables, and their whole look — face picked from the game's own head catalog, skin tone, body type, and every gear slot with real helmet-facemask compatibility.
- **NIL & Budget** — income pillars with grades, spending, weekly staff points, NIL commitments — plus **Fundraising** and **Hire Additional Recruiters** buttons that write more budget or recruiting hours into your save's protected copy.
- **Tendencies** — your real run/pass splits, third and fourth down rates, red-zone efficiency, and each coach's temperament sliders.
- **Playbook** — the actual book your coordinators run, browsable by formation family, with personnel groupings and every play listed.
- **Team History** — the all-time ledger and your rivalry series.
- **Visit any program** — the View Another Team menu opens the full Team HQ for any school in the country, every tab included.

![Recruiting Office](docs/screenshots/recruiting-office.png)

![Depth chart](docs/screenshots/depth-chart.png)

![Playbook](docs/screenshots/playbook.png)

### Profiles — click any name, anywhere

Every player, coach and school name in the app opens an ESPN-style profile card. Names inside a profile open more profiles; Esc walks back out.

- **Players** — a **Previous Game** score bug with their line from that game as stat tiles, season-by-season and career stats (transfers show every stop), full game logs, all ratings, named abilities, and — for quarterbacks — **NCAA passer rating** computed for every game, season and career line.
- **Recruits** — stars and ranks, the full pursuit race with influence bars, their dealbreaker, and their **three motivations with the ideal pitch** that matches them, straight from the game's own pitch definitions.
- **Coaches** — bio, contract and job security, the career ledger, and their full coaching history.
- **Schools** — a season browser with schedules and results, team stat panels, records and coaches year by year, and the all-time program ledger.
- **Real headshots** — profiles show actual in-game player and coach portraits once you extract them from your own installed game (see below).

![Player profile](docs/screenshots/profile.png)

### Player Editor

Every player and recruit profile opens into an editor — hit **✎ Edit**.

- Change **names and jersey numbers**, the position's full **rating sheet**, **mental abilities** and their tiers, and **physical ability tiers** — all validated against the save format's real limits before a single byte is written.
- Edit a rostered player's whole **appearance**: their face (picked from the game's head catalog, with portrait previews), skin tone, body type, and all eleven gear slots — helmet and facemask combinations restricted to pairs the game actually uses.
- **Your original save is never touched.** Saving writes a separate copy named `<save>_RJsEdited` beside the original, and the dashboard follows that copy from then on; load it in the game to play with your changes. Editing again updates the copy in place, after a timestamped backup.
- Overall recalculates in the game itself the next time it loads the save — the app never invents a number.

![Player editor](docs/screenshots/player-editor.png)

### Recruiting

Three boards over the national class, under the same Team Needs seats as the office.

- **Highschool Recruiting** — every prospect in the class with stars, true overall, height and weight, gem/bust, dev trait, pipeline, position and national rank, offers and commit tracking. A **Scheme Fit** dot shows how the recruit's archetype sits in your actual scheme — filled when your scheme starts that archetype, from the game's own per-scheme preferences — and the **Edge** arrow scores your program against the strongest school actually pursuing them: green when you hold a real advantage, red when you're behind. **Clicking any recruit expands their At a Glance card**: the skills their position lives on, their mental and physical abilities, and their motivations and ideal pitch.
- **Transfer Portal** — the same board for portal transfers, which fills once your save reaches the offseason window.
- **Scouting Reports** — search the class by attribute. *Receivers with 92+ speed. Quarterbacks with 94+ throw power. Tackles over 6'6" and 300 pounds.* Stack as many thresholds as you like; each becomes its own sortable column.

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

And when a CPU coach has worn out their welcome in your league: **Fire Coach**. It writes the carousel's real input — the hot seat itself — into your save's protected copy, so the game's own end-of-season machinery does the deed.

![Coaching Carousel](docs/screenshots/carousel.png)

### Throughout

- **Auto-sync** — watches your save and re-reads it the moment the game writes. A status pill shows live/parsing/error at all times.
- **Knows whose dynasty it is** — loading a save selects the program you're coaching automatically; a save with several user-controlled teams asks which one is yours.
- **Knows where your game is** — the install is auto-detected across Steam libraries and the usual locations; if yours lives somewhere unusual, point Setup at the folder once.
- **Real branding** — all 138 team logos and every bowl logo ship with the app; no downloads, no setup.
- **Correct names** — archetypes, award names, pitch names and ability names all read the way the game shows them, extracted from the game's own data rather than transcribed. (The identifiers lie: the save calls the "Gamer" pitch `ItsGameTime`.)
- **Team colors & themes** — the UI accents itself with your school's colors from the save; light, dark and system themes; an interface scale that fits itself to your window; remembers your save, school and window.
- **Diagnostics you can actually report** — the app keeps a small local log, and every error carries a short stable code (like `HQ-3F2A`). If something misbehaves, **Setup → Copy report** puts your version, environment and recent log on the clipboard, ready to paste into a bug report.

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

## Portraits and game art

Profiles can show the game's real player and coach headshots. Because that art belongs to your installed copy of the game, it never ships with the app — you extract it yourself, once:

```
node scripts/extract-portraits.ts <your-save> <output-folder> --recruits
```

This reads your own install, pulls the portraits for your roster, the whole recruiting class and every coach, and writes them as PNGs — texture decoding is built in, so plain Node is all it takes. Point the portrait folder in **Setup** at the output and every profile gains its headshot. The folder also accepts community portrait packs named by portrait id.

The same goes for the rest of the game's art the app can use — your stadium's field paint, state silhouettes, and interface icons:

```
node scripts/extract-field-art.ts
node scripts/extract-state-icons.ts
node scripts/extract-game-icons.ts
```

Each reads your install (found automatically, or set in **Setup → Game installation**) and drops PNGs where the app looks for them. Without them the app simply falls back to drawn stand-ins.

## Is my save safe?

Yes. The app never modifies your save: it copies the file to its own cache folder before parsing and never opens the original for writing.

The optional player editor follows the same rule by writing somewhere else entirely — using **Edit** in a player's profile creates a separate copy of your dynasty named `<save>_RJsEdited` next to the original and puts the changes there. Your original file keeps its exact bytes. Re-editing an edited copy updates that copy in place, after a timestamped backup is stored in the app's data folder. Load the `_RJsEdited` save in the game to play with your changes. Every save-writing feature — the editor, depth chart drag-and-drop, board edits, weekly plans, resources, Fire Coach, Create Recruit — goes through this one path.

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
node scripts/edit-check.ts       # regression suite over the player editor's save writes
node scripts/bc-check.ts         # prove the built-in texture decoder byte-exact against a reference
node scripts/extract-awards.ts   # regenerate award names from the installed game
node scripts/extract-pitches.ts  # regenerate pitch names + motivations from the installed game
```

## Credits

- Save parsing is built on [madden-franchise](https://github.com/bep713/madden-franchise) (MIT) by bep713 — the backbone of the Madden/CFB save-editing community.
- Thanks to the CFB 27 modding community for the collective knowledge about the dynasty save format.

## License

[MIT](LICENSE)
