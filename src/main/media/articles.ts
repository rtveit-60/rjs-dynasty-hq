import type { ClassRecruit, GameInfo, MediaEvent, TeamInfo } from '../../shared/types.ts';
import type { MediaContext } from './engine.ts';

export type RawEvent =
  | { kind: 'userGame'; id: string; game: GameInfo; ctx: MediaContext }
  | { kind: 'bigGame'; id: string; game: GameInfo; ctx: MediaContext }
  | { kind: 'pollMove'; id: string; from: number; to: number; teamRow: number; ctx: MediaContext }
  | { kind: 'commit'; id: string; recruit: ClassRecruit; flipFrom: string | null; seeded?: boolean; ctx: MediaContext }
  | {
      kind: 'coachChange';
      id: string;
      teamRow: number;
      role: 'HC' | 'OC' | 'DC';
      incoming: string;
      outgoing: string;
      ctx: MediaContext;
    }
  | { kind: 'rosterMove'; id: string; departures: string[][]; arrivals: string[][]; ctx: MediaContext }
  | { kind: 'seasonSoFar'; id: string; ctx: MediaContext };

const AFFINITY: Record<RawEvent['kind'], string[]> = {
  userGame: ['fox', 'cbs', 'espn'],
  bigGame: ['gameday', 'espn', 'fox'],
  pollMove: ['espn', 'cbs'],
  commit: ['si', 'espn', 'gameday'],
  coachChange: ['espn', 'si'],
  rosterMove: ['espn', 'cbs'],
  seasonSoFar: ['si', 'gameday']
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const pick = <T,>(arr: T[], seed: string, salt = 0): T => arr[(hash(seed) + salt) % arr.length];

function label(t: TeamInfo | undefined, opts: { nick?: boolean } = {}): string {
  if (!t) return 'an unknown program';
  const base = opts.nick && t.nickName ? `${t.longName} ${t.nickName}` : t.longName;
  // The save ranks every team; only the top 25 is a "ranking" in media parlance.
  return t.rank > 0 && t.rank <= 25 ? `No. ${t.rank} ${base}` : base;
}

function winVerb(margin: number, ot: boolean, upset: boolean, seed: string): string {
  if (ot) return pick(['outlasts', 'survives', 'escapes'], seed);
  if (upset) return pick(['stuns', 'shocks', 'upsets'], seed);
  if (margin >= 28) return pick(['demolishes', 'blows out', 'annihilates'], seed);
  if (margin >= 21) return pick(['routs', 'blasts', 'overwhelms'], seed);
  if (margin >= 14) return pick(['rolls past', 'pounds', 'handles'], seed);
  if (margin >= 8) return pick(['beats', 'takes down', 'controls'], seed);
  if (margin >= 4) return pick(['holds off', 'fends off', 'turns back'], seed);
  return pick(['edges', 'survives', 'sneaks past'], seed);
}

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
  return { name: label(ctx.teamsByRow.get(oppRow)), week: upcoming.week };
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
    outlet: pick(AFFINITY[r.kind], r.id)
  };
}

