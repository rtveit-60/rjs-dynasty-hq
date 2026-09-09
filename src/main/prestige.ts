/**
 * Coach prestige regression — the main-process side: the per-dynasty ledger
 * and the review that runs after every parse.
 *
 * This is the app's second sanctioned save-write path (the first is the
 * editors), and the only automatic one. It is gated three ways: the user has
 * switched a tier on (Settings.prestigeTier, default 'off'), the parse brought
 * something new to charge (a played game, a firing, a closed season, or a
 * deduction the game's own save overwrote), and the write goes through the
 * pipeline's guarded path — busy lock, on-disk hash check, `_RJ` sibling only,
 * backup, verify on reload. The original save's bytes are never touched.
 *
 * The rules live in src/shared/prestige.ts; the mechanism the game itself
 * uses is in docs/RESEARCH.md "Coach prestige — how the game moves it".
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Snapshot } from '../shared/types.ts';
import {
  assessPrestige,
  lostWrites,
  prestigeTierSpec,
  seasonDeductions,
  PRESTIGE_ENTRY_CAP,
  type PrestigeEntry,
  type PrestigeLedger,
  type PrestigeTier,
  type PrestigeView
} from '../shared/prestige.ts';
import type { Pipeline } from './pipeline.ts';
import { log } from './log.ts';
import { stateDir } from './state-dirs.ts';

const FILE = 'ledger.json';

function ledgerPath(dynastyId: string | null): string {
  return join(stateDir('prestige', dynastyId), FILE);
}

export function loadLedger(dynastyId: string | null): PrestigeLedger | null {
  const p = ledgerPath(dynastyId);
  try {
    if (!existsSync(p)) return null;
    const raw = JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, '')) as PrestigeLedger;
    if (raw && raw.version === 1) return raw;
    // A ledger from a format this build does not read: starting over means
    // re-baselining (nothing already charged is charged twice — the save
    // carries the deductions), but the history view loses its entries, so say so.
    log.warn('prestige', 'ledger version not recognized — starting a new ledger', { file: p, version: raw?.version });
    return null;
  } catch (err) {
    log.warn('prestige', 'ledger unreadable — starting a new ledger', {
      file: p,
      message: err instanceof Error ? err.message : String(err)
    });
    return null;
  }
}

function saveLedger(dynastyId: string | null, ledger: PrestigeLedger): void {
  const p = ledgerPath(dynastyId);
  try {
    writeFileSync(p, JSON.stringify(ledger), 'utf8');
  } catch (err) {
    // The next parse re-derives the same charges from the save, so a lost
    // ledger write costs history, not correctness — but it must be visible.
    log.error('prestige', 'ledger not saved', { file: p, message: err instanceof Error ? err.message : String(err) });
  }
}

/** A review write that failed inside the guarded path — carries the log code. */
export class PrestigeWriteError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'PrestigeWriteError';
  }
}

export interface PrestigeReviewResult {
  /** The file written, when a write happened. */
  editedPath: string | null;
  entries: PrestigeEntry[];
}

/**
 * Advance the ledger to this snapshot and, when the tier is on and something
 * is owed, write the deductions in one batch. Called after every completed
 * parse. A failed write leaves the ledger where it was so the next parse
 * retries; a routine skip (pipeline busy, save moved on disk) returns quietly,
 * while a real write error surfaces as a PrestigeWriteError carrying its code.
 */
