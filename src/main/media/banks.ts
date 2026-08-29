/**
 * Template banks for every story angle the wire covers. All copy is original,
 * written in studied styles: the national desk's flat SVO lines, broadcast
 * punch, analytic sobriety, gameday hype, columnist flourish, and the
 * irreverent fan-brained account. Tokens are filled from real save data only —
 * a template renders only when every token it names is available.
 *
 * Token glossary (not every angle uses every token):
 *   TEAM/NICK/OPP/OPPNICK  winner-perspective names unless the angle says otherwise
 *   SCORE "38-17" · MARGIN "21" · WEEK · COACH · CITY
 *   RANKTXT "No. 2 " (trailing space) for the subject team, may be empty
 *   RIVALRY rivalry series name · BOWL bowl name
 *   NAME/POS/STARS/STATE recruit or player · YDS/TDS/COUNT stat figures
 *   AWARD full award name · ROUND draft round ordinal · N streak length
 */
import type { Template } from './voices.ts';

export const HEADLINES: Record<string, Template[]> = {
  // ——— The user's team wins ———
  userWinBlowout: [
    { t: '{RANKTXT}{TEAM} demolishes {OPP}, {SCORE}' },
    { t: '{RANKTXT}{TEAM} leaves no doubt, hammers {OPP} {SCORE}' },
    { t: 'Rout in {CITY}: {TEAM} buries {OPP} {SCORE}', tones: ['network', 'wire'] },
    { t: '{TEAM} {SCORE}. That is the whole story.', tones: ['irreverent', 'network'] },
    { t: 'No mercy: {TEAM} blasts {OPP} by {MARGIN}' },
    { t: '{TEAM} turns {OPP} game into a scrimmage, wins {SCORE}', tones: ['irreverent', 'column'] },
    { t: 'It was {SCORE}. It was not that close.', tones: ['irreverent', 'analytic'] },
    { t: '{RANKTXT}{TEAM} piles it on {OPP} in a {MARGIN}-point statement' },
    { t: '{TEAM} runs {OPP} out of the building, {SCORE}', tones: ['network', 'hype'] },
    { t: 'Business as usual: {TEAM} cruises past {OPP} {SCORE}', tones: ['wire', 'analytic'] },
    { t: 'The {NICK} score at will in {SCORE} dismantling of {OPP}' },
    { t: '{TEAM} vs. {OPP} was over by halftime. Final: {SCORE}', tones: ['irreverent', 'network'] },
    { t: 'Statement Saturday: {TEAM} obliterates {OPP}' },
    { t: '{COACH} empties the bench early as {TEAM} rolls {OPP} {SCORE}' },
    { t: 'Flag it for mercy: {TEAM} {SCORE} over {OPP}', tones: ['irreverent'] },
    { t: '{RANKTXT}{TEAM} does whatever it wants against {OPP}' },
    { t: 'Another week, another {MARGIN}-point margin for {TEAM}', tones: ['analytic', 'wire'] },
    { t: '{TEAM} 60-minute clinic leaves {OPP} searching for answers' }
  ],
  userWinClose: [
    { t: '{RANKTXT}{TEAM} survives {OPP}, {SCORE}' },
    { t: '{TEAM} escapes {CITY} with a {SCORE} win over {OPP}' },
    { t: 'Heart-stopper: {TEAM} edges {OPP} by {MARGIN}' },
    { t: '{TEAM} holds off {OPP} in a white-knuckle {SCORE} finish' },
    { t: 'Cardiac {NICK}: {TEAM} sneaks past {OPP} {SCORE}', tones: ['hype', 'irreverent'] },
    { t: '{TEAM} finds a way, outlasts {OPP} {SCORE}' },
    { t: 'Every possession mattered. {TEAM} took one more: {SCORE}', tones: ['column', 'analytic'] },
    { t: '{COACH} exhales as {TEAM} closes out {OPP} {SCORE}' },
    { t: 'Down to the wire: {TEAM} gets the stop, gets the win, {SCORE}' },
    { t: '{TEAM} wins ugly — and will absolutely take it, {SCORE}', tones: ['irreverent', 'network'] },
    { t: 'One-score game, one-score answer: {TEAM} over {OPP}' },
    { t: '{RANKTXT}{TEAM} passes its gut check against {OPP}' }
  ],
  userWinOT: [
    { t: '{TEAM} outlasts {OPP} in overtime, {SCORE}' },
    { t: 'Bonus football, same result: {TEAM} takes {OPP} in OT' },
    { t: '{TEAM} refuses to lose, beats {OPP} {SCORE} in overtime' },
    { t: 'OT thriller in {CITY} goes to {TEAM}' },
    { t: 'Somebody had to blink. It was {OPP}. {TEAM} wins in OT', tones: ['irreverent', 'column'] },
    { t: 'Extra time, extra heartbreak for {OPP}: {TEAM} {SCORE}' },
    { t: '{COACH} calls it "a survival" — {TEAM} wins {SCORE} in OT' }
  ],
  userWin: [
    { t: '{RANKTXT}{TEAM} handles {OPP}, {SCORE}' },
    { t: '{TEAM} takes care of business against {OPP}' },
    { t: '{TEAM} controls it from the jump, beats {OPP} {SCORE}' },
    { t: 'Solid, unspectacular, 1-0 on the week: {TEAM} {SCORE}', tones: ['analytic', 'irreverent'] },
    { t: '{TEAM} answers every {OPP} push in {SCORE} win' },
    { t: '{NICK} stay on script, put away {OPP} {SCORE}' },
    { t: '{RANKTXT}{TEAM} does enough, and then some, against {OPP}' },
    { t: 'Four quarters, one winner: {TEAM} {SCORE}' },
    { t: '{COACH} gets what he asked for in {SCORE} win over {OPP}' },
    { t: '{TEAM} moves on from {OPP} with a workmanlike {SCORE}' }
  ],
  userLossClose: [
    { t: '{OPP} breaks {TEAM} hearts, {SCORE}' },
    { t: 'So close: {TEAM} falls to {OPP} by {MARGIN}' },
    { t: '{TEAM} runs out of magic in {SCORE} loss to {OPP}' },
    { t: 'One play short: {OPP} edges {TEAM} {SCORE}' },
    { t: 'A gut punch in {CITY}: {OPP} {SCORE}' },
    { t: '{TEAM} left everything out there. {OPP} left with the win.' , tones: ['column', 'network'] },
    { t: 'The margin was {MARGIN}. The sting will last longer.', tones: ['column'] },
    { t: '{COACH} on the {SCORE} loss: no answers yet, only film' }
  ],
  userLoss: [
    { t: '{OPP} hands {TEAM} a {SCORE} defeat' },
    { t: '{TEAM} has no response for {OPP} in {SCORE} loss' },
    { t: 'Rough Saturday: {OPP} beats {TEAM} {SCORE}' },
    { t: '{TEAM} comes up empty against {OPP}' },
    { t: 'Back to the drawing board after {OPP} wins {SCORE}' },
    { t: '{OPP} exposes the flaws in {SCORE} win over {TEAM}', tones: ['analytic', 'column'] },
    { t: 'Not their day: {TEAM} falls {SCORE}' },
    { t: '{OPP} {SCORE}. The tape will not be fun.', tones: ['irreverent', 'network'] }
  ],
  // ——— League games ———
  upsetWin: [
    { t: 'UPSET: {TEAM} stuns {RANKTXT2}{OPP}, {SCORE}' },
    { t: '{TEAM} shocks {RANKTXT2}{OPP} — and the sport', tones: ['network', 'hype'] },
    { t: 'Down goes {OPP}: {TEAM} pulls the {SCORE} stunner' },
    { t: 'Nobody saw it coming: {TEAM} topples {RANKTXT2}{OPP}' },
    { t: 'Bracket-breaker in {CITY}: {TEAM} over {RANKTXT2}{OPP}' },
    { t: '{TEAM} just torched a few million playoff predictions', tones: ['irreverent'] },
    { t: 'The scoreboard says {SCORE}. Check it twice.', tones: ['irreverent', 'column'] },
    { t: '{RANKTXT2}{OPP} walks into an ambush: {TEAM} wins {SCORE}' }
  ],
  bigGame: [
    { t: '{RANKTXT}{TEAM} outduels {RANKTXT2}{OPP} in a heavyweight {SCORE}' },
    { t: 'Top-25 showdown goes to {TEAM}, {SCORE}' },
    { t: '{TEAM} makes the statement in {SCORE} win over {RANKTXT2}{OPP}' },
    { t: 'The marquee delivered: {TEAM} {SCORE} over {OPP}' },
    { t: '{TEAM} wins the weekend headliner against {RANKTXT2}{OPP}' },
    { t: 'Measuring-stick game, and {TEAM} measured up', tones: ['analytic', 'network'] }
  ],
  // ——— Rivalry ———
  rivalryWin: [
    { t: '{TEAM} owns the {RIVALRY}, beats {OPP} {SCORE}' },
    { t: 'Bragging rights secured: {TEAM} takes the {RIVALRY}' },
    { t: 'The {RIVALRY} belongs to {TEAM} this year' },
    { t: '{TEAM} sends {OPP} home quiet in the {RIVALRY}, {SCORE}' },
    { t: 'Circle it in {TEAM} colors: {RIVALRY} final, {SCORE}' },
    { t: '365 days of bragging rights: {TEAM} {SCORE}', tones: ['irreverent', 'hype'] },
    { t: 'Rivalry week verdict: {TEAM}, emphatically, {SCORE}' }
  ],
  rivalryLoss: [
    { t: '{OPP} takes the {RIVALRY} — and the bragging rights, {SCORE}' },
    { t: 'A long year ahead: {TEAM} drops the {RIVALRY} to {OPP}' },
    { t: 'The {RIVALRY} goes the wrong way for {TEAM}, {SCORE}' },
    { t: '{OPP} wins the one that stings most' },
    { t: 'Rivalry week heartbreak: {OPP} {SCORE}' }
  ],
  // ——— Postseason ———
  bowlWin: [
    { t: '{TEAM} caps it with a {BOWL} win over {OPP}, {SCORE}' },
    { t: '{BOWL} champions: {TEAM} finishes the job, {SCORE}' },
    { t: 'Confetti for {TEAM}: {BOWL} final, {SCORE}' },
    { t: '{TEAM} sends the seniors out right in the {BOWL}' },
    { t: 'One last statement: {TEAM} takes the {BOWL} from {OPP}' },
    { t: '{COACH} lifts the {BOWL} trophy after {SCORE} win' }
  ],
  bowlLoss: [
    { t: '{OPP} spoils the trip: {TEAM} falls in the {BOWL}, {SCORE}' },
    { t: 'Bitter finish: {TEAM} drops the {BOWL} to {OPP}' },
    { t: 'The {BOWL} gets away from {TEAM}, {SCORE}' },
    { t: 'Long offseason starts now: {BOWL} loss, {SCORE}' }
  ],
  playoffWin: [
    { t: '{TEAM} survives and advances: {SCORE} over {RANKTXT2}{OPP}' },
    { t: 'Playoff football, {TEAM} style: {SCORE}' },
    { t: '{TEAM} punches through — {OPP} goes home, {SCORE}' },
    { t: 'The run continues: {TEAM} takes down {RANKTXT2}{OPP}' },
    { t: 'Win or go home. {TEAM} is not going home. {SCORE}', tones: ['network', 'hype'] }
  ],
  nattyWin: [
    { t: 'NATIONAL CHAMPIONS: {TEAM} takes it all, {SCORE}' },
    { t: '{TEAM} stands alone at the top of college football' },
    { t: 'The mountaintop: {TEAM} beats {OPP} for the title, {SCORE}' },
    { t: 'Etch it in stone — {TEAM}, champions of everything', tones: ['hype', 'column'] },
    { t: '{COACH} and {TEAM} finish the climb: {SCORE}' }
  ],
  nattyLoss: [
    { t: 'One game short: {OPP} denies {TEAM} the title, {SCORE}' },
    { t: 'The last one got away — {OPP} wins it all over {TEAM}' },
    { t: 'Runner-up hurts most: {TEAM} falls in the final, {SCORE}' }
  ],
  // ——— Polls ———
  pollNo1: [
    { t: '{TEAM} claims the No. 1 spot' },
    { t: 'New No. 1: {TEAM} takes over at the top' },
    { t: 'The view from the summit belongs to {TEAM}' },
    { t: 'All roads now go through {TEAM}' },
    { t: 'Poll shakeup puts {TEAM} on the throne', tones: ['hype', 'network'] },
    { t: 'Target acquired: everyone is chasing {TEAM} now', tones: ['irreverent', 'hype'] }
  ],
  pollEnter: [
    { t: '{TEAM} cracks the Top 25 at No. {RANK}' },
    { t: 'Poll debut: {TEAM} checks in at No. {RANK}' },
    { t: 'The voters noticed — {TEAM} is ranked' },
    { t: '{TEAM} crashes the rankings party at No. {RANK}' },
    { t: 'From receiving votes to No. {RANK}: {TEAM} arrives' }
  ],
  pollExit: [
    { t: '{TEAM} tumbles out of the rankings' },
    { t: '{TEAM} drops from the Top 25' },
    { t: 'A rough Saturday costs {TEAM} its ranking' },
    { t: 'The poll giveth, the poll taketh: {TEAM} is out', tones: ['irreverent', 'column'] }
  ],
  pollRise: [
    { t: '{TEAM} climbs to No. {RANK}' },
    { t: '{TEAM} rises to No. {RANK} in the latest poll' },
    { t: 'Up {DELTA}: {TEAM} now sits No. {RANK}' },
    { t: 'Momentum, meet the poll: {TEAM} up to No. {RANK}' },
    { t: 'The ascent continues — {TEAM} at No. {RANK}' },
    { t: 'Voters reward {TEAM} with a No. {RANK} billing' }
  ],
  pollFall: [
    { t: '{TEAM} slips to No. {RANK}' },
    { t: '{TEAM} falls to No. {RANK} after the weekend' },
    { t: 'Down {DELTA}: {TEAM} lands at No. {RANK}' },
    { t: 'The poll bill comes due — {TEAM} at No. {RANK}' }
  ],
  // ——— Recruiting ———
  commit: [
    { t: '{STARS}-star {POS} {NAME} commits to {TEAM}' },
    { t: '{TEAM} lands {STARS}-star {POS} {NAME}' },
    { t: '{NAME} is headed to {TEAM}' },
    { t: '{TEAM} adds {NAME} to the class' },
    { t: 'Board name off the board: {NAME} picks {TEAM}' },
    { t: '{STATE} standout {NAME} chooses {TEAM}' },
    { t: 'The {NAME} recruitment ends where it started: {TEAM}' }
  ],
  commit5: [
    { t: 'BOOM: five-star {POS} {NAME} commits to {TEAM}', tones: ['hype', 'irreverent'] },
    { t: 'Blue-chip haul: {TEAM} wins the {NAME} sweepstakes' },
    { t: 'Five-star alert — {NAME} picks {TEAM}' },
    { t: '{TEAM} beats them all for five-star {NAME}' },
    { t: 'The big one lands: {NAME} to {TEAM}' },
    { t: 'National recruit, national news: {NAME} commits to {TEAM}' }
  ],
  commitFlip: [
    { t: 'FLIP: {NAME} spurns {FLIPFROM} for {TEAM}' },
    { t: '{NAME} flips commitment from {FLIPFROM} to {TEAM}' },
    { t: 'Stolen off the porch: {TEAM} flips {NAME}', tones: ['irreverent', 'hype'] },
    { t: '{FLIPFROM} loses {NAME} — {TEAM} closes the deal' },
    { t: 'The flip season claims another: {NAME} to {TEAM}' }
  ],
  commitTransfer: [
    { t: '{TEAM} wins the portal battle for {POS} {NAME}' },
    { t: 'Portal splash: {NAME} transfers to {TEAM}' },
    { t: '{NAME} picks {TEAM} out of the portal' },
    { t: 'Instant-impact addition: {TEAM} lands transfer {POS} {NAME}' },
    { t: 'The portal gives: {NAME} to {TEAM}' }
  ],
  // ——— Coaching ———
  coachFired: [
    { t: '{TEAM} fires {ROLETXT} {OUTGOING}' },
    { t: '{OUTGOING} out at {TEAM}' },
    { t: '{TEAM} makes the move: {OUTGOING} dismissed' },
    { t: 'The seat finally gave way: {TEAM} parts with {OUTGOING}' },
    { t: 'End of the line for {OUTGOING} at {TEAM}' }
  ],
  coachHired: [
    { t: '{TEAM} turns to {INCOMING} as {ROLETXT}' },
    { t: '{OUTGOING} out, {INCOMING} in at {TEAM}' },
    { t: "It's official: {INCOMING} named {TEAM} {ROLETXT}" },
    { t: '{TEAM} gets its man: {INCOMING} takes the {ROLETXT} job' },
    { t: 'New era in {CITY}: {INCOMING} hired at {TEAM}' },
    { t: 'The search ends: {INCOMING} to {TEAM}' }
  ],
  coachRetired: [
    { t: '{OUTGOING} retires at {TEAM}; {INCOMING} steps in' },
    { t: 'A career ends at {TEAM}: {OUTGOING} calls it' },
    { t: '{OUTGOING} walks away — {INCOMING} inherits {TEAM}' }
  ],
  hotSeat: [
    { t: 'The seat under {COACH} is officially hot at {TEAM}' },
    { t: '{COACH} lands on the hot seat at {TEAM}' },
    { t: 'Job watch: {COACH} is coaching for his future' },
    { t: 'The buyout math has begun at {TEAM}' },
    { t: 'Patience expires in {CITY}: {COACH} on notice' },
    { t: 'Every loss counts double now for {COACH}' }
  ],
  // ——— Momentum & numbers ———
  streak: [
    { t: '{TEAM} makes it {N} straight' },
    { t: 'The streak hits {N}: {TEAM} keeps rolling' },
    { t: 'Nobody has solved {TEAM} in {N} games' },
    { t: '{N} in a row — {TEAM} is the hottest team going' },
    { t: 'Win No. {N} in a row goes to {TEAM}' }
  ],
  unbeaten: [
    { t: '{TEAM} is {REC} and still perfect' },
    { t: 'Zero losses, {W} wins: {TEAM} stays unbeaten' },
    { t: 'Perfect season watch: {TEAM} at {REC}' },
    { t: 'Still spotless — {TEAM} moves to {REC}' }
  ],
  statLinePass: [
    { t: '{NAME} carves up {OPP} for {YDS} passing yards' },
    { t: '{YDS} through the air: {NAME} torches {OPP}' },
    { t: '{NAME} puts on a passing clinic against {OPP}' },
    { t: 'Video-game numbers: {NAME} throws for {YDS}' },
    { t: '{NAME} picks {OPP} apart, {YDS} yards and {TDS} scores' }
  ],
  statLineRush: [
    { t: '{NAME} gashes {OPP} for {YDS} on the ground' },
    { t: '{YDS} rushing yards: {NAME} runs wild' },
    { t: '{NAME} carries {TEAM} — literally — with {YDS} yards' },
    { t: 'Ground and pound: {NAME} rolls up {YDS} on {OPP}' }
  ],
  statLineRecv: [
    { t: '{NAME} torches {OPP} for {YDS} receiving' },
    { t: '{YDS} receiving yards: {NAME} was uncoverable' },
    { t: 'Throw it anywhere near {NAME}: {YDS} yards later…' },
    { t: '{NAME} owns the secondary for {YDS} yards' }
  ],
  statLineDef: [
    { t: '{NAME} wrecks the {OPP} game plan' },
    { t: 'Defensive takeover: {NAME} everywhere against {OPP}' },
    { t: '{NAME} lives in the {OPP} backfield' }
  ],
  // ——— Awards ———
  weeklyAward: [
    { t: '{NAME} named {HONOR}' },
    { t: '{HONOR}: {NAME}' },
    { t: '{NAME} takes home {HONOR} honors' },
    { t: 'Hardware for {TEAM}: {NAME} is the {HONOR}' },
    { t: 'The league hands {NAME} the {HONOR} nod' }
  ],
  awardShow: [
    { t: '{NAME} wins the {AWARD}' },
    { t: 'The {AWARD} goes to {NAME}' },
    { t: '{NAME} caps the season with the {AWARD}' },
    { t: 'Awards night verdict: {NAME} takes the {AWARD}' }
  ],
  awardWin: [
    { t: '{NAME} brings the {AWARD} home to {TEAM}' },
    { t: '{TEAM} celebrates: {NAME} wins the {AWARD}' },
    { t: 'The {AWARD} is coming to {CITY}' },
    { t: '{NAME} adds the {AWARD} to the {TEAM} trophy case' }
  ],
  // ——— Draft ———
  draftPick: [
    { t: '{NAME} drafted in the {ROUND} round' },
    { t: 'Next level: {NAME} hears his name called in the {ROUND}' },
    { t: '{TEAM} sends {NAME} to the pros — {ROUND}-round pick' },
    { t: 'From {CITY} to Sundays: {NAME} goes in the {ROUND}' },
    { t: 'Draft day payoff: {POS} {NAME}, {ROUND} round' }
  ],
  // ——— Features ———
  seasonSoFar: [
    { t: 'State of the program: {TEAM} at {REC}' },
    { t: 'Where {TEAM} stands, {REC} in' },
    { t: '{TEAM} {NICK}: the season so far' },
    { t: 'Inside the {REC} start in {CITY}' },
    { t: 'The story of {TEAM}, so far' }
  ],
  rosterChurn: [
    { t: 'Roster churn at {TEAM}: {OUTC} out, {INC} in' },
    { t: 'The {TEAM} depth chart gets a shakeup' },
    { t: 'Comings and goings in {CITY}' },
    { t: '{TEAM} roster moves: the ins and outs' }
  ]
};

