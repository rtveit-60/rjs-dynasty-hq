/**
 * The wire's article desk. Every story picks its headline and dek from the
 * template banks in banks.ts through the season-cycle variety ledger, so no
 * two stories in one cycle share a line. Facts come from the save; templates
 * that need a missing fact simply never render.
 */
import type {
  AnnualAwardWinner,
  ClassRecruit,
  GameInfo,
  MediaEvent,
  TeamInfo,
  WeeklyAward
} from '../../shared/types.ts';
import { AWARD_NAMES } from '../../shared/awards.ts';
import type { MediaContext } from './engine.ts';
import { BEATS, DEKS, HEADLINES } from './banks.ts';
import { sayFresh, type VarietyLedger } from './voices.ts';

export type RawEvent =
  | { kind: 'userGame'; id: string; game: GameInfo; rivalryName?: string | null; ctx: MediaContext }
  | { kind: 'bigGame'; id: string; game: GameInfo; rivalryName?: string | null; ctx: MediaContext }
  | { kind: 'pollMove'; id: string; from: number; to: number; teamRow: number; ctx: MediaContext }
  | { kind: 'commit'; id: string; recruit: ClassRecruit; flipFrom: string | null; seeded?: boolean; ctx: MediaContext }
  | {
      kind: 'coachChange';
      id: string;
      teamRow: number;
      role: 'HC' | 'OC' | 'DC';
      incoming: string;
      outgoing: string;
      /** From the save's JobOpening ledger when the carousel is live: Fired / Retired / Pro / NewJob / ContractEnding. */
      leaveReason?: string | null;
      ctx: MediaContext;
    }
  | { kind: 'rosterMove'; id: string; departures: string[][]; arrivals: string[][]; ctx: MediaContext }
  | { kind: 'hotSeat'; id: string; teamRow: number; coach: string; pct: number; yearsRemaining: number; ctx: MediaContext }
  | { kind: 'seasonSoFar'; id: string; ctx: MediaContext }
  | {
      kind: 'statLine';
      id: string;
      cat: 'pass' | 'rush' | 'recv';
      playerRow: number;
      name: string;
      position: string;
      teamRow: number;
      oppRow: number;
      yards: number;
      week: number;
      ctx: MediaContext;
    }
  | { kind: 'streak'; id: string; n: number; wins: number; losses: number; unbeaten: boolean; ctx: MediaContext }
  | { kind: 'weeklyAward'; id: string; award: WeeklyAward; ctx: MediaContext }
  | { kind: 'awardShow'; id: string; year: number; winners: AnnualAwardWinner[]; ctx: MediaContext }
  | { kind: 'awardWin'; id: string; year: number; winner: AnnualAwardWinner; ctx: MediaContext }
  | { kind: 'draftPick'; id: string; name: string; position: string; round: number; ctx: MediaContext };

const AFFINITY: Record<RawEvent['kind'], string[]> = {
  userGame: ['fox', 'cbs', 'espn'],
  bigGame: ['gameday', 'espn', 'fox'],
  pollMove: ['espn', 'cbs'],
  commit: ['si', 'espn', 'gameday'],
  coachChange: ['espn', 'si'],
  hotSeat: ['espn', 'si'],
  rosterMove: ['espn', 'cbs'],
  seasonSoFar: ['si', 'gameday'],
  statLine: ['espn', 'fox', 'gameday'],
  streak: ['gameday', 'cbs', 'si'],
  weeklyAward: ['espn', 'cbs'],
  awardShow: ['gameday', 'espn'],
  awardWin: ['si', 'espn'],
  draftPick: ['espn', 'cbs']
};

