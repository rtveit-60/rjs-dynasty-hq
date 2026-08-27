# Research Notes — CFB 27 Dynasty Central

_Last updated: 2026-08-27 (kickoff + parse spike, both same day)_

## Platform reality

- EA Sports College Football 27 released **July 9, 2026** on PS5, Xbox Series X|S, and — for the first time in the series — **Windows PC** (Steam, EA App, Epic Games Store). PC is feature-identical to console.
- The user plays on **Steam, on this machine**, running an **offline/solo dynasty** — the ideal case: saves are plain local files.

## Save files — CONFIRMED on this machine

- Folder: `C:\Users\Owner\OneDrive\Documents\EA SPORTS College Football 27\saves\`
- Dynasty saves use the **`DYNASTY-`** prefix (not Madden's `CAREER-`): manual saves are `DYNASTY-<NAME>`, autosaves append `-AUTOSAVE`. Road to Glory uses `RTG-`, plus `ROSTER-*` and `PROFILE-*` files. Each dynasty save is a fixed ~9.6 MB container.
- ⚠️ Documents is **OneDrive-redirected** and files carry reparse points (Files On-Demand). The watcher must tolerate OneDrive's extra FS events and possible placeholder hydration; always copy-then-parse, never parse in place.
- Two snapshots of the user's active Duke dynasty (`DYNASTY-DUKETOND`, 8/22 and its `-AUTOSAVE`, 8/24 — dynasty season year 2034, i.e. year 8) are in `samples/` (gitignored) — same dynasty at two points in time, perfect for developing the diff engine.

## Parsing — PROVEN with `madden-franchise`

[`madden-franchise`](https://github.com/bep713/madden-franchise) v4.3.6 (npm, MIT, ESM-only) loads the Duke save directly: detects `gameYear: 27`, applies bundled schema **468.2**, exposes **2,447 tables**. `await (mf.default).create(path)` → `franchise.getTableByName(name)` → `await table.readRecords()` → named fields on `table.records`. Full table inventory: `docs/save-format/tables.txt`; per-table field dumps: `docs/save-format/fields/`.

### Confirmed field-level reads (from the real save)

| Data | Where | Notes |
|---|---|---|
| Roster | `Player` (16,428 live / 16,500 cap, 282 fields) | `FirstName`, `LastName`, `JerseyNum`, `Position`, `OverallRating`, `SchoolYear` (Freshman…), `RedshirtStatus`, `Height`, `Weight`, skill ratings |
| Portraits | `Player.PLYR_PORTRAIT` (int id) + `PortraitForceSilhouette`, `PortraitSwappableLibraryPath` | Portrait id exists per player → resolvable against community portrait packs |
| Recruits | `Player` rows (recruits are Players: `ProspectStarRating`, `TraitDevelopment`, `Motivation1-3`, `PLYR_HOME_STATE`) + `Recruit` (4,101 live: `CommitScore`, `NationalRank`, `PositionRank`, `StateRank`, `ProductionGrade`, alt positions) | Identity joins via binary refs |
| Per-school pursuit | `RecruitTarget` (4,382 live, 20 fields) | `CurrentNILOffer`, `NILExpectation`, `ScholarshipStatus`, `CommittedWeekNumber`, `ActivePitches`, `ScheduledVisit`, `ProspectInfluenceTotal`, `UnlockedIntelBitfield`, hours spent |
| Pipelines | `SchoolPipelineInfluence` (1,365 live) | e.g. `{Pipeline: "EastTexas", InfluenceLevel: "Respected", InfluenceValue: 69}` |
| Schemes/playbooks | `Team` fields | `CurrentOffensiveScheme: "OFF_WEST_COAST_ZONE_RUN"`, `CurrentDefensiveScheme: "DEF_BASE4_3"`, plus `OffensivePlaybookDataType[]`/`DefensivePlaybookDataType[]`, `Scheme[]` tables |
| NIL / budget | `Team.NILProgramPointsSpent`, coordinator point budgets; `BudgetSummaryEntry`, `TeamRevenueTable`, `ProgramPointsBudgetAllocationPosture[]` | Budget entry instance sampled was empty — find the live instance |
| Season state | `SeasonInfo` | `CurrentSeasonYear`, `CurrentWeek`, `CurrentWeekType`, stage fields — anchors the diff engine timeline |
| Games/schedule | `SeasonGame[]`, `PendingSeasonGame[]`, `ScheduleKnownGames`, quarter-by-quarter scores, `IsGameOfTheWeek` | Sampled a cap-1 stub instance; select the real instance by tableId |
| Depth chart | `DepthChart` — one ref per position slot (QB, HB, …, KR, PR) | Resolve refs to ordered entry lists |
| Media raw material | `NewsManager_*` reactions (recruit commits, poll moves, coach contract updates, injuries, depth chart changes), `HeismanAwardRanking`, `SeasonStandings`, `CoachCarousel*`, `AddToTransferPortalEvent`, `RivalryManager_GameEndEventReaction`, `TeamHistoricSeriesYear` (rivalry series history), `TrophyRoom*` | The game's own event system mirrors the Dynasty Media feature |

### Confirmed during milestone 1 (all verified in code)

- Binary refs are 32 bits: first 15 = tableId, last 17 = row. `Team.Roster` → array table of Player refs works as the roster join (85 players for the user's Duke team); `Team.DepthChart` → per-position slot refs → ordered Player refs (35 slots incl. situational: 3DRB, PWHB, SLCB, RLE/RRE/RDT, KOS, GAD).
- `Player.Weight` is stored as **pounds − 160** (Madden lineage) — always add 160.
- Team naming: `LongName` = school ("Duke"), `NickName` = mascot ("Blue Devils"), `DisplayName` similar to LongName. 143 named teams in the Team main table.
- Dev traits: `Normal`, `College_Impact`, `College_Star`, `College_Elite`. SchoolYear: Freshman…Senior; RedshirtStatus: `Eligible`, `Previous` (more values likely league-wide).
- `TEAM_BACKGROUNDCOLORR/G/B` (+`R2/G2/B2` secondary) are 0–255 team colors and match real branding (Duke `#1f3d7b`, Alabama `#b30839`).
- Parse cost: ~300ms initial load; re-scoping to another school from a cached parse ~7ms. Full refresh (hash+copy+parse+extract) comfortably under 2s.