export async function reviewPrestige(
  snapshot: Snapshot,
  savePath: string,
  tier: PrestigeTier,
  pipeline: Pipeline
): Promise<PrestigeReviewResult> {
  const none: PrestigeReviewResult = { editedPath: null, entries: [] };
  const spec = prestigeTierSpec(tier);
  const prev = loadLedger(snapshot.dynastyId);
  const assessment = assessPrestige(prev, snapshot, spec);
  if (!assessment) return none;
  const { next } = assessment;
  const entries = [...assessment.entries];
  if (!prev) {
    log.info('prestige', 'ledger baselined', {
      dynastyId: snapshot.dynastyId,
      seasonYear: next.seasonYear,
      week: next.week,
      coaches: Object.keys(next.coaches).length,
      tier
    });
  }

  // Deductions the game's own save overwrote. Skipped when this parse is of
  // the file the app itself wrote — the check belongs to the first game save after it.
  const ownFile = !!prev?.writtenHash && prev.writtenHash === pipeline.currentHash;
  if (prev && !ownFile && Object.keys(prev.written).length) {
    if (spec) {
      const losses = lostWrites(prev, snapshot);
      if (losses.length) {
        log.info('prestige', 'earlier deductions were saved over by the game — re-applying', {
          coaches: losses.length,
          points: losses.reduce((n, l) => n + l.points, 0)
        });
      }
      for (const lost of losses) {
        entries.push({
          id: `reapply-${snapshot.season?.seasonYear ?? 0}w${snapshot.season?.week ?? 0}-${lost.coachRow}`,
          seasonYear: snapshot.season?.seasonYear ?? 0,
          week: snapshot.season?.week ?? 0,
          coachRow: lost.coachRow,
          coach: lost.obs.name,
          teamRow: lost.obs.teamRow,
          role: lost.obs.role,
          user: lost.obs.user,
          cause: 'reapply',
          points: lost.points,
          detail: 'Re-applied: the game saved over an earlier deduction'
        });
      }
    }
    next.written = {};
    next.writtenHash = undefined;
  } else if (prev) {
    next.written = prev.written;
    next.writtenHash = prev.writtenHash;
  }

  // Sum per coach, dropping anything that cannot move a score (already at 0).
  const perCoach = new Map<number, number>();
  for (const e of entries) perCoach.set(e.coachRow, (perCoach.get(e.coachRow) ?? 0) + e.points);
  const deductions = [...perCoach.entries()]
    .filter(([row, pts]) => pts > 0 && (next.coaches[row]?.score ?? prev?.coaches[row]?.score ?? 1) > 0)
    .map(([coachRow, points]) => ({ coachRow, points }));

  if (!spec || !deductions.length) {
    saveLedger(snapshot.dynastyId, next);
    return none;
  }

  const result = await pipeline.adjustPrestige(deductions, savePath);
  if (!result.ok || !result.editedPath) {
    // The ledger is left where it was, so the next parse charges the same
    // games again. A busy pipeline or a save that moved on disk is routine;
    // a coded failure is a real write error and is surfaced to the user.
    log.warn('prestige', 'review write skipped — will retry on the next parse', {
      message: result.message,
      code: result.code ?? null,
      coaches: deductions.length,
      points: deductions.reduce((n, d) => n + d.points, 0)
    });
    if (result.code) throw new PrestigeWriteError(result.message, result.code);
    return none;
  }
  // Each entry shows its own step of the coach's running score, in ledger order,
  // so a coach charged twice in one write reads 665 → 662 → 659, not 665 → 659 twice.
  const running = new Map((result.applied ?? []).map((a) => [a.coachRow, a.before]));
  let total = 0;
  for (const e of entries) {
    const cur = running.get(e.coachRow);
    if (cur !== undefined) {
      e.before = cur;
      e.after = Math.max(0, cur - e.points);
      running.set(e.coachRow, e.after);
    }
    total += e.points;
  }
  for (const a of result.applied ?? []) {
    next.written[a.coachRow] = {
      before: a.before,
      after: a.after,
      seasonYear: next.seasonYear,
      week: next.week
    };
  }
  next.writtenHash = pipeline.currentHash;
  next.entries = [...next.entries, ...entries].slice(-PRESTIGE_ENTRY_CAP);
  next.lastReview = {
    seasonYear: next.seasonYear,
    week: next.week,
    count: entries.length,
    points: total,
    at: Date.now()
  };
  saveLedger(snapshot.dynastyId, next);
  log.info('prestige', 'review written', {
    file: basename(result.editedPath),
    coaches: deductions.length,
    entries: entries.length,
    points: total,
    tier
  });
  return { editedPath: result.editedPath, entries };
}

/** What the renderer shows for the current dynasty. */
export function prestigeView(dynastyId: string | null, tier: PrestigeTier, seasonYear: number | null): PrestigeView {
  const ledger = loadLedger(dynastyId);
  // Newest week first, but ledger order inside a week — a skid line follows the loss it compounds.
  const entries = (ledger?.entries ?? [])
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.seasonYear - a.e.seasonYear || b.e.week - a.e.week || a.i - b.i)
    .map((x) => x.e)
    .slice(0, 240);
  return {
    tier,
    seasonYear,
    entries,
    seasonTotals: seasonYear != null && ledger ? seasonDeductions(ledger.entries, seasonYear) : {},
    lastReview: ledger?.lastReview ?? null,
    baselineOnly: !!ledger && !ledger.entries.length
  };
}