function gameStory(r: Extract<RawEvent, { kind: 'userGame' | 'bigGame' }>): MediaEvent {
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
  const verb = winVerb(margin, g.overtime, upset, r.id);
  const scoreline = `${winScore}-${loseScore}${g.overtime ? ' in overtime' : ''}`;

  const headline = pick(
    [
      `${label(winner)} ${verb} ${label(loser)}, ${winScore}-${loseScore}`,
      `${label(winner)} ${verb} ${label(loser)} ${winScore}-${loseScore}`,
      margin >= 21
        ? `${label(winner)} leaves no doubt against ${label(loser)}`
        : `${label(winner)} ${verb} ${label(loser)} in ${g.gotw ? 'the week’s marquee matchup' : 'a ' + (margin <= 7 ? 'thriller' : 'statement')}`
    ],
    r.id,
    1
  );

  const rec = winner ? recordThrough(ctx, winner.row, g.week) : null;
  const p1Bits = [
    `${winner?.longName ?? 'The winner'} ${homeWon ? 'defended home turf' : 'went on the road and won'}, beating ${loser?.longName ?? 'their opponent'} ${scoreline}${g.week ? ` in Week ${g.week}` : ''}.`
  ];
  if (g.gotw) p1Bits.push('The matchup had top billing as the Game of the Week, and it delivered an audience to match.');
  if (g.attendance > 78000) p1Bits.push(`${g.attendance.toLocaleString('en-US')} packed the stands.`);
  if (upset) p1Bits.push(`Nobody outside the ${winner?.nickName ?? ''} locker room saw it coming.`.replace('  ', ' '));

  const p2Bits: string[] = [];
  if (rec) p2Bits.push(`The win moves ${winner?.longName} to ${rec.w}–${rec.l} on the season.`);
  if (isUser) {
    const next = nextOpponent(ctx, ctx.userRow, g.week);
    if (next) p2Bits.push(`Up next: ${next.name} in Week ${next.week}.`);
  } else if ((winner?.rank ?? 0) > 0 || (loser?.rank ?? 0) > 0) {
    p2Bits.push('Expect the poll voters to take notice.');
  }

  const dek = isUser
    ? userWon
      ? pick(
          [
            `${winner?.nickName ?? winner?.longName} keep rolling with a ${margin}-point win.`,
            `Another one in the books for ${winner?.longName}.`,
            margin >= 21 ? 'It was over by halftime.' : 'A win is a win — and this one counts double in the locker room.'
          ],
          r.id,
          2
        )
      : pick(
          [
            `A bitter one for ${loser?.longName} fans.`,
            `${winner?.longName} had answers all afternoon.`,
            'Back to the film room.'
          ],
          r.id,
          2
        )
    : upset
      ? 'The bracket-breakers strike again.'
      : `${label(winner)} handled business.`;

  return {
    ...base(r, isUser ? (userWon ? 92 : 90) + (g.gotw ? 4 : 0) : 50 + (g.gotw ? 10 : 0) + (upset ? 8 : 0), isUser, [
      home?.longName ?? '',
      away?.longName ?? '',
      'Results'
    ]),
    week: g.week, // file the story under the week the game was played
    type: r.kind,
    headline,
    dek,
    body: [p1Bits.join(' '), p2Bits.join(' ')].filter(Boolean)
  };
}

function pollStory(r: Extract<RawEvent, { kind: 'pollMove' }>): MediaEvent {
  const { ctx } = r;
  const team = ctx.teamsByRow.get(r.teamRow);
  const isUser = r.teamRow === ctx.userRow;
  const name = team?.longName ?? 'A program';
  const rising = r.to > 0 && (r.from === 0 || r.to < r.from);
  let headline: string;
  let dek: string;
  if (r.to === 1) {
    headline = pick(
      [`${name} claims the No. 1 spot`, `New No. 1: ${name}`, `${name} takes over at the top`],
      r.id
    );
    dek = 'The view from the summit.';
  } else if (r.from === 0) {
    headline = pick([`${name} cracks the Top 25`, `Poll debut: ${name} enters at No. ${r.to}`], r.id);
    dek = 'The voters are paying attention.';
  } else if (r.to === 0) {
    headline = pick([`${name} tumbles out of the rankings`, `${name} drops from the Top 25`], r.id);
    dek = 'A rough Saturday has consequences.';
  } else if (rising) {
    headline = pick(
      [`${name} climbs to No. ${r.to}`, `${name} rises to No. ${r.to} in the latest poll`],
      r.id
    );
    dek = `Up from No. ${r.from}.`;
  } else {
    headline = pick(
      [`${name} slips to No. ${r.to}`, `${name} falls to No. ${r.to}`],
      r.id
    );
    dek = `Down from No. ${r.from}.`;
  }
  const rec = recordThrough(ctx, r.teamRow, ctx.week);
  return {
    ...base(r, isUser ? 72 : 60, isUser, [name, 'Polls']),
    type: 'pollMove',
    headline,
    dek,
    body: [
      `${name} ${rising ? 'moved up' : r.to === 0 ? 'fell out of' : 'slid in'} the media poll this week${
        r.from > 0 && r.to > 0 ? `, going from No. ${r.from} to No. ${r.to}` : ''
      }. The ${team?.nickName ?? 'program'} sit at ${rec.w}–${rec.l} on the year.`
    ]
  };
}