### Coach table — schema drift, SOLVED (2026-08-27)

- The bundled C27_468_2 schema **contains** a `Coach` definition (137 attributes), but the save's Coach table header declares **138 members** — a title update added a field. madden-franchise's `set schema` silently refuses on any attribute-count mismatch and falls back to generic `Field_N` names, which also kills table2 string decoding (names).
- Field layout comes from the file's own offset table, paired to schema attributes **by index** — so the fix (implemented in `src/main/parser/coach-schema.ts`) inserts one pad attribute and scans insertion positions, scoring decoded records against plausibility oracles (readable names, sane ages, valid team indexes). Verified: user coach decodes fully (name, `IsUserControlled: true`, `Position: HeadCoach`), real coach names league-wide.
- **The Coach table is the Tendencies/Playbook goldmine**: `COACH_OFFTENDENCYRUNPASS`, `COACH_DEFTENDENCYRUNPASS`, `COACH_OFFTENDENCYAGGRESSCONSERV`, `COACH_DEFTENDENCYAGGRESSCONSERV`, `COACH_RBTENDENCY`, `COACH_ADAPTIVE_AI`, `COACH_NO_HUDDLE_TEMPO`, `COACH_DEFENSETYPE`, `OffensivePlaybook`/`DefensivePlaybook` (refs), `OffensiveScheme`/`DefensiveScheme`, plus `CoachPrestige` (e.g. "Aplus"), `AlmaMater`, `HomeState`, contract fields, per-position ratings (`COACH_QB`…`COACH_S`), and `PrimaryPipeline`.
- **Coach↔Team join**: `Coach.TeamIndex` matches `Team.TeamIndex` (a field), NOT the Team table row. 255 = unemployed. `Position` enum: HeadCoach, OffensiveCoordinator, DefensiveCoordinator.
- **User detection**: `FranchiseUser` (table 4349) is schema'd; its `UserEntity` ref points at the user's Coach row. Simpler still: `Coach.IsUserControlled`. Both verified.

### School city/state — save stores no readable strings (worked around)

`Team.City` and `Team.Stadium` are asset-style references (high bit set, ids beyond the in-save table range) that resolve into the game's FTC/common data files, not the save; the save's own asset table and the lib's interned-string lookups don't cover them, and a raw string-pool scan found no constant offset base. Workaround: `src/main/data/school-locations.ts` ships static city/state for all 138 real schools keyed by exact `LongName` (custom TeamBuilder schools show no location). Revisit only if FTC parsing lands for another feature.

