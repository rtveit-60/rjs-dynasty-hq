# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

CFB 27 dynasty players on PC first: anyone running an offline dynasty in EA Sports College Football 27 who installs the public release. The author's own Virginia and Duke dynasties are the test bed, not the audience. The user is at their desk between game sessions or with the game running on a second monitor, wanting to know the state of their program without screenshots, spreadsheets, or manual entry.

## Product Purpose

A live companion dashboard for a dynasty save. Point it at the save once; every time the game writes it, the dashboard reparses and refreshes. Success is two things together (decided 2026-09-01): the app becomes the thing a player opens every dynasty week alongside the game, and it lets them shape the dynasty through the save itself: editing players and recruits, building the recruiting board, adding budget and recruiting hours, flagging a coach for firing.

## Positioning

Everything shown comes from the player's own save file or their own installed game. No plausible-sounding data is ever filled in: archetype names, pitch names, award names, ability names, gear vocabulary, trophies, field art, and portraits are all extracted from the game's data, and when the save genuinely does not hold something the app says so. The one exception is labeled as the app's own: in-season award races are computed stat watch lists, tagged PROJ, because the game only records winners at its annual show.

Writes never touch the original save. Every edit goes to a sibling copy named `<save>_RJsEdited`, with a hash guard and timestamped backups, and the game loads that copy and recalculates overall ratings itself.

## Operating Context

- Windows desktop app (Electron) packaged as an NSIS installer with in-app updates from GitHub Releases. Fully offline at runtime; the launch-time update check is the only network call and can be switched off.
- The game writes saves in bursts to a OneDrive-redirected Documents folder; the app copies the save before parsing and never locks it.
- Per-machine extraction scripts pull the game's own art (field paint, state silhouettes, rivalry logos and trophies, portraits, UI icons) into a gitignored folder; the app renders drawn fallbacks when they are absent. Team and bowl logos ship bundled.
- One human coach per school is a game rule; the app scopes to the user's program automatically and can browse any other program's full Team HQ.
- Runs beside the game: the window can shrink to 720×560, the interface fits its zoom to window width, and light, dark, and system themes follow the desk.

## Capabilities and Constraints

- Four areas: Team HQ (program dashboard, this week's matchup, roster, drag-and-drop depth chart, recruiting office with weekly plans, NIL and budget, tendencies, playbook, team history), Recruiting (high-school class, transfer portal, scouting, create recruit), Dynasty Media (Media HQ with ticker and CFP bracket, the wire, social posts), Coaching Carousel (league-wide job security and openings).
- Profiles for every player, coach, and school open from any name, stack, and walk back with Esc. Each player profile opens the editor.
- Media stories are generated offline from save-to-save diffs by a fictional press corps; never a fabricated quote from a real save person.
- Data the save does not store is not shown: man/zone splits and blitz rate (verified absent), play-call history, stadium coordinates.
- Terminology follows the game: T/G/EDGE/OLB/MIKE position pools, the 57-man roster floor, the 35-offer scholarship cap, the game's own weekly action prices, and display names that differ from the save's internal identifiers (Signal Caller, Pocket Passer, Road Dog, Legion, DM the Player).
- Undecided: whether an app-set hot-seat flag survives played weeks on a winning team, and whether weekly plans are consumed by a processed week. Both are in-game watch items, not product claims.

## Brand Commitments

- Name: RJ's Dynasty HQ. App icon is the RJ monogram.
- Media outlets default to real network brands as a swappable brand pack, with a first-class fictional parody pack; outlet ids are pack-independent so stories relabel.
- Copy stays terse and factual on the page; explanations live behind info dots.

## Evidence on Hand

- README with feature descriptions and real screenshots in `docs/screenshots/` (program dashboard, matchup, recruiting office, depth chart, playbook, team history, profile, player editor, CFP bracket).
- Save-format research and verified data mechanisms in `docs/RESEARCH.md` and `docs/save-format/`; media voice bible in `docs/media-voice.md`.
- Regression harnesses in `scripts/` for parsing, profiles, filters, media generation, and save writes.
- No testimonials, user counts, or reviews exist. Do not invent them.

## Product Principles

1. Go to the game for game data. A wrong value that looks right is worse than a missing one.
2. The original save is sacred. Writes go to the sibling copy, user-initiated, validated, backed up.
3. Offline and quiet. No telemetry, no background requests, nothing phoned home.
4. Speak the game's language. Positions, pitches, awards, abilities, and prices use the names the player sees in the game.
5. Companion posture. Terse pages, live refresh, a footprint that fits beside the game.

## Accessibility & Inclusion

No binding requirement (decided 2026-09-01). AA contrast in both themes and keyboard-operable dialogs are maintained as engineering practice, not a product commitment.