function commitStory(r: Extract<RawEvent, { kind: 'commit' }>): MediaEvent {
  const { recruit: rec, ctx } = r;
  const school = rec.committedTo ?? 'a program';
  const isUser = school === ctx.userName;
  const starsTxt = `${rec.stars}-star`;
  const gem = rec.quality === 'GEM';
  const rivals = rec.race.filter((s) => s.name !== school).map((s) => s.name);
  const classCount = (ctx.snapshot.school?.recruiting?.recruits ?? []).filter(
    (x) => x.committedTo === school
  ).length;

  const headline = r.flipFrom
    ? pick(
        [
          `FLIP: ${starsTxt} ${rec.position} ${rec.name} spurns ${r.flipFrom} for ${school}`,
          `${rec.name} flips commitment from ${r.flipFrom} to ${school}`
        ],
        r.id
      )
    : pick(
        [
          `${starsTxt} ${rec.position} ${rec.name} commits to ${school}`,
          `${school} lands ${starsTxt} ${rec.position} ${rec.name}`,
          rec.stars === 5
            ? `Blue-chip haul: ${school} wins the ${rec.name} sweepstakes`
            : `${rec.name} is headed to ${school}`
        ],
        r.id
      );

  const p1 = [
    `${rec.name}, a ${starsTxt} ${rec.position} out of ${rec.homeState.replace(/([a-z])([A-Z])/g, '$1 $2')}${
      rec.nationalRank ? ` ranked No. ${rec.nationalRank} nationally` : ''
    }, has committed to ${school}.`
  ];
  if (rivals.length) p1.push(`He picked the ${school} offer over ${rivals.slice(0, 2).join(' and ')}.`);
  if (gem) p1.push(`Scouts who have seen him up close call him a gem — the ranking may be underselling it.`);

  const p2 =
    classCount > 1 && !r.seeded
      ? [`The pledge is commitment No. ${classCount} in the ${school} class of ${ctx.seasonYear + 1}.`]
      : [];

  return {
    ...base(r, (isUser ? 40 : 8) + rec.stars * 9 + (gem ? 6 : 0), isUser, [school, 'Recruiting']),
    type: 'commit',
    headline,
    dek: isUser
      ? pick(['The class keeps building.', 'A big board name comes off it.', 'Momentum on the trail.'], r.id, 3)
      : `${starsTxt.replace('-star', '★')} ${rec.position} off the board.`,
    body: [p1.join(' '), p2.join(' ')].filter(Boolean)
  };
}

function coachStory(r: Extract<RawEvent, { kind: 'coachChange' }>): MediaEvent {
  const { ctx } = r;
  const team = ctx.teamsByRow.get(r.teamRow);
  const name = team?.longName ?? 'A program';
  const roleTxt = r.role === 'HC' ? 'head coach' : r.role === 'OC' ? 'offensive coordinator' : 'defensive coordinator';
  const isUser = r.teamRow === ctx.userRow;
  const headline = pick(
    [
      `${name} turns to ${r.incoming} as ${roleTxt}`,
      `${r.outgoing} out, ${r.incoming} in as ${name} ${roleTxt}`,
      `Change in ${team?.city ?? name}: ${r.incoming} named ${roleTxt}`
    ],
    r.id
  );
  return {
    ...base(r, isUser ? 68 : 56, isUser, [name, 'Coaching']),
    type: 'coachChange',
    headline,
    dek: pick(['The carousel spins.', 'A new voice in the building.', 'Sideline shakeup.'], r.id, 2),
    body: [
      `${name} has a new ${roleTxt}: ${r.incoming} takes over the role held by ${r.outgoing}. How quickly the transition settles may define the ${team?.nickName ?? 'program'}'s next stretch.`
    ]
  };
}