### Team HQ tabs — data map (all verified 2026-08-27)

- **Budget/NIL** — everything on the Team record: `ProgramPointBudget` (total), `RemainingProgramPoints`, `RolloverProgramPoints`; income pillars `BrandExposureProgramPoints`, `ProgramTraditionsProgramPoints`, `StadiumAtmosphereProgramPoints`, `ConferencePrestigeProgramPoints`, `CoachContractGoalsProgramPoints` (pillars + rollover sum exactly to the total); spends `NILProgramPointsSpent`, `StaffProgramPointsSpent`, `RecruitProgramPointsSpent`, `FacilitiesProgramPointsSpent`; grades `ProgramPoints*Grade` ("Aplus" → A+); weekly staff points `HeadCoachProgramPointBudget` / `OffensiveCoordinatorPointBudget` / `DefensiveCoordinatorPointBudget`.
- **Season splits** — `Team.TeamGameStatsRegSeason` → TeamStats[] with one `TeamStats` row per played game (sum for current season); `Team.TeamSeasonStats` → array of completed-season totals (last entry = last season). `TeamStats` covers attempts/yards both ways, 3rd/4th downs, red zone, sacks, takeaways/giveaways. `Team.TeamTendencyStats` is a **null ref** — per-play man/zone/blitz data is not stored; coach sliders are the honest proxy.
- **Coach sliders** — `COACH_OFFTENDENCYRUNPASS` (higher = run: Air Force option HC reads 63), `COACH_OFF/DEFTENDENCYAGGRESSCONSERV` (higher = aggressive: conservative AF HC reads 38), `COACH_DEFTENDENCYRUNPASS` usually 0/unused. Coordinators carry their own sliders.
- **Recruiting board** — `Team.RecruitingBoard` → `RecruitingBoard` row (`RecruitingHoursTotal/Assigned`) → `Recruits` ref → RecruitTarget[] array (indexed by TeamIndex) → rows in `UserRecruitTarget` (user school, has `IsFavorite`) or `RecruitTarget` (CPU schools) → `Recruit` ref → `Recruit` row (`QualityModifier` is a literal **GEM/BUST/NORMAL** field; `RecruitStage`: Top10/Top5/Top3/Battle/SoftCommitted/HardCommitted; ranks, offers) → `Player` ref for name/`ProspectStarRating` (FIVE_STAR… enum)/position/home state. `Recruit.TopSchoolsList` → ProspectTargetSchool[] → `{TeamId, TeamInfluence}` = pursuing schools (TeamId is TeamIndex space; committed recruits cap influence at 1000).

### Recruiting page — data map (verified 2026-08-27)

- **Pipelines**: `Team.SchoolPipelineInfluenceList` → SchoolPipelineInfluence[] → `{Pipeline, InfluenceLevel, InfluenceValue}` per school. `Player.HomePipeline` puts every recruit in a pipeline (43 regions, enum `Pipeline`). Tier ladder (enum `PipelineInfluenceLevel`): Unrecognized → NicheInterest → Respected → Popular → HouseholdName → CulturalPillar.
- **School report card**: `Team.MySchoolTrackingTable` → `MySchoolTrackingTable` row per school: `AcademicPrestigeGrade`, `AthleticFacilitiesGrade`, `BrandExposureGrade`, `CampusLifestyleGrade`, `ChampionshipContenderGrade` (+current/`+1/+2/+3` year ranks), `CoachPrestigeGrade`, `CoachStabilityGrade`, `ConferencePrestigeGrade`, `ProgramTraditionGrade`, `StadiumAtmosphereGrade`, and `ProPotentialGrade{QB,RB,WR,TE,OL,DL,LB,DB,K,P}` — grades as "Aplus"-style strings. This exists for ALL schools → comparative advantage math.
- **Recruit motivations** (`Player.Motivation1-3`) are empty ("0000") in this save — the pitch system (`ActiveRecruitingPitch`: `{Intensity: "HardSell", Pitch: "ItsGameTime"}`) is per-target user choice, not recruit-global. Motivations skipped.
- **Class types** (`Recruit.Class`): HighSchool + JuniorCollege_(Sophomore/Junior/Senior). Transfers appear later in the cycle.
- **Edge model** (app logic, not save data): Pipeline (user tier ≥ Popular and above every rival in the recruit's race), Pro Potential (full letter grade over a credible B-or-better rival at the recruit's position group), Home State (school state = recruit state), Leading (user tops the influence race). "MySchoolSummaryEntry" is only a user grade-change log — not the report card.