export const DEKS: Record<string, Template[]> = {
  userWin: [
    { t: 'Another one in the books.' },
    { t: 'A win is a win — this one counts double in the locker room.' },
    { t: 'The {NICK} keep rolling.' },
    { t: 'Style points optional.' },
    { t: 'It was over when it needed to be.' },
    { t: 'The standard holds.' },
    { t: 'File it and move on — there is more to play for.' },
    { t: 'Saturday, handled.' },
    { t: 'The scoreboard agreed with the film for once.' },
    { t: 'Winning weather in {CITY}.' }
  ],
  userLoss: [
    { t: 'A bitter one for the {NICK} faithful.' },
    { t: 'Back to the film room.' },
    { t: 'The margin for error just got thinner.' },
    { t: 'Short memory required.' },
    { t: 'They had answers all afternoon. We did not.' },
    { t: 'The tape will not be kind.' }
  ],
  league: [
    { t: 'The bracket-breakers strike again.' },
    { t: 'Handled business.' },
    { t: 'The poll voters will have notes.' },
    { t: 'One for the neutral fans.' },
    { t: 'The sport never sleeps.' },
    { t: 'Somewhere a playoff model just shuddered.' }
  ],
  rivalry: [
    { t: 'This one never needs a subtitle.' },
    { t: 'Hate week delivered.' },
    { t: 'A year of bragging rights, settled in four quarters.' },
    { t: 'Records go out the window. This one counts different.' }
  ],
  postseason: [
    { t: 'December football, settled in January terms.' },
    { t: 'The lights were bright. Somebody rose.' },
    { t: 'Legacy minutes.' },
    { t: 'Everything the season built, on one field.' }
  ],
  polls: [
    { t: 'The voters are paying attention.' },
    { t: 'Rankings are opinions. Wins are facts.' },
    { t: 'The climb continues.' },
    { t: 'Gravity works on Saturdays too.' },
    { t: 'A number next to the name changes conversations.' }
  ],
  recruiting: [
    { t: 'The class keeps building.' },
    { t: 'A big board name comes off it.' },
    { t: 'Momentum on the trail.' },
    { t: 'The future got faster.' },
    { t: 'Signed, sealed, celebrated.' },
    { t: 'Rooms like this are built one yes at a time.' },
    { t: 'Another domino falls the right way.' },
    { t: 'The board shrinks; the class grows.' },
    { t: 'A recruitment that ran quiet ends loud.' },
    { t: 'Add it to the February ledger.' },
    { t: 'The staff’s calls kept getting answered.' },
    { t: 'One more building block, delivered.' }
  ],
  coaching: [
    { t: 'The carousel spins.' },
    { t: 'A new voice in the building.' },
    { t: 'Sideline shakeup.' },
    { t: 'Change costs money. So does standing still.' },
    { t: 'The next press conference writes itself.' }
  ],
  awards: [
    { t: 'Hardware season.' },
    { t: 'The voters got this one right.' },
    { t: 'Put it in the trophy case.' },
    { t: 'Individual shine, team foundation.' },
    { t: 'A season’s work, condensed to a name on a trophy.' },
    { t: 'The ballots are in.' },
    { t: 'Recognition, delivered on schedule.' },
    { t: 'One more line for the media guide.' },
    { t: 'The campaign ends the way campaigns hope to.' },
    { t: 'Voted on, argued over, settled.' }
  ],
  numbers: [
    { t: 'The box score reads like a typo.' },
    { t: 'Numbers that need a second look.' },
    { t: 'Stat sheets remember.' },
    { t: 'That is production you game-plan around.' },
    { t: 'A stat line that will follow him all season.' },
    { t: 'The kind of afternoon charts are made of.' },
    { t: 'Volume and efficiency, same box score.' }
  ],
  feature: [
    { t: 'Catching the wire up on everything in {CITY}.' },
    { t: 'Where things stand, and where they point.' },
    { t: 'A checkpoint, not a verdict.' }
  ]
};

