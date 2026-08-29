import type {
  GameInfo,
  LeagueLeaders,
  MediaEvent,
  Snapshot,
  TeamInfo
} from '../../shared/types.ts';
import { writeArticle, type RawEvent } from './articles.ts';
import { makeLedger, type VarietyLedger } from './voices.ts';
import { writeWirePosts } from './wire-posts.ts';

/** Compact cross-save memory, persisted per school. */
export interface MediaState {
  version: 1;
  seasonYear: number;
  dynastyYear: number;
  week: number;
  teamRow: number;
  teamName: string;
  ranks: Record<number, number>;
  playedGameKeys: string[];
  commits: Record<number, string>;
  staff: Record<number, { hc: string | null; oc: string | null; dc: string | null }>;
  rosterNames: string[];
  /** Head-coach job security status by team row (absent in states saved before the carousel). */
  hcSecurity?: Record<number, string>;
  /** Template-usage ledger — nothing repeats inside one season cycle. */
  variety?: { cycle: number; used: Record<string, number> };
  /** Weekly honors already covered (potw ids). */
  weeklyAwardIds?: string[];
  /** Signature of the last annual awards-show block the wire covered. */
  awardShowSig?: string;
  /** User players whose draft news has already run. */
  draftedNames?: string[];
  /** Last seen season totals for leader players, "cat:playerRow" → value. */
  leaderVals?: Record<string, number>;
  /** Longest user win streak already celebrated this season. */
  streakMax?: number;
}

const gameKey = (seasonYear: number, g: GameInfo) => `g${seasonYear}w${g.week}-${g.homeRow}-${g.awayRow}`;

const potwId = (seasonYear: number, a: Snapshot['weeklyAwards'][number]) =>
  `potw${seasonYear}w${a.week}-${a.side}-${a.confRow ?? 'natl'}`;

const awardSig = (annual: Snapshot['annualAwards']): string =>
  annual ? annual.winners.map((w) => `${w.awardType}:${w.name}`).join('|') : '';

/** The user's current win streak plus record, from the schedule. */
function userStreak(snapshot: Snapshot, userRow: number): { streak: number; w: number; l: number } {
  const results: boolean[] = [];
  let w = 0;
  let l = 0;
  for (const g of [...snapshot.games].sort((a, b) => a.week - b.week)) {
    if (g.status === 'unplayed') continue;
    if (g.homeRow !== userRow && g.awayRow !== userRow) continue;
    const won = (g.status === 'home') === (g.homeRow === userRow);
    results.push(won);
    won ? w++ : l++;
  }
  let streak = 0;
  for (let i = results.length - 1; i >= 0 && results[i]; i--) streak++;
  return { streak, w, l };
}

export function buildMediaState(snapshot: Snapshot, leaders?: LeagueLeaders | null): MediaState | null {
  const school = snapshot.school;
  const season = snapshot.season;
  if (!school || !season) return null;
  const ranks: Record<number, number> = {};
  const staff: MediaState['staff'] = {};
  for (const t of snapshot.teams) {
    if (t.rank > 0) ranks[t.row] = t.rank;
    staff[t.row] = { hc: t.headCoach, oc: t.offCoordinator, dc: t.defCoordinator };
  }
  const commits: Record<number, string> = {};
  for (const r of school.recruiting?.recruits ?? []) {
    if (r.committedTo) commits[r.row] = r.committedTo;
  }
  const hcSecurity: Record<number, string> = {};
  for (const c of snapshot.carousel ?? []) {
    if (c.role === 'HC') hcSecurity[c.teamRow] = c.securityStatus;
  }
  const leaderVals: Record<string, number> = {};
  for (const cat of leaders?.categories ?? []) {
    for (const r of cat.rows) leaderVals[`${cat.key}:${r.playerRow}`] = r.value;
  }
  return {
    version: 1,
    seasonYear: season.seasonYear,
    dynastyYear: season.dynastyYear,
    week: season.week,
    teamRow: school.team.row,
    teamName: school.team.longName,
    ranks,
    playedGameKeys: snapshot.games
      .filter((g) => g.status !== 'unplayed')
      .map((g) => gameKey(season.seasonYear, g)),
    commits,
    staff,
    rosterNames: school.roster.map((p) => `${p.firstName} ${p.lastName}|${p.position}`),
    hcSecurity,
    weeklyAwardIds: snapshot.weeklyAwards.map((a) => potwId(season.seasonYear, a)),
    awardShowSig: awardSig(snapshot.annualAwards),
    draftedNames: school.roster
      .filter((pl) => pl.draftRound !== null)
      .map((pl) => `${pl.firstName} ${pl.lastName}`),
    leaderVals,
    streakMax: Math.max(userStreak(snapshot, school.team.row).streak, 0)
  };
}

