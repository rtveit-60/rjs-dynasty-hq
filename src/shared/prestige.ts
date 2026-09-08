/**
 * Coach prestige regression — the rules layer.
 *
 * The game moves CoachPrestigeScore by +1…+50 per win and exactly −1 per loss,
 * and never for a firing or a missed AD expectation (docs/RESEARCH.md "Coach
 * prestige — how the game moves it"). This module adds the missing downward
 * force as a policy over save facts: every processed loss is weighed by how
 * badly it reads (rank gap, record gap, stakes, margin), losses compound on
 * a losing streak, a season that ends on the hot seat costs at year end, and a
 * firing costs once. Everything here is pure — the main process owns the
 * ledger file and the write; see src/main/prestige.ts.
 *
 * Deductions have two legs and the larger one applies: a flat amount in
 * prestige points, and a percentage of the coach's current score. The flat leg
 * makes a loss matter to a 400-point coach; the percentage leg keeps it
 * meaningful to a 6,000-point one, without ever clamping the top — a long
 * winning run still buys a real cushion.
 */
import type { CarouselEntry, GameInfo, Snapshot } from './types.ts';

export type PrestigeTier = 'off' | 'lenient' | 'balanced' | 'demanding' | 'ruthless';
export const PRESTIGE_TIERS: PrestigeTier[] = ['off', 'lenient', 'balanced', 'demanding', 'ruthless'];

export type PrestigeCause = 'loss' | 'streak' | 'expectations' | 'fired' | 'reapply';

export interface PrestigeTierSpec {
  key: Exclude<PrestigeTier, 'off'>;
  label: string;
  blurb: string;
  /** Flat points for an even-odds loss before weighting (the weight runs 0.5–3.5). */
  lossBase: number;
  /** Percentage-of-score leg for the same even-odds loss. */
  lossPct: number;
  /** Coordinators' share of the head coach's charge. */
  coordShare: number;
  /** Losing-streak length at which escalation starts. */
  streakStart: number;
  /** Compounding factor: the loss charge is multiplied by rate^(games past the start) once a skid reaches streakStart. */
  streakRate: number;
  /** Season ends on the hot seat / on low security: flat and percentage legs. */
  hotSeatFlat: number;
  hotSeatPct: number;
  lowFlat: number;
  lowPct: number;
  /** Fired by the carousel. */
  firedFlat: number;
  firedPct: number;
}

export const PRESTIGE_TIER_SPECS: Record<Exclude<PrestigeTier, 'off'>, PrestigeTierSpec> = {
  lenient: {
    key: 'lenient',
    label: 'Lenient',
    blurb: 'Only bad losses, long skids and firings leave a mark.',
    lossBase: 3,
    lossPct: 0.004,
    coordShare: 0.35,
    streakStart: 4,
    streakRate: 1.25,
    hotSeatFlat: 30,
    hotSeatPct: 0.03,
    lowFlat: 0,
    lowPct: 0,
    firedFlat: 75,
    firedPct: 0.06
  },
  balanced: {
    key: 'balanced',
    label: 'Balanced',
    blurb: 'Every loss costs something; upsets, skids and hot seats cost real prestige.',
    lossBase: 6,
    lossPct: 0.008,
    coordShare: 0.4,
    streakStart: 3,
    streakRate: 1.5,
    hotSeatFlat: 60,
    hotSeatPct: 0.06,
    lowFlat: 25,
    lowPct: 0.025,
    firedFlat: 150,
    firedPct: 0.12
  },
  demanding: {
    key: 'demanding',
    label: 'Demanding',
    blurb: 'A losing season reshapes a résumé; a firing takes a letter or two.',
    lossBase: 10,
    lossPct: 0.015,
    coordShare: 0.5,
    streakStart: 3,
    streakRate: 1.75,
    hotSeatFlat: 100,
    hotSeatPct: 0.1,
    lowFlat: 50,
    lowPct: 0.05,
    firedFlat: 250,
    firedPct: 0.2
  },
  ruthless: {
    key: 'ruthless',
    label: 'Ruthless',
    blurb: 'Prestige is rented. Two straight losses start the bleeding.',
    lossBase: 16,
    lossPct: 0.025,
    coordShare: 0.6,
    streakStart: 2,
    streakRate: 2,
    hotSeatFlat: 160,
    hotSeatPct: 0.16,
    lowFlat: 80,
    lowPct: 0.08,
    firedFlat: 400,
    firedPct: 0.3
  }
};