### Schedule & results (Dynasty Media backbone, verified 2026-08-27)

- Main `SeasonGame` table = the instance with capacity > 100 (id 6347 here, 943 live): `HomeTeam`/`AwayTeam` refs into the Team main table, `HomeScore`/`AwayScore` (+ per-quarter + OT), `GameStatus` (HomeWon/AwayWon/Unplayed/Unscheduled), `SeasonWeek`, `SeasonWeekType`, `SeasonYear` (dynasty-year index, = SeasonInfo.CurrentYear), `IsGameOfTheWeek` + `GameOfTheWeekScore`, `IsOvertimeGame`, `BroadcastNetwork` (NationalTV/Streaming), `Attendance`, weather fields, `IsRematch`.
- `MediaPoll_CurrentRank` ranks ALL teams (1–136), not just 25 — treat ≤25 as "ranked" for display. `MediaPoll_LastWeeksRank` enables poll-move stories without history.
- Media engine design: per-school `MediaState` (ranks, played-game keys, commits, staff, roster names) persisted under `userData/media/`; diff on each parse emits id-deduped events; season change or school switch triggers a baseline "season so far" seed. Articles are deterministic (seeded variants keyed on event id) so re-parses are idempotent.

### Known wrinkles (normal reverse-engineering work, none blocking)

1. **Duplicate table names.** `getTableByName` returns the first match; e.g. the first `Team` is a cap-1 stub and the first `Coach` instance has no schema (generic `Field_N` names). Select instances by **tableId** (use `getAllTablesByName`, pick by capacity/schema presence). The community (cfb27-aio-app) hardcodes table ids — consult their constants.
2. **Joins are binary refs** — 32-bit strings encoding table+row (`Recruit`, `HomeTeam`, depth chart slots). The lib's `utilService` decodes them.
3. **Gem/bust** — no literal field found yet on `Player`; likely derived from scouting state (`UnlockedIntelBitfield` + true rating vs `ProspectStarRating`) or in `RecruitSummaryEntry`/`RecruitScoreEval`. Verify against in-game UI.
4. **Tendencies** — pass/run % is computable from season stat splits (`SeasonOffensiveStats` etc.). Man/zone % and blitz rate have no confirmed field yet; scheme identity is confirmed and is the fallback. Investigate `Coach` (schema'd instance) and gameplan tables.
5. **Coach data** — first instance schema-less; the real coach records (names, schemes, contracts) need the correct instance or related staff tables.

## Portraits

- CFB 27 PC has an active Frosty-based asset-modding scene ([MMC Frosty Modding Tools](https://github.com/bphit4/MMC-Frosty-Modding-Tools), [CFBMods](https://www.cfbmods.com/)); community portrait packs replace generic portraits and are keyed by portrait id.
- Plan: resolve `PLYR_PORTRAIT` against a user-imported portrait pack folder; fall back to generated team-colored avatars. Direct Frostbite extraction is out of scope for v1.

## Ecosystem (prior art, all confirming feasibility)

- [`cfb27-aio-app`](https://github.com/elrey-430/cfb27-aio-app) — Electron + madden-franchise community editor (pipelines, recruits); good reference for table ids.
- [CFB Clipboard](https://www.cfbclipboard.com/) — web dynasty tracker that ingests CFB 27 saves (games, stats, progression, NIL budget), proving the data is all in the file.
- CFB27 Dynasty Hub, MaxPlaysCFB, CollegeFootball.gg — manual-entry/analytics tools; our differentiator is local auto-sync + media generation.

## Stack decision

**Electron, not Tauri.** The only maintained CFB 27 save parser is a Node.js library; Tauri would require bundling a Node sidecar, erasing its size advantage. Electron + electron-vite + React + TypeScript + Tailwind; better-sqlite3 snapshot history + diff engine → DynastyEvents; chokidar watcher (debounced, OneDrive-aware); electron-builder NSIS installer + auto-update.
