# The Wire's voice bible

How Dynasty Media writes. All copy in the app is original; the tones are style
studies of how real college football media actually sounds, so the feed reads
like a media ecosystem instead of one narrator.

## Tones

| Tone | Study | Sounds like |
| --- | --- | --- |
| `wire` | Wire-service desks | Subject-verb-object, no flourish. "X beat Y 31-20 on Saturday." |
| `network` | National TV desks | Short, declarative, written to be read aloud. Scores lead. |
| `analytic` | Numbers-first columnists | Measured, mildly corrective, respects the schedule. |
| `hype` | Gameday-morning shows | Pageantry, superlatives, the sport as spectacle. |
| `column` | Longform columnists | Writerly, allowed one metaphor, earns its adjectives. |
| `irreverent` | Fan-brained blogs | Jokes first, all-caps within reason, zero distance from fandom. |

Article mastheads lean toward tones (the network desks pull `network`, the
magazine pulls `column`, the hype show pulls `hype`), but every bank carries
untagged templates so any outlet can cover anything.

## The variety guarantee

Every headline, dek, beat sentence and personality phrase lives in a bank with
a stable id. `voices.ts` keeps a per-season-cycle ledger (persisted in the
media state): a template that has run this cycle is not eligible again until
the season rolls over. When a bank runs dry mid-cycle the least-recently-used
third comes back into rotation — variety degrades gracefully instead of the
wire going silent. `scripts/media-check.ts` asserts idempotence and headline
uniqueness on every run.

## Facts only

Templates carry `{TOKEN}` slots filled from the save (names, scores, weeks,
yards, awards, bowls, rivalry names). A template that names a token the event
cannot fill never renders — nothing is invented, ever. Award names come from
the game's own `AwardTypeEnumTableEntry` via `src/shared/awards.ts`.

## Coverage map

| Beat | Trigger | Angle banks |
| --- | --- | --- |
| Games | schedule diff | user win (blowout/close/OT/standard), user loss (close/standard), league upset, ranked matchup |
| Rivalries | Rivalry-table pair match | rivalryWin / rivalryLoss, own wire route |
| Postseason | `SeasonGame` bowl refs | bowlWin/bowlLoss, playoffWin, nattyWin/nattyLoss |
| Polls | rank diffs | No. 1, poll entry/exit, rise/fall |
| Recruiting | commit diffs | commit, five-star, flip, portal transfer (gem noted in body) |
| Portal | roster departures | wire-post cascade (insider voice) |
| Coaching | staff diffs + JobOpening reasons | fired / hired / retired, hot seat |
| Stat lines | leaders sweep week-over-week deltas | 300+ pass, 150+ rush/recv single weeks |
| Streaks | schedule-derived | 4/6/8/10/12/15/20 straight, unbeaten variants |
| Weekly honors | `PlayerAward` Game rows | national/conference Players of the Week |
| Awards show | `LeagueHistoryAward` block signature | Heisman story + every user winner, real award names |
| Draft | roster `PLYR_DRAFTROUND` | round-by-round send-offs for user players |
| Features | baseline / season checkpoints | season-so-far, roster churn |

## The press corps

Fictional, always (house rule). The corps in `ecosystem.ts` covers the insider
(terse, sourced), the wire recap writer, the analytics desk, the carousel
tracker, the talk-radio shouter and his player-defending co-host, beat
writers, the anonymous chaos accounts — plus two additions from this pass:
**Chuck Dooley** of The Tap (the guy at the game, unfiltered) and **Marty
Fontaine** of The Fontaine Files (urbane wordplay host). Routing per event
lives in `EVENT_ROUTING`: a scoop breaks it, follow-ups file, takes arrive
late, and rumors occasionally front-run a firing.