export function prestigeTierSpec(tier: PrestigeTier): PrestigeTierSpec | null {
  return tier === 'off' ? null : PRESTIGE_TIER_SPECS[tier];
}

/**
 * The game's own score → letter map (StaffHiringTuning.CoachPrestigeScoreGradeSpline,
 * interpolated between knots; LetterGrade A+=0 … F=12). Used to show where a
 * deduction lands before the game re-grades the letter itself.
 */
const GRADE_X = [0, 190, 280, 370, 460, 550, 640, 730, 820, 910, 999];
const GRADE_Y = [12, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
const LETTERS = ['A+', 'A', 'A−', 'B+', 'B', 'B−', 'C+', 'C', 'C−', 'D+', 'D', 'D−', 'F'];

export function prestigeLetterForScore(score: number): string {
  if (score >= GRADE_X[GRADE_X.length - 1]) return LETTERS[0];
  if (score <= 0) return LETTERS[12];
  let i = 1;
  while (i < GRADE_X.length && GRADE_X[i] < score) i++;
  const x0 = GRADE_X[i - 1];
  const x1 = GRADE_X[i];
  const y0 = GRADE_Y[i - 1];
  const y1 = GRADE_Y[i];
  const y = y0 + ((score - x0) / (x1 - x0)) * (y1 - y0);
  return LETTERS[Math.max(0, Math.min(12, Math.round(y)))];
}

/** Save LetterGrade member ("Aplus", "Bminus") → display. */
export function prestigeLetterLabel(member: string): string {
  return member.replace('plus', '+').replace('minus', '−').replace(/^(Count|COUNT|Incomplete)$/, '—');
}

// ---------------------------------------------------------------------------
// Ledger state — persisted per dynasty by the main process.
// ---------------------------------------------------------------------------

export interface PrestigeCoachObs {
  row: number;
  name: string;
  teamRow: number;
  role: 'HC' | 'OC' | 'DC';
  sec: string;
  pct: number;
  score: number;
  user: boolean;
}

export interface PrestigeEntry {
  id: string;
  seasonYear: number;
  week: number;
  coachRow: number;
  coach: string;
  teamRow: number;
  role: 'HC' | 'OC' | 'DC';
  user: boolean;
  cause: PrestigeCause;
  /** Points deducted (positive). */
  points: number;
  /** Score before and after, filled in once the write lands. */
  before?: number;
  after?: number;
  detail: string;
}

export interface PrestigeLedger {
  version: 1;
  /** Season/week/stage of the snapshot this state was built from. */
  seasonYear: number;
  week: number;
  stage: string;
  /** Games already assessed (or baselined) — keyed by season and matchup. */
  processedGames: string[];
  /** Last observation of every coach on the carousel, by Coach row. */
  coaches: Record<number, PrestigeCoachObs>;
  /** Last in-season security reading per coach for the season under way — the year-end review reads this. */
  seasonSecurity: Record<number, PrestigeCoachObs>;
  /** Seasons whose year-end expectations review has run. */
  expectationsDone: number[];
  /** Firings already charged: "<season>-<teamRow>-<role>". */
  firedKeys: string[];
  /** Newest last; capped. */
  entries: PrestigeEntry[];
  /** The last score the app wrote per coach, with the pre-write value — re-applied if the game's next save overwrote it. */
  written: Record<number, { before: number; after: number; seasonYear: number; week: number }>;
  /** Content hash of the file the app last wrote; a parse of that same file is not a game save. */
  writtenHash?: string;
  lastReview?: { seasonYear: number; week: number; count: number; points: number; at: number };
}

/** What the renderer shows: the tier, the recent ledger and season-to-date totals. */
export interface PrestigeView {
  tier: PrestigeTier;
  seasonYear: number | null;
  /** Newest first. */
  entries: PrestigeEntry[];
  seasonTotals: Record<number, number>;
  lastReview: PrestigeLedger['lastReview'] | null;
  /** Set when the ledger is still a baseline — no week has closed since the tier was switched on. */
  baselineOnly: boolean;
}

export const PRESTIGE_ENTRY_CAP = 800;

export const gameKeyOf = (seasonYear: number, g: GameInfo) => `g${seasonYear}w${g.week}-${g.homeRow}-${g.awayRow}`;

function obsFrom(carousel: CarouselEntry[]): Record<number, PrestigeCoachObs> {
  const out: Record<number, PrestigeCoachObs> = {};
  for (const c of carousel) {
    if (c.prestigeScore === undefined) continue;
    out[c.coachRow] = {
      row: c.coachRow,
      name: c.name,
      teamRow: c.teamRow,
      role: c.role,
      sec: c.securityStatus,
      pct: c.securityPct,
      score: c.prestigeScore,
      user: c.isUser
    };
  }
  return out;
}

/** The three staff rows of one team, from an observation map. */
function staffOf(obs: Record<number, PrestigeCoachObs>, teamRow: number): PrestigeCoachObs[] {
  return Object.values(obs).filter((o) => o.teamRow === teamRow);
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const rankPts = (rank: number) => (rank > 0 && rank <= 25 ? (26 - rank) / 25 : 0);

/** One coach's charge for a weight, on their own score, coordinators at their share. */
function charge(spec: PrestigeTierSpec, o: PrestigeCoachObs, weight: number, flatBase: number, pctBase: number): number {
  const share = o.role === 'HC' ? 1 : spec.coordShare;
  const flat = flatBase * weight * share;
  const pct = o.score * pctBase * weight * share;
  return Math.max(0, Math.round(Math.max(flat, pct)));
}

export interface PrestigeAssessment {
  entries: PrestigeEntry[];
  next: PrestigeLedger;
}

/**
 * Advance the ledger to `snapshot`, charging what is new since `prev`. With
 * `spec` null (tier Off) the state still advances — games, security readings
 * and firings are marked seen — so switching a tier on later never bills the
 * weeks played while it was off. A null `prev` baselines without charging.
 */
export function assessPrestige(prev: PrestigeLedger | null, snapshot: Snapshot, spec: PrestigeTierSpec | null): PrestigeAssessment | null {
  const season = snapshot.season;
  if (!season || !snapshot.carousel?.length) return null;
  const obs = obsFrom(snapshot.carousel);
  if (!Object.keys(obs).length) return null;
  const inSeason = season.stage !== 'OffSeason';
  const played = snapshot.games.filter((g) => g.status !== 'unplayed').sort((a, b) => a.week - b.week);
  const keys = played.map((g) => gameKeyOf(season.seasonYear, g));

  const next: PrestigeLedger = {
    version: 1,
    seasonYear: season.seasonYear,
    week: season.week,
    stage: season.stage,
    processedGames: keys,
    coaches: obs,
    seasonSecurity: prev && prev.seasonYear === season.seasonYear ? { ...prev.seasonSecurity } : {},
    expectationsDone: prev?.expectationsDone ?? [],
    firedKeys: prev?.firedKeys ?? [],
    entries: prev?.entries ?? [],
    written: prev?.written ?? {}
  };
  if (inSeason) for (const o of Object.values(obs)) next.seasonSecurity[o.row] = o;

  const entries: PrestigeEntry[] = [];
  if (!prev) return { entries, next };
  const teams = new Map(snapshot.teams.map((t) => [t.row, t]));
  const rivals = new Set(snapshot.rivalries.map((r) => `${Math.min(r.a, r.b)}-${Math.max(r.a, r.b)}`));
  const seen = new Set(prev.seasonYear === season.seasonYear ? prev.processedGames : []);
  const latestWeek = played.length ? played[played.length - 1].week : -1;
  const wk = season.week;
  const yr = season.seasonYear;

  // --- losses + streaks, in schedule order so pre-game records and streaks are right ---
  if (spec) {
    const rec = new Map<number, { w: number; l: number; streak: number }>();
    const get = (row: number) => rec.get(row) ?? { w: 0, l: 0, streak: 0 };
    for (const g of played) {
      const key = gameKeyOf(yr, g);
      const homeWon = g.status === 'home';
      const winner = homeWon ? g.homeRow : g.awayRow;
      const loser = homeWon ? g.awayRow : g.homeRow;
      const rw = get(winner);
      const rl = get(loser);
      if (!seen.has(key)) {
        const tw = teams.get(winner);
        const tl = teams.get(loser);
        const rankOf = (t: typeof tw) => (t ? (g.week === latestWeek && t.lastWeekRank > 0 ? t.lastWeekRank : t.rank) : 0);
        const loserRank = rankOf(tl);
        const winnerRank = rankOf(tw);
        const rankGap = clamp01(rankPts(loserRank) - rankPts(winnerRank));
        const gl = rl.w + rl.l;
        const gw = rw.w + rw.l;
        const damp = Math.min(1, Math.min(gl, gw) / 3);
        const recGap = gl && gw ? clamp01(rl.w / gl - rw.w / gw) * damp : 0;
        const upset = rankGap + recGap;
        let weight = 0.5 + 1.5 * upset;
        const bits: string[] = [];
        const bowl = !!g.bowlName || /bowl|playoff|championship/i.test(g.weekType);
        if (bowl) {
          weight *= 1.5;
          bits.push(g.bowlName ? g.bowlName : 'postseason');
        }
        if (rivals.has(`${Math.min(g.homeRow, g.awayRow)}-${Math.max(g.homeRow, g.awayRow)}`)) {
          weight *= 1.3;
          bits.push('rivalry');
        }
        if (loser === g.homeRow) {
          weight *= 1.15;
          bits.push('at home');
        }
        const margin = Math.abs(g.homeScore - g.awayScore);
        if (margin >= 21) {
          weight *= 1.25;
          bits.push(`by ${margin}`);
        } else if (g.overtime || margin <= 3) {
          weight *= 0.85;
          bits.push(g.overtime ? 'in overtime' : `by ${margin}`);
        }
        // The save ranks every team 1–136; only the Top 25 reads as "ranked".
        const winName = tw?.longName ?? `Team ${winner}`;
        const winTag = `${winnerRank > 0 && winnerRank <= 25 ? `#${winnerRank} ` : ''}${winName} (${rw.w}-${rw.l})`;
        const selfTag = `${loserRank > 0 && loserRank <= 25 ? `#${loserRank} ` : ''}${rl.w}-${rl.l}`;
        const streakAfter = rl.streak + 1;
        for (const o of staffOf(obs, loser)) {
          const pts = charge(spec, o, weight, spec.lossBase, spec.lossPct);
          if (pts > 0) {
            entries.push({
              id: `${key}-${o.row}-loss`,
              seasonYear: yr,
              week: g.week,
              coachRow: o.row,
              coach: o.name,
              teamRow: loser,
              role: o.role,
              user: o.user,
              cause: 'loss',
              points: pts,
              detail: `Lost to ${winTag} as ${selfTag}${bits.length ? ', ' + bits.join(', ') : ''}${upset >= 1 ? ' — an upset' : ''}`
            });
          }
          // Losses compound on a skid: the whole loss charge is multiplied by
          // rate^n, n = games at or past the threshold, and the extra over the
          // plain loss is booked as its own line so the ledger shows the compounding.
          if (streakAfter >= spec.streakStart) {
            const mult = Math.pow(spec.streakRate, streakAfter - spec.streakStart + 1);
            const spts = charge(spec, o, weight * (mult - 1), spec.lossBase, spec.lossPct);
            if (spts > 0) {
              entries.push({
                id: `${key}-${o.row}-streak`,
                seasonYear: yr,
                week: g.week,
                coachRow: o.row,
                coach: o.name,
                teamRow: loser,
                role: o.role,
                user: o.user,
                cause: 'streak',
                points: spts,
                detail: `${streakAfter} straight losses — the loss compounds ×${mult.toFixed(2)}`
              });
            }
          }
        }
      }
      rec.set(winner, { w: rw.w + 1, l: rw.l, streak: 0 });
      rec.set(loser, { w: rl.w, l: rl.l + 1, streak: rl.streak + 1 });
    }
  }

  // --- firings: the carousel's own ledger names the outgoing coach ---
  for (const o of snapshot.jobOpenings ?? []) {
    if (o.reason !== 'Fired') continue;
    const fkey = `${yr}-${o.teamRow}-${o.role}`;
    if (next.firedKeys.includes(fkey)) continue;
    const before = Object.values(prev.coaches).find(
      (c) => c.teamRow === o.teamRow && c.role === o.role && (!o.prevCoach || c.name === o.prevCoach)
    );
    next.firedKeys = [...next.firedKeys, fkey].slice(-400);
    if (!before || !spec) continue;
    const live = obs[before.row] ?? before;
    const pts = charge(spec, live, 1, spec.firedFlat, spec.firedPct);
    if (pts > 0) {
      const team = teams.get(o.teamRow);
      entries.push({
        id: `fired-${fkey}-${before.row}`,
        seasonYear: yr,
        week: wk,
        coachRow: before.row,
        coach: before.name,
        teamRow: o.teamRow,
        role: before.role,
        user: before.user,
        cause: 'fired',
        points: pts,
        detail: `Fired by ${team?.longName ?? 'the program'}`
      });
    }
  }

  // --- year-end review: the season just closed, judged on where the seat stood at the end ---
  const seasonClosed = prev.stage !== 'OffSeason' && (!inSeason || season.seasonYear > prev.seasonYear);
  if (seasonClosed && !next.expectationsDone.includes(prev.seasonYear)) {
    next.expectationsDone = [...next.expectationsDone, prev.seasonYear].slice(-40);
    if (spec) {
      for (const o of Object.values(prev.seasonSecurity)) {
        const hot = o.sec === 'HotSeat';
        const low = o.sec === 'Low';
        if (!hot && !low) continue;
        const live = obs[o.row] ?? o;
        const pts = charge(spec, live, 1, hot ? spec.hotSeatFlat : spec.lowFlat, hot ? spec.hotSeatPct : spec.lowPct);
        if (pts <= 0) continue;
        const team = teams.get(o.teamRow);
        entries.push({
          id: `exp-${prev.seasonYear}-${o.row}`,
          seasonYear: prev.seasonYear,
          week: wk,
          coachRow: o.row,
          coach: o.name,
          teamRow: o.teamRow,
          role: o.role,
          user: o.user,
          cause: 'expectations',
          points: pts,
          detail: `${prev.seasonYear} ended ${hot ? 'on the hot seat' : 'on low security'} at ${team?.longName ?? 'the program'} (${o.pct}%)`
        });
      }
    }
  }

  return { entries, next };
}

/**
 * Deductions the game overwrote. The app writes score S_after over S_before;
 * a later game save either carries S_after forward (the user reloaded the
 * edited file — absorbed) or S_before plus the game's own small weekly moves
 * (the write was lost). The game's per-week moves are tiny next to any real
 * deduction, so whichever of the two the live score sits closer to decides.
 */
export function lostWrites(prev: PrestigeLedger | null, snapshot: Snapshot): { coachRow: number; points: number; obs: PrestigeCoachObs }[] {
  if (!prev) return [];
  const obs = obsFrom(snapshot.carousel ?? []);
  const out: { coachRow: number; points: number; obs: PrestigeCoachObs }[] = [];
  for (const [rowKey, w] of Object.entries(prev.written)) {
    const row = Number(rowKey);
    const live = obs[row];
    if (!live) continue;
    const owed = w.before - w.after;
    if (owed <= 0) continue;
    const absorbed = Math.abs(live.score - w.after) <= Math.abs(live.score - w.before);
    if (!absorbed) out.push({ coachRow: row, points: owed, obs: live });
  }
  return out;
}

/** Season-to-date deductions per coach row, for the carousel column. */
export function seasonDeductions(entries: PrestigeEntry[], seasonYear: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (const e of entries) {
    if (e.seasonYear !== seasonYear || e.cause === 'reapply') continue;
    out[e.coachRow] = (out[e.coachRow] ?? 0) + e.points;
  }
  return out;
}