function rosterStory(r: Extract<RawEvent, { kind: 'rosterMove' }>): MediaEvent {
  const { ctx } = r;
  const name = ctx.userName;
  const dep = r.departures;
  const arr = r.arrivals;
  const bits: string[] = [];
  if (dep.length)
    bits.push(
      `Out: ${dep.slice(0, 5).map(([n, p]) => `${n} (${p})`).join(', ')}${dep.length > 5 ? ` and ${dep.length - 5} more` : ''}.`
    );
  if (arr.length)
    bits.push(
      `In: ${arr.slice(0, 5).map(([n, p]) => `${n} (${p})`).join(', ')}${arr.length > 5 ? ` and ${arr.length - 5} more` : ''}.`
    );
  const headline =
    dep.length && arr.length
      ? `Roster churn at ${name}: ${dep.length} out, ${arr.length} in`
      : dep.length
        ? `${name} says goodbye to ${dep.length === 1 ? `${dep[0][0]}` : `${dep.length} players`}`
        : `${name} adds ${arr.length === 1 ? `${arr[0][0]}` : `${arr.length} newcomers`}`;
  return {
    ...base(r, 46, true, [name, 'Roster']),
    type: 'rosterMove',
    headline,
    dek: 'The depth chart will look different on Saturday.',
    body: [bits.join(' ')]
  };
}

function sofarStory(r: Extract<RawEvent, { kind: 'seasonSoFar' }>): MediaEvent {
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
      const opp = label(ctx.teamsByRow.get(oppRow));
      if (!bestWin || us - them > bestWin.margin) bestWin = { opp, margin: us - them, score: `${us}-${them}` };
    }
  }
  const next = nextOpponent(ctx, ctx.userRow, ctx.week - 1);
  const rankTxt = team.rank > 0 ? `ranked No. ${team.rank}` : 'unranked';
  const headline = pick(
    [
      `State of the program: ${team.longName} at ${rec.w}–${rec.l}`,
      team.rank === 1
        ? `Top of the sport: inside ${team.longName}'s ${rec.w}–${rec.l} start`
        : `Where ${team.longName} stands, ${rec.w}–${rec.l} in`,
      `${team.longName} ${team.nickName}: the season so far`
    ],
    r.id
  );
  const body = [
    `${team.longName} is ${rec.w}–${rec.l} and ${rankTxt} in the media poll, outscoring opponents ${pf}–${pa} on the year.` +
      (bestWin ? ` The signature result so far: a ${bestWin.score} win over ${bestWin.opp}.` : ''),
    (next ? `Next up: ${next.name} in Week ${next.week}. ` : '') +
      `${team.headCoach ? `${team.headCoach}'s` : 'The'} squad controls its own story from here.`
  ];
  return {
    ...base(r, 100, true, [team.longName, 'Feature']),
    type: 'seasonSoFar',
    headline,
    dek: `Catching the wire up on everything in ${team.city ?? 'town'}.`,
    body
  };
}

export function writeArticle(r: RawEvent): MediaEvent | null {
  try {
    switch (r.kind) {
      case 'userGame':
      case 'bigGame':
        return gameStory(r);
      case 'pollMove':
        return pollStory(r);
      case 'commit':
        return commitStory(r);
      case 'coachChange':
        return coachStory(r);
      case 'rosterMove':
        return rosterStory(r);
      case 'seasonSoFar':
        return sofarStory(r);
      default:
        return null;
    }
  } catch {
    return null;
  }
}