/** Each masthead leans toward a template tone. */
const OUTLET_TONE: Record<string, string> = {
  espn: 'network',
  fox: 'network',
  cbs: 'analytic',
  gameday: 'hype',
  si: 'column'
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const pickArr = <T,>(arr: T[], seed: string, salt = 0): T => arr[(hash(seed) + salt) % arr.length];

const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'];

function recordThrough(ctx: MediaContext, row: number, week: number): { w: number; l: number } {
  let w = 0;
  let l = 0;
  for (const g of ctx.snapshot.games) {
    if (g.status === 'unplayed' || g.week > week) continue;
    if (g.homeRow === row) g.status === 'home' ? w++ : l++;
    else if (g.awayRow === row) g.status === 'away' ? w++ : l++;
  }
  return { w, l };
}

function nextOpponent(ctx: MediaContext, row: number, afterWeek: number): { name: string; week: number } | null {
  const upcoming = ctx.snapshot.games
    .filter((g) => g.status === 'unplayed' && g.week > afterWeek && (g.homeRow === row || g.awayRow === row))
    .sort((a, b) => a.week - b.week)[0];
  if (!upcoming) return null;
  const oppRow = upcoming.homeRow === row ? upcoming.awayRow : upcoming.homeRow;
  const opp = ctx.teamsByRow.get(oppRow);
  return { name: rankedLabel(opp), week: upcoming.week };
}

function rankedLabel(t: TeamInfo | undefined): string {
  if (!t) return 'an unknown program';
  return t.rank > 0 && t.rank <= 25 ? `No. ${t.rank} ${t.longName}` : t.longName;
}

function base(r: RawEvent, priority: number, aboutUser: boolean, tags: string[]) {
  return {
    id: r.id,
    createdAt: Date.now(),
    seasonYear: r.ctx.seasonYear,
    week: r.ctx.week,
    weekType: r.ctx.weekType,
    priority,
    aboutUser,
    tags,
    outlet: pickArr(AFFINITY[r.kind], r.id)
  };
}

type Tokens = Record<string, string>;

/** Headline from a bank; the last-resort fallback keeps the wire alive. */
function head(
  ledger: VarietyLedger,
  key: string,
  seed: string,
  tokens: Tokens,
  tone?: string,
  fallback = ''
): string {
  return sayFresh(ledger, `h:${key}`, HEADLINES[key] ?? [], seed, tokens, tone) ?? fallback;
}

function dek(ledger: VarietyLedger, key: string, seed: string, tokens: Tokens): string {
  return sayFresh(ledger, `d:${key}`, DEKS[key] ?? [], seed, tokens) ?? '';
}

function beat(ledger: VarietyLedger, key: string, seed: string, tokens: Tokens): string {
  return sayFresh(ledger, `b:${key}`, BEATS[key] ?? [], seed, tokens) ?? '';
}

// ---------------------------------------------------------------------------

function gameStory(
  r: Extract<RawEvent, { kind: 'userGame' | 'bigGame' }>,
  ledger: VarietyLedger
): MediaEvent {
  const { game: g, ctx } = r;
  const home = ctx.teamsByRow.get(g.homeRow);
  const away = ctx.teamsByRow.get(g.awayRow);
  const homeWon = g.status === 'home';
  const winner = homeWon ? home : away;
  const loser = homeWon ? away : home;
  const winScore = homeWon ? g.homeScore : g.awayScore;
  const loseScore = homeWon ? g.awayScore : g.homeScore;
  const margin = winScore - loseScore;
  const upset = (winner?.rank ?? 0) === 0 && (loser?.rank ?? 99) <= 15;
  const isUser = r.kind === 'userGame';
  const userWon = isUser && winner?.row === ctx.userRow;
  const userTeam = ctx.teamsByRow.get(ctx.userRow);

  const natty = /NationalChampionship/i.test(g.weekType) || /National Championship/i.test(g.bowlName ?? '');
  const playoff = !natty && !!g.bowlName && /CFP|Playoff|Quarterfinal|Semifinal|First Round/i.test(g.bowlName);
  const bowl = !natty && !playoff && !!g.bowlName;

  // Angle resolution, most specific first.
  let angle: string;
  if (isUser) {
    if (natty) angle = userWon ? 'nattyWin' : 'nattyLoss';
    else if (playoff && userWon) angle = 'playoffWin';
    else if (bowl) angle = userWon ? 'bowlWin' : 'bowlLoss';
    else if (r.rivalryName) angle = userWon ? 'rivalryWin' : 'rivalryLoss';
    else if (!userWon) angle = margin <= 8 ? 'userLossClose' : 'userLoss';
    else if (g.overtime) angle = 'userWinOT';
    else if (margin >= 24) angle = 'userWinBlowout';
    else if (margin <= 8) angle = 'userWinClose';
    else angle = 'userWin';
  } else {
    if (natty) angle = 'nattyWin';
    else if (r.rivalryName) angle = 'rivalryWin';
    else if (upset) angle = 'upsetWin';
    else angle = 'bigGame';
  }

  const perspective = isUser && !userWon ? userTeam : winner;
  const other = isUser && !userWon ? winner : loser;
  const homeTeamCity = home?.city ?? '';
  const tokens: Tokens = {
    TEAM: perspective?.longName ?? '',
    NICK: perspective?.nickName ?? '',
    OPP: other?.longName ?? '',
    OPPNICK: other?.nickName ?? '',
    SCORE: `${winScore}-${loseScore}`,
    MARGIN: String(margin),
    WEEK: String(g.week),
    CITY: homeTeamCity,
    COACH: perspective?.headCoach ?? '',
    RANKTXT: (perspective?.rank ?? 0) > 0 && (perspective?.rank ?? 99) <= 25 ? `No. ${perspective!.rank} ` : '',
    RANKTXT2: (other?.rank ?? 0) > 0 && (other?.rank ?? 99) <= 25 ? `No. ${other!.rank} ` : '',
    RIVALRY: r.rivalryName ?? '',
    BOWL: g.bowlName ?? ''
  };

  const b = base(
    r,
    isUser ? (userWon ? 92 : 90) + (g.gotw ? 4 : 0) + (natty ? 8 : 0) : 50 + (g.gotw ? 10 : 0) + (upset ? 8 : 0),
    isUser,
    [home?.longName ?? '', away?.longName ?? '', bowl || playoff || natty ? 'Postseason' : 'Results']
  );
  const tone = OUTLET_TONE[b.outlet];

  const headline = head(
    ledger,
    angle,
    r.id,
    tokens,
    tone,
    `${rankedLabel(winner)} beats ${rankedLabel(loser)}, ${winScore}-${loseScore}`
  );

  const dekKey = natty || playoff || bowl ? 'postseason' : r.rivalryName ? 'rivalry' : isUser ? (userWon ? 'userWin' : 'userLoss') : 'league';
  const dekLine = dek(ledger, dekKey, r.id, tokens);

  const scoreline = `${winScore}-${loseScore}${g.overtime ? ' in overtime' : ''}`;
  const p1: string[] = [
    `${winner?.longName ?? 'The winner'} ${homeWon ? 'defended home turf' : 'went on the road and won'}, beating ${loser?.longName ?? 'their opponent'} ${scoreline}${g.week ? ` in Week ${g.week}` : ''}.`
  ];
  if (r.rivalryName) p1.push(`The ${r.rivalryName} always carries extra freight, and this edition was no different.`);
  if (g.bowlName && !r.rivalryName) p1.push(`The stage: the ${g.bowlName}.`);
  if (g.gotw) p1.push(beat(ledger, 'gotw', r.id, tokens));
  if (g.attendance > 78000)
    p1.push(beat(ledger, 'atmosphere', r.id, { ...tokens, ATT: g.attendance.toLocaleString('en-US') }));
  if (upset) p1.push(`Nobody outside the ${winner?.nickName ?? ''} locker room saw it coming.`.replace('  ', ' '));

  const p2: string[] = [];
  const rec = winner ? recordThrough(ctx, winner.row, g.week) : null;
  if (rec && winner) {
    p2.push(
      beat(ledger, userWon || !isUser ? 'record' : 'recordLoss', r.id, {
        TEAM: (isUser && !userWon ? userTeam : winner)?.longName ?? '',
        NICK: (isUser && !userWon ? userTeam : winner)?.nickName ?? '',
        REC: isUser && !userWon
          ? (() => {
              const ur = recordThrough(ctx, ctx.userRow, g.week);
              return `${ur.w}–${ur.l}`;
            })()
          : `${rec.w}–${rec.l}`
      })
    );
  }
  if (isUser) {
    const next = nextOpponent(ctx, ctx.userRow, g.week);
    if (next) p2.push(beat(ledger, 'nextUp', r.id, { NEXTOPP: next.name, NEXTWEEK: String(next.week) }));
  } else if ((winner?.rank ?? 0) > 0 || (loser?.rank ?? 0) > 0) {
    p2.push('Expect the poll voters to take notice.');
  }

  return {
    ...b,
    week: g.week,
    type: r.kind,
    headline,
    dek: dekLine,
    body: [p1.join(' '), p2.join(' ')].filter(Boolean)
  };
}

function pollStory(r: Extract<RawEvent, { kind: 'pollMove' }>, ledger: VarietyLedger): MediaEvent {
  const { ctx } = r;
  const team = ctx.teamsByRow.get(r.teamRow);
  const isUser = r.teamRow === ctx.userRow;
  const name = team?.longName ?? 'A program';
  const rising = r.to > 0 && (r.from === 0 || r.to < r.from);
  const angle = r.to === 1 ? 'pollNo1' : r.from === 0 ? 'pollEnter' : r.to === 0 ? 'pollExit' : rising ? 'pollRise' : 'pollFall';
  const tokens: Tokens = {
    TEAM: name,
    NICK: team?.nickName ?? '',
    RANK: r.to > 0 ? String(r.to) : '',
    DELTA: r.from > 0 && r.to > 0 ? String(Math.abs(r.from - r.to)) : ''
  };
  const b = base(r, isUser ? 72 : 60, isUser, [name, 'Polls']);
  const rec = recordThrough(ctx, r.teamRow, ctx.week);
  return {
    ...b,
    type: 'pollMove',
    headline: head(ledger, angle, r.id, tokens, OUTLET_TONE[b.outlet], `${name} moves in the poll`),
    dek: dek(ledger, 'polls', r.id, tokens),
    body: [
      `${name} ${rising ? 'moved up' : r.to === 0 ? 'fell out of' : 'slid in'} the media poll this week${
        r.from > 0 && r.to > 0 ? `, going from No. ${r.from} to No. ${r.to}` : ''
      }. The ${team?.nickName ?? 'program'} sit at ${rec.w}–${rec.l} on the year.`
    ]
  };
}

function commitStory(r: Extract<RawEvent, { kind: 'commit' }>, ledger: VarietyLedger): MediaEvent {
  const { recruit: rec, ctx } = r;
  const school = rec.committedTo ?? 'a program';
  const isUser = school === ctx.userName;
  const gem = rec.quality === 'GEM';
  const rivals = rec.race.filter((s) => s.name !== school).map((s) => s.name);
  const classCount = (ctx.snapshot.school?.recruiting?.recruits ?? []).filter(
    (x) => x.committedTo === school
  ).length;

  const angle = r.flipFrom ? 'commitFlip' : rec.isTransfer ? 'commitTransfer' : rec.stars === 5 ? 'commit5' : 'commit';
  const tokens: Tokens = {
    TEAM: school,
    NAME: rec.name,
    POS: rec.position,
    STARS: String(rec.stars),
    STATE: rec.homeState.replace(/([a-z])([A-Z])/g, '$1 $2'),
    FLIPFROM: r.flipFrom ?? ''
  };
  const b = base(r, (isUser ? 40 : 8) + rec.stars * 9 + (gem ? 6 : 0), isUser, [school, 'Recruiting']);

  const p1 = [
    `${rec.name}, a ${rec.stars}-star ${rec.position}${rec.isTransfer ? ' out of the transfer portal' : ` out of ${tokens.STATE}`}${
      rec.nationalRank ? ` ranked No. ${rec.nationalRank} nationally` : ''
    }, has committed to ${school}.`
  ];
  if (rivals.length) p1.push(`He picked the ${school} offer over ${rivals.slice(0, 2).join(' and ')}.`);
  if (gem) p1.push('Scouts who have seen him up close call him a gem — the ranking may be underselling it.');
  const p2 =
    classCount > 1 && !r.seeded
      ? [`The pledge is commitment No. ${classCount} in the ${school} class of ${ctx.seasonYear + 1}.`]
      : [];

  return {
    ...b,
    type: 'commit',
    headline: head(ledger, angle, r.id, tokens, OUTLET_TONE[b.outlet], `${rec.name} commits to ${school}`),
    dek: dek(ledger, 'recruiting', r.id, tokens),
    body: [p1.join(' '), p2.join(' ')].filter(Boolean)
  };
}

function coachStory(r: Extract<RawEvent, { kind: 'coachChange' }>, ledger: VarietyLedger): MediaEvent {
  const { ctx } = r;
  const team = ctx.teamsByRow.get(r.teamRow);
  const name = team?.longName ?? 'A program';
  const roleTxt = r.role === 'HC' ? 'head coach' : r.role === 'OC' ? 'offensive coordinator' : 'defensive coordinator';
  const isUser = r.teamRow === ctx.userRow;
  const angle = r.leaveReason === 'Fired' ? 'coachFired' : r.leaveReason === 'Retired' ? 'coachRetired' : 'coachHired';
  const tokens: Tokens = {
    TEAM: name,
    CITY: team?.city ?? '',
    ROLETXT: roleTxt,
    INCOMING: r.incoming,
    OUTGOING: r.outgoing
  };
  const departure =
    r.leaveReason === 'Fired'
      ? `${r.outgoing} was dismissed`
      : r.leaveReason === 'Retired'
        ? `${r.outgoing} retired`
        : r.leaveReason === 'Pro'
          ? `${r.outgoing} left for the NFL`
          : r.leaveReason === 'NewJob'
            ? `${r.outgoing} took another job`
            : r.leaveReason === 'ContractEnding'
              ? `${r.outgoing}'s contract ran out`
              : `the role held by ${r.outgoing} came open`;
  const b = base(r, isUser ? 68 : 56, isUser, [name, 'Coaching']);
  return {
    ...b,
    type: 'coachChange',
    headline: head(ledger, angle, r.id, tokens, OUTLET_TONE[b.outlet], `${name} names ${r.incoming} ${roleTxt}`),
    dek: dek(ledger, 'coaching', r.id, tokens),
    body: [
      `${name} has a new ${roleTxt}: ${r.incoming} takes over after ${departure}. How quickly the transition settles may define the ${team?.nickName ?? 'program'}'s next stretch.`
    ]
  };
}

function hotSeatStory(r: Extract<RawEvent, { kind: 'hotSeat' }>, ledger: VarietyLedger): MediaEvent {
  const { ctx } = r;
  const team = ctx.teamsByRow.get(r.teamRow);
  const name = team?.longName ?? 'A program';
  const isUser = r.teamRow === ctx.userRow;
  const rec = recordThrough(ctx, r.teamRow, ctx.week);
  const tokens: Tokens = { TEAM: name, CITY: team?.city ?? '', COACH: r.coach };
  const demeanor = team?.adDemeanor;
  const patience =
    demeanor === 'Impatient' || demeanor === 'Reactionary'
      ? ` The athletic director has a reputation for pulling the trigger — the front office reads as ${demeanor.toLowerCase()}.`
      : demeanor === 'Patient'
        ? ' The athletic director is known for patience, which may be the only thing buying time.'
        : '';
  const b = base(r, isUser ? 66 : 54, isUser, [name, 'Coaching']);
  return {
    ...b,
    type: 'hotSeat',
    headline: head(ledger, 'hotSeat', r.id, tokens, OUTLET_TONE[b.outlet], `${r.coach} is on the hot seat at ${name}`),
    dek: dek(ledger, 'coaching', r.id, tokens),
    body: [
      `${r.coach}'s job security at ${name} has slipped to ${r.pct}% — hot seat territory by any measure. The ${
        team?.nickName ?? 'program'
      } sit at ${rec.w}–${rec.l}, and ${r.yearsRemaining <= 1 ? 'his deal is up after this season' : `${r.yearsRemaining} years remain on his deal`}.${patience}`
    ]
  };
}

function rosterStory(r: Extract<RawEvent, { kind: 'rosterMove' }>, ledger: VarietyLedger): MediaEvent {
  const { ctx } = r;
  const name = ctx.userName;
  const dep = r.departures;
  const arr = r.arrivals;
  const team = ctx.teamsByRow.get(ctx.userRow);
  const bits: string[] = [];
  if (dep.length)
    bits.push(
      `Out: ${dep.slice(0, 5).map(([n, p]) => `${n} (${p})`).join(', ')}${dep.length > 5 ? ` and ${dep.length - 5} more` : ''}.`
    );
  if (arr.length)
    bits.push(
      `In: ${arr.slice(0, 5).map(([n, p]) => `${n} (${p})`).join(', ')}${arr.length > 5 ? ` and ${arr.length - 5} more` : ''}.`
    );
  const tokens: Tokens = {
    TEAM: name,
    CITY: team?.city ?? '',
    OUTC: String(dep.length),
    INC: String(arr.length)
  };
  return {
    ...base(r, 46, true, [name, 'Roster']),
    type: 'rosterMove',
    headline: head(ledger, 'rosterChurn', r.id, tokens, undefined, `Roster moves at ${name}`),
    dek: 'The depth chart will look different on Saturday.',
    body: [bits.join(' ')]
  };
}

function sofarStory(r: Extract<RawEvent, { kind: 'seasonSoFar' }>, ledger: VarietyLedger): MediaEvent {
  const { ctx } = r;
  const team = ctx.snapshot.school!.team;
  const rec = recordThrough(ctx, ctx.userRow, ctx.week);
  let pf = 0;
  let pa = 0;
  let bestWin: { opp: string; margin: number; score: string } | null = null;
  for (const g of ctx.snapshot.games) {
    if (g.status === 'unplayed') continue;
    const isHome = g.homeRow === ctx.userRow;
    const isAway = g.awayRow === ctx.userRow;
    if (!isHome && !isAway) continue;
    const us = isHome ? g.homeScore : g.awayScore;
    const them = isHome ? g.awayScore : g.homeScore;
    pf += us;
    pa += them;
    if (us > them) {
      const oppRow = isHome ? g.awayRow : g.homeRow;
      const opp = rankedLabel(ctx.teamsByRow.get(oppRow));
      if (!bestWin || us - them > bestWin.margin) bestWin = { opp, margin: us - them, score: `${us}-${them}` };
    }
  }
  const next = nextOpponent(ctx, ctx.userRow, ctx.week - 1);
  const rankTxt = team.rank > 0 ? `ranked No. ${team.rank}` : 'unranked';
  const tokens: Tokens = {
    TEAM: team.longName,
    NICK: team.nickName,
    CITY: team.city ?? '',
    REC: `${rec.w}–${rec.l}`
  };
  const body = [
    `${team.longName} is ${rec.w}–${rec.l} and ${rankTxt} in the media poll, outscoring opponents ${pf}–${pa} on the year.` +
      (bestWin ? ` The signature result so far: a ${bestWin.score} win over ${bestWin.opp}.` : ''),
    (next ? `Next up: ${next.name} in Week ${next.week}. ` : '') +
      `${team.headCoach ? `${team.headCoach}'s` : 'The'} squad controls its own story from here.`
  ];
  return {
    ...base(r, 100, true, [team.longName, 'Feature']),
    type: 'seasonSoFar',
    headline: head(ledger, 'seasonSoFar', r.id, tokens, undefined, `${team.longName}: the season so far`),
    dek: dek(ledger, 'feature', r.id, tokens),
    body
  };
}

function statLineStory(r: Extract<RawEvent, { kind: 'statLine' }>, ledger: VarietyLedger): MediaEvent {
  const { ctx } = r;
  const team = ctx.teamsByRow.get(r.teamRow);
  const opp = ctx.teamsByRow.get(r.oppRow);
  const isUser = r.teamRow === ctx.userRow;
  const angle = r.cat === 'pass' ? 'statLinePass' : r.cat === 'rush' ? 'statLineRush' : 'statLineRecv';
  const word = r.cat === 'pass' ? 'passing' : r.cat === 'rush' ? 'rushing' : 'receiving';
  const tokens: Tokens = {
    NAME: r.name,
    POS: r.position,
    TEAM: team?.longName ?? '',
    OPP: opp?.longName ?? '',
    YDS: r.yards.toLocaleString('en-US')
  };
  const b = base(r, isUser ? 70 : 48, isUser, [team?.longName ?? '', 'Numbers']);
  return {
    ...b,
    week: r.week,
    type: 'statLine',
    headline: head(ledger, angle, r.id, tokens, OUTLET_TONE[b.outlet], `${r.name} goes for ${tokens.YDS} ${word} yards`),
    dek: dek(ledger, 'numbers', r.id, tokens),
    body: [
      `${r.name} went for ${tokens.YDS} ${word} yards in Week ${r.week} against ${opp?.longName ?? 'the opposition'} — the kind of afternoon that moves award ballots.`
    ]
  };
}

function streakStory(r: Extract<RawEvent, { kind: 'streak' }>, ledger: VarietyLedger): MediaEvent {
  const { ctx } = r;
  const team = ctx.snapshot.school!.team;
  const angle = r.unbeaten ? 'unbeaten' : 'streak';
  const tokens: Tokens = {
    TEAM: team.longName,
    NICK: team.nickName,
    N: String(r.n),
    W: String(r.wins),
    REC: `${r.wins}–${r.losses}`
  };
  return {
    ...base(r, 76, true, [team.longName, 'Feature']),
    type: 'streak',
    headline: head(ledger, angle, r.id, tokens, undefined, `${team.longName} has won ${r.n} straight`),
    dek: dek(ledger, 'feature', r.id, tokens),
    body: [
      `${team.longName} has now won ${r.n} in a row${r.unbeaten ? ' and remains unbeaten' : ''}. Streaks like this change how a season is talked about — and how it is scheduled against.`
    ]
  };
}

function weeklyAwardStory(r: Extract<RawEvent, { kind: 'weeklyAward' }>, ledger: VarietyLedger): MediaEvent {
  const a = r.award;
  const honor = `${a.confRow === null ? 'National' : 'Conference'} ${a.side === 'off' ? 'Offensive' : 'Defensive'} Player of the Week`;
  const tokens: Tokens = { NAME: a.name, POS: a.position, TEAM: a.teamName, HONOR: honor };
  const b = base(r, 62, true, [a.teamName, 'Awards']);
  return {
    ...b,
    type: 'weeklyAward',
    headline: head(ledger, 'weeklyAward', r.id, tokens, OUTLET_TONE[b.outlet], `${a.name} named ${honor}`),
    dek: dek(ledger, 'awards', r.id, tokens),
    body: [
      `${a.name} was named ${honor} for Week ${a.week}, the league announced. The ${a.teamName} ${a.position} headlines this week's honors list.`
    ]
  };
}

function awardShowStory(r: Extract<RawEvent, { kind: 'awardShow' }>, ledger: VarietyLedger): MediaEvent {
  const { ctx } = r;
  const heisman = r.winners.find((w) => w.awardType === 'HEISMAN');
  const userTeam = ctx.teamsByRow.get(ctx.userRow);
  const aboutUser = !!heisman && !!userTeam && [userTeam.longName, userTeam.displayName].includes(heisman.teamName);
  const tokens: Tokens = {
    NAME: heisman?.name ?? '',
    TEAM: heisman?.teamName ?? '',
    AWARD: AWARD_NAMES['HEISMAN'] ?? 'Heisman'
  };
  const marquee = ['BEST_QB', 'BEST_RB', 'BEST_REC', 'BEST_DEF_1']
    .map((k) => {
      const w = r.winners.find((x) => x.awardType === k);
      return w ? `${AWARD_NAMES[k] ?? k}: ${w.name} (${w.teamName})` : null;
    })
    .filter(Boolean)
    .join('. ');
  const b = base(r, 86, aboutUser, [heisman?.teamName ?? '', 'Awards']);
  return {
    ...b,
    type: 'awardShow',
    headline: head(ledger, 'awardShow', r.id, tokens, OUTLET_TONE[b.outlet], `${tokens.NAME} wins the ${tokens.AWARD}`),
    dek: dek(ledger, 'awards', r.id, tokens),
    body: [
      `${heisman?.name ?? 'The winner'} of ${heisman?.teamName ?? ''} took home the ${tokens.AWARD} at the national awards show for the ${r.year} season.`,
      marquee ? `Elsewhere on the stage — ${marquee}.` : ''
    ].filter(Boolean)
  };
}

function awardWinStory(r: Extract<RawEvent, { kind: 'awardWin' }>, ledger: VarietyLedger): MediaEvent {
  const { ctx } = r;
  const w = r.winner;
  const team = ctx.teamsByRow.get(ctx.userRow);
  const award = AWARD_NAMES[w.awardType] ?? w.awardType;
  const tokens: Tokens = { NAME: w.name, TEAM: w.teamName, CITY: team?.city ?? '', AWARD: award };
  const b = base(r, 82, true, [w.teamName, 'Awards']);
  return {
    ...b,
    type: 'awardWin',
    headline: head(ledger, 'awardWin', r.id, tokens, OUTLET_TONE[b.outlet], `${w.name} wins the ${award}`),
    dek: dek(ledger, 'awards', r.id, tokens),
    body: [
      `${w.name}${w.position ? `, the ${w.teamName} ${w.position},` : ''} won the ${award} for the ${r.year} season — a program-level moment as much as a personal one.`
    ]
  };
}

function draftPickStory(r: Extract<RawEvent, { kind: 'draftPick' }>, ledger: VarietyLedger): MediaEvent {
  const { ctx } = r;
  const team = ctx.teamsByRow.get(ctx.userRow);
  const tokens: Tokens = {
    NAME: r.name,
    POS: r.position,
    TEAM: ctx.userName,
    CITY: team?.city ?? '',
    ROUND: ORDINAL[r.round] ?? `round-${r.round}`
  };
  const b = base(r, 64, true, [ctx.userName, 'Draft']);
  return {
    ...b,
    type: 'draftPick',
    headline: head(ledger, 'draftPick', r.id, tokens, OUTLET_TONE[b.outlet], `${r.name} drafted in round ${r.round}`),
    dek: dek(ledger, 'feature', r.id, tokens),
    body: [
      `${r.name}, the ${ctx.userName} ${r.position}, was selected in the ${tokens.ROUND} round of the NFL draft. Development stories like his are how programs sell the next class.`
    ]
  };
}

export function writeArticle(r: RawEvent, ledger: VarietyLedger): MediaEvent | null {
  try {
    switch (r.kind) {
      case 'userGame':
      case 'bigGame':
        return gameStory(r, ledger);
      case 'pollMove':
        return pollStory(r, ledger);
      case 'commit':
        return commitStory(r, ledger);
      case 'coachChange':
        return coachStory(r, ledger);
      case 'hotSeat':
        return hotSeatStory(r, ledger);
      case 'rosterMove':
        return rosterStory(r, ledger);
      case 'seasonSoFar':
        return sofarStory(r, ledger);
      case 'statLine':
        return statLineStory(r, ledger);
      case 'streak':
        return streakStory(r, ledger);
      case 'weeklyAward':
        return weeklyAwardStory(r, ledger);
      case 'awardShow':
        return awardShowStory(r, ledger);
      case 'awardWin':
        return awardWinStory(r, ledger);
      case 'draftPick':
        return draftPickStory(r, ledger);
      default:
        return null;
    }
  } catch {
    return null;
  }
}