/** Connective sentences the article bodies draw from, one per beat. */
export const BEATS: Record<string, Template[]> = {
  nextUp: [
    { t: 'Up next: {NEXTOPP} in Week {NEXTWEEK}.' },
    { t: 'The schedule offers no rest — {NEXTOPP} awaits in Week {NEXTWEEK}.' },
    { t: 'Attention turns to {NEXTOPP} and Week {NEXTWEEK}.' },
    { t: 'Week {NEXTWEEK} brings {NEXTOPP}.' }
  ],
  record: [
    { t: 'The win moves {TEAM} to {REC} on the season.' },
    { t: '{TEAM} now sits {REC}.' },
    { t: 'That makes it {REC} for the {NICK}.' },
    { t: 'At {REC}, the resume keeps thickening.' }
  ],
  recordLoss: [
    { t: 'The loss drops {TEAM} to {REC}.' },
    { t: '{TEAM} falls to {REC} on the year.' },
    { t: 'At {REC}, the math changes a little.' }
  ],
  atmosphere: [
    { t: '{ATT} packed the stands.' },
    { t: 'A crowd of {ATT} got its money’s worth.' },
    { t: '{ATT} showed up. Most stayed to the end.' }
  ],
  gotw: [
    { t: 'The matchup had top billing as the Game of the Week, and it delivered an audience to match.' },
    { t: 'Billed as the weekend’s main event, it played like one.' }
  ],
  marginWide: [
    { t: 'A {MARGIN}-point margin doesn’t leave much to argue about.' },
    { t: 'The scoreboard read {SCORE}, and the gap was every bit of it.' },
    { t: 'Winning by {MARGIN} travels well: voters, recruits and opposing staffs all read the same number.' },
    { t: 'There are close calls, and then there are afternoons like this one.' },
    { t: 'Margins like {MARGIN} are how a team tells the country it isn’t asking permission.' }
  ],
  marginTight: [
    { t: 'The final margin: {MARGIN}. Games this tight turn on a handful of snaps.' },
    { t: 'A one-score finish, and every call down the stretch gets replayed all week.' },
    { t: 'At {MARGIN} points, this one stays in the rewatch rotation.' },
    { t: 'Nobody left early. A {SCORE} final doesn’t allow it.' },
    { t: 'One possession separated them at the end. That’s the whole story of the sport some weeks.' }
  ],
  otColor: [
    { t: 'Sixty minutes weren’t enough. The extra ones decided it.' },
    { t: 'It took overtime to separate them, which is its own kind of compliment to both.' },
    { t: 'Free football, as the broadcast calls it — expensive for one side.' },
    { t: 'Overtime strips a game to nerve and execution, and {SCORE} is where it landed.' }
  ],
  rankedOpp: [
    { t: 'Beating {RANKEDOPP} is the kind of line a resume gets built on.' },
    { t: '{RANKEDOPP} came in as the measuring stick. Measurements were taken.' },
    { t: 'Results against {RANKEDOPP} carry into December. This one will too.' },
    { t: 'Wins over teams ranked where {RANKEDOPP} sits are the currency the committee actually counts.' }
  ],
  rankedOppLoss: [
    { t: 'Losing to {RANKEDOPP} is survivable. The schedule will offer chances to prove it.' },
    { t: 'Against {RANKEDOPP}, the gap showed. The film will say exactly where.' },
    { t: 'No shame in a loss to {RANKEDOPP} — but the margin for the rest of the year just shrank.' }
  ],
  pollClose: [
    { t: 'Polls are arguments, and this week’s ballot made {TEAM}’s case out loud.' },
    { t: 'Voters moved {TEAM}. The schedule gets the next word.' },
    { t: 'The committee era taught everyone the same lesson: where {TEAM} sits now matters less than where it finishes.' },
    { t: 'Rankings are a snapshot, not a verdict — but {TEAM} will take the picture.' }
  ],
  recruitClose: [
    { t: 'Recruiting is inventory, and {TEAM} just added a {STARS}-star {POS} to the shelf.' },
    { t: 'Classes are built one name at a time. {TEAM} crossed a big one off the board.' },
    { t: 'A {STARS}-star pledge changes how the rest of the {TEAM} board gets worked.' },
    { t: 'The {POS} room at {TEAM} got more interesting today.' },
    { t: 'Every February story starts with a day like this one in the {TEAM} class.' }
  ],
  coachClose: [
    { t: 'Transitions are told in recruiting weekends and quiet staff-room hours. {INCOMING}’s starts now.' },
    { t: 'New {ROLETXT} hires get one honeymoon. {INCOMING}’s begins immediately.' },
    { t: 'The whiteboard belongs to {INCOMING} now. The results will belong to everyone.' },
    { t: 'Staff changes are bets on culture as much as scheme, and {TEAM} just placed one.' }
  ],
  hotSeatClose: [
    { t: 'Hot seats have their own physics, and {COACH} is living the math.' },
    { t: 'The buyout arithmetic is now part of every {TEAM} conversation, spoken or not.' },
    { t: 'Administrators say all the right things until the day they don’t. {COACH} knows the calendar.' },
    { t: 'Every remaining game on the {TEAM} schedule is now also a referendum.' }
  ],
  statClose: [
    { t: 'Numbers like {YDS} don’t hide. Award voters and opposing coordinators both keep them.' },
    { t: '{NAME}’s tape from this one becomes required viewing.' },
    { t: 'One afternoon, {YDS} yards. Seasons turn on games like it.' },
    { t: 'Defensive staffs game-plan the next month around outputs like {YDS}.' }
  ],
  streakClose: [
    { t: 'Streaks are schedule plus health plus a little luck. {N} in a row means all three held.' },
    { t: 'Nobody circles {TEAM} on a schedule anymore. They highlight it.' },
    { t: 'Win {N} straight and the conversation changes rooms — from local radio to national desks.' },
    { t: 'Every streak carries its own pressure. {TEAM} wears it well at {REC}.' }
  ],
  weeklyClose: [
    { t: 'Weekly hardware is small, but it stacks. {NAME}’s name is in the league’s ledger now.' },
    { t: '{HONOR} lists are where award campaigns start, and {NAME} just made one.' },
    { t: 'The film made the case. The league office just signed it.' }
  ],
  awardShowClose: [
    { t: 'Trophy night closes the book on {YEAR}. The arguments it settles last longer than the ones it starts.' },
    { t: 'Every award show writes the short version of a season. {YEAR}’s is now on the record.' },
    { t: 'The {YEAR} season has its named canon.' }
  ],
  awardWinClose: [
    { t: 'Hardware recruits. Every {TEAM} pitch this winter now includes the {AWARD}.' },
    { t: 'The {AWARD} goes in the case. The standard it sets stays in the building.' },
    { t: 'Individual trophies are program arguments — {TEAM} just gained one.' }
  ],
  draftClose: [
    { t: 'Draft calls are the receipts of player development, and {TEAM} just cashed one.' },
    { t: 'Draft night is the last box score of a college career. {NAME}’s reads well.' },
    { t: 'The next {TEAM} recruiting weekend will mention {NAME}’s name early and often.' }
  ]
};
