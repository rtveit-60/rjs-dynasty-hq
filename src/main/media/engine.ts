import type { GameInfo, MediaEvent, Snapshot, TeamInfo } from '../../shared/types.ts';
import { writeArticle, type RawEvent } from './articles.ts';

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
}

const gameKey = (seasonYear: number, g: GameInfo) => `g${seasonYear}w${g.week}-${g.homeRow}-${g.awayRow}`;

export function buildMediaState(snapshot: Snapshot): MediaState | null {
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
    rosterNames: school.roster.map((p) => `${p.firstName} ${p.lastName}|${p.position}`)
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

export function diffMedia(prev: MediaState | null, snapshot: Snapshot): RawEvent[] {
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

  for (const g of userGames) {
    events.push({ kind: 'userGame', id: gameKey(season.seasonYear, g), game: g, ctx });
  }
  for (const g of bigGames) {
    events.push({ kind: 'bigGame', id: gameKey(season.seasonYear, g), game: g, ctx });
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
              ctx
            });
          }
        }
      }
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
  snapshot: Snapshot
): { state: MediaState | null; events: MediaEvent[] } {
  const state = buildMediaState(snapshot);
  if (!state) return { state: null, events: [] };
  const raw = diffMedia(prev, snapshot);
  const events = raw
    .map((r) => writeArticle(r))
    .filter((e): e is MediaEvent => !!e);
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