export interface MediaContext {
  snapshot: Snapshot;
  teamsByRow: Map<number, TeamInfo>;
  userRow: number;
  userName: string;
  seasonYear: number;
  week: number;
  weekType: string;
}

function interestScore(g: GameInfo, ctx: MediaContext): number {
  const home = ctx.teamsByRow.get(g.homeRow);
  const away = ctx.teamsByRow.get(g.awayRow);
  const hr = home?.rank || 40;
  const ar = away?.rank || 40;
  let score = 0;
  if (g.gotw) score += 50;
  if (hr <= 25 && ar <= 25) score += 60 - (hr + ar);
  const winnerRank = g.status === 'home' ? hr : ar;
  const loserRank = g.status === 'home' ? ar : hr;
  if (winnerRank > 25 && loserRank <= 10) score += 45; // major upset
  if (g.overtime) score += 10;
  return score;
}

export function diffMedia(
  prev: MediaState | null,
  snapshot: Snapshot,
  leaders: LeagueLeaders | null = null
): RawEvent[] {
  const school = snapshot.school;
  const season = snapshot.season;
  if (!school || !season) return [];
  const ctx: MediaContext = {
    snapshot,
    teamsByRow: new Map(snapshot.teams.map((t) => [t.row, t])),
    userRow: school.team.row,
    userName: school.team.longName,
    seasonYear: season.seasonYear,
    week: season.week,
    weekType: season.weekType
  };

  const baseline =
    !prev || prev.seasonYear !== season.seasonYear || prev.teamRow !== school.team.row;
  const events: RawEvent[] = [];
  const playedBefore = new Set(baseline ? [] : prev!.playedGameKeys);

  // --- games ---
  const played = snapshot.games.filter((g) => g.status !== 'unplayed');
  const freshGames = played.filter((g) => !playedBefore.has(gameKey(season.seasonYear, g)));
  const userGames = freshGames.filter((g) => g.homeRow === ctx.userRow || g.awayRow === ctx.userRow);
  const otherGames = freshGames
    .filter((g) => g.homeRow !== ctx.userRow && g.awayRow !== ctx.userRow)
    .map((g) => ({ g, score: interestScore(g, ctx) }))
    .filter((x) => x.score >= 40)
    .sort((a, b) => b.score - a.score);
  // cap league-wide coverage per refresh so a multi-week sim doesn't flood the wire
  const bigGames = otherGames.slice(0, baseline ? 4 : 8).map((x) => x.g);

  const rivalryOf = new Map<string, string>();
  for (const rv of snapshot.rivalries) {
    rivalryOf.set(`${Math.min(rv.a, rv.b)}-${Math.max(rv.a, rv.b)}`, rv.name);
  }
  const rivalryName = (g: GameInfo): string | null =>
    rivalryOf.get(`${Math.min(g.homeRow, g.awayRow)}-${Math.max(g.homeRow, g.awayRow)}`) ?? null;

  for (const g of userGames) {
    events.push({
      kind: 'userGame',
      id: gameKey(season.seasonYear, g),
      game: g,
      rivalryName: rivalryName(g),
      ctx
    });
  }
  for (const g of bigGames) {
    events.push({
      kind: 'bigGame',
      id: gameKey(season.seasonYear, g),
      game: g,
      rivalryName: rivalryName(g),
      ctx
    });
  }

  // --- big weekly stat lines, from the leaders sweep's week-over-week deltas ---
  if (!baseline && prev!.leaderVals && leaders) {
    const thresholds: Record<string, number> = { pass: 300, rush: 150, recv: 150 };
    const freshByTeam = new Map<number, GameInfo>();
    for (const g of freshGames) {
      freshByTeam.set(g.homeRow, g);
      freshByTeam.set(g.awayRow, g);
    }
    const lines: Extract<RawEvent, { kind: 'statLine' }>[] = [];
    for (const cat of leaders.categories) {
      const min = thresholds[cat.key];
      if (!min) continue;
      for (const r of cat.rows) {
        const before = prev!.leaderVals[`${cat.key}:${r.playerRow}`];
        if (before === undefined) continue;
        const delta = r.value - before;
        if (delta < min) continue;
        const g = r.teamRow !== null ? freshByTeam.get(r.teamRow) : undefined;
        if (!g) continue;
        const oppRow = g.homeRow === r.teamRow ? g.awayRow : g.homeRow;
        lines.push({
          kind: 'statLine',
          id: `stat${season.seasonYear}w${g.week}-${cat.key}-${r.playerRow}`,
          cat: cat.key as 'pass' | 'rush' | 'recv',
          playerRow: r.playerRow,
          name: r.name,
          position: r.position,
          teamRow: r.teamRow!,
          oppRow,
          yards: delta,
          week: g.week,
          ctx
        });
      }
    }
    // The user's players always make the cut; otherwise the two biggest lines.
    const mine = lines.filter((e) => e.teamRow === ctx.userRow);
    const rest = lines
      .filter((e) => e.teamRow !== ctx.userRow)
      .sort((a, b) => b.yards - a.yards)
      .slice(0, 2);
    events.push(...mine, ...rest);
  }

  // --- streak milestones ---
  {
    const { streak, w, l } = userStreak(snapshot, ctx.userRow);
    const marks = [4, 6, 8, 10, 12, 15, 20];
    const already = baseline ? streak : (prev!.streakMax ?? 0);
    const hit = marks.filter((m) => streak >= m && m > already).pop();
    if (!baseline && hit) {
      events.push({
        kind: 'streak',
        id: `streak${season.seasonYear}-${hit}`,
        n: streak,
        wins: w,
        losses: l,
        unbeaten: l === 0,
        ctx
      });
    }
  }

  // --- weekly honors (a user player named Player of the Week) ---
  {
    const prevIds = new Set(baseline ? [] : (prev!.weeklyAwardIds ?? []));
    for (const a of snapshot.weeklyAwards) {
      if (a.teamRow !== ctx.userRow) continue;
      const id = potwId(season.seasonYear, a);
      if (prevIds.has(id)) continue;
      events.push({ kind: 'weeklyAward', id, award: a, ctx });
    }
  }

  // --- the annual awards show ---
  {
    const sig = awardSig(snapshot.annualAwards);
    const before = baseline ? '' : (prev!.awardShowSig ?? '');
    if (snapshot.annualAwards && sig && sig !== before) {
      const annual = snapshot.annualAwards;
      const userTeam = ctx.teamsByRow.get(ctx.userRow);
      const ownNames = new Set(
        [userTeam?.longName, userTeam?.displayName]
          .filter((n): n is string => !!n)
          .map((n) => n.toLowerCase())
      );
      const heisman = annual.winners.find((w) => w.awardType === 'HEISMAN');
      if (heisman) {
        events.push({
          kind: 'awardShow',
          id: `award${annual.year}-show`,
          year: annual.year,
          winners: annual.winners,
          ctx
        });
      }
      for (const w of annual.winners) {
        if (!w.teamName || !ownNames.has(w.teamName.toLowerCase())) continue;
        events.push({
          kind: 'awardWin',
          id: `award${annual.year}-${w.awardType}`,
          year: annual.year,
          winner: w,
          ctx
        });
      }
    }
  }

  // --- draft calls for the user's players ---
  if (!baseline) {
    const before = new Set(prev!.draftedNames ?? []);
    for (const pl of school.roster) {
      if (pl.draftRound === null) continue;
      const nm = `${pl.firstName} ${pl.lastName}`;
      if (before.has(nm)) continue;
      events.push({
        kind: 'draftPick',
        id: `draft${season.seasonYear}-${pl.row}`,
        name: nm,
        position: pl.position,
        round: pl.draftRound,
        ctx
      });
    }
  }

  // --- polls ---
  const userRankNow = school.team.rank || 0;
  if (!baseline) {
    const userRankBefore = prev!.ranks[ctx.userRow] ?? 0;
    if (userRankNow !== userRankBefore && (userRankNow > 0 || userRankBefore > 0)) {
      events.push({
        kind: 'pollMove',
        id: `poll${season.seasonYear}w${season.week}-${ctx.userRow}`,
        from: userRankBefore,
        to: userRankNow,
        teamRow: ctx.userRow,
        ctx
      });
    }
    const previousNo1 = Number(
      Object.entries(prev!.ranks).find(([, r]) => r === 1)?.[0] ?? -1
    );
    const currentNo1 = snapshot.teams.find((t) => t.rank === 1)?.row ?? -1;
    if (currentNo1 >= 0 && previousNo1 >= 0 && currentNo1 !== previousNo1 && currentNo1 !== ctx.userRow) {
      events.push({
        kind: 'pollMove',
        id: `poll${season.seasonYear}w${season.week}-no1-${currentNo1}`,
        from: prev!.ranks[currentNo1] ?? 0,
        to: 1,
        teamRow: currentNo1,
        ctx
      });
    }
  }

  // --- commits ---
  const prevCommits = baseline ? {} : prev!.commits;
  const recruits = school.recruiting?.recruits ?? [];
  let commitEvents = recruits
    .filter((r) => r.committedTo && prevCommits[r.row] !== r.committedTo)
    .map((r) => ({
      kind: 'commit' as const,
      id: `commit${season.seasonYear}-${r.row}`,
      recruit: r,
      flipFrom: prevCommits[r.row] ?? null,
      seeded: baseline,
      ctx
    }));
  if (baseline) {
    // Seed the feed with the class-to-date: every user commit + marquee 5★s elsewhere.
    const mine = commitEvents.filter((e) => e.recruit.committedTo === ctx.userName);
    const marquee = commitEvents
      .filter((e) => e.recruit.committedTo !== ctx.userName && e.recruit.stars === 5)
      .slice(0, 3);
    commitEvents = [...mine, ...marquee];
  }
  events.push(...commitEvents);

  // --- coaching changes ---
  if (!baseline) {
    // Why the previous coach left, when the save's carousel ledger says so.
    const leaveReasons = new Map<string, string>();
    for (const o of snapshot.jobOpenings ?? []) {
      if (o.reason && o.reason !== 'None') leaveReasons.set(`${o.teamRow}:${o.role}`, o.reason);
    }
    for (const t of snapshot.teams) {
      const before = prev!.staff[t.row];
      if (!before) continue;
      if (t.headCoach && before.hc && t.headCoach !== before.hc) {
        events.push({
          kind: 'coachChange',
          id: `hc${season.seasonYear}w${season.week}-${t.row}`,
          teamRow: t.row,
          role: 'HC',
          incoming: t.headCoach,
          outgoing: before.hc,
          leaveReason: leaveReasons.get(`${t.row}:HC`) ?? null,
          ctx
        });
      }
      if (t.row === ctx.userRow) {
        for (const [role, now, was] of [
          ['OC', t.offCoordinator, before.oc],
          ['DC', t.defCoordinator, before.dc]
        ] as const) {
          if (now && was && now !== was) {
            events.push({
              kind: 'coachChange',
              id: `${role.toLowerCase()}${season.seasonYear}w${season.week}-${t.row}`,
              teamRow: t.row,
              role,
              incoming: now,
              outgoing: was,
              leaveReason: leaveReasons.get(`${t.row}:${role}`) ?? null,
              ctx
            });
          }
        }
      }
    }
  }

  // --- hot seats (head coaches whose security just turned HotSeat) ---
  if (!baseline && prev!.hcSecurity) {
    const flips = (snapshot.carousel ?? [])
      .filter(
        (c) =>
          c.role === 'HC' &&
          c.securityStatus === 'HotSeat' &&
          prev!.hcSecurity![c.teamRow] !== undefined &&
          prev!.hcSecurity![c.teamRow] !== 'HotSeat'
      )
      .sort((a, b) => a.securityPct - b.securityPct)
      .slice(0, 4);
    for (const c of flips) {
      events.push({
        kind: 'hotSeat',
        id: `hotseat${season.seasonYear}w${season.week}-${c.teamRow}`,
        teamRow: c.teamRow,
        coach: c.name,
        pct: c.securityPct,
        yearsRemaining: c.yearsRemaining,
        ctx
      });
    }
  }

  // --- user roster movement ---
  if (!baseline) {
    const before = new Set(prev!.rosterNames);
    const now = new Set(school.roster.map((p) => `${p.firstName} ${p.lastName}|${p.position}`));
    const departures = [...before].filter((n) => !now.has(n));
    const arrivals = [...now].filter((n) => !before.has(n));
    if (departures.length || arrivals.length) {
      events.push({
        kind: 'rosterMove',
        id: `roster${season.seasonYear}w${season.week}-${ctx.userRow}`,
        departures: departures.map((n) => n.split('|')),
        arrivals: arrivals.map((n) => n.split('|')),
        ctx
      });
    }
  }

  // --- baseline season summary ---
  if (baseline) {
    events.push({ kind: 'seasonSoFar', id: `sofar${season.seasonYear}w${season.week}-${ctx.userRow}`, ctx });
  }

  return events;
}

export function generateMedia(
  prev: MediaState | null,
  snapshot: Snapshot,
  leaders: LeagueLeaders | null = null
): { state: MediaState | null; events: MediaEvent[] } {
  const state = buildMediaState(snapshot, leaders);
  if (!state) return { state: null, events: [] };
  // One ledger per season cycle: no headline or post template repeats inside it.
  const ledger: VarietyLedger = makeLedger(prev?.variety, state.seasonYear);
  const raw = diffMedia(prev, snapshot, leaders);
  const events = raw
    .map((r) => writeArticle(r, ledger))
    .filter((e): e is MediaEvent => !!e);
  // The personality layer: short wire posts riding alongside the articles.
  for (const r of raw) events.push(...writeWirePosts(r, ledger));
  state.variety = { cycle: ledger.cycle, used: ledger.used };
  return { state, events };
}

export function sortEvents(events: MediaEvent[]): MediaEvent[] {
  return [...events].sort(
    (a, b) =>
      b.seasonYear - a.seasonYear ||
      b.week - a.week ||
      b.priority - a.priority ||
      b.createdAt - a.createdAt
  );
}
