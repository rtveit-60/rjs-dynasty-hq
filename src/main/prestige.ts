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
  try {
    const p = ledgerPath(dynastyId);
    if (!existsSync(p)) return null;
    const raw = JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, '')) as PrestigeLedger;
    return raw && raw.version === 1 ? raw : null;
  } catch {
    return null;
  }
}

function saveLedger(dynastyId: string | null, ledger: PrestigeLedger): void {
  try {
    writeFileSync(ledgerPath(dynastyId), JSON.stringify(ledger), 'utf8');
  } catch (err) {
    log.warn('prestige', 'ledger not saved', { message: err instanceof Error ? err.message : String(err) });
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
 * parse. Never throws — a failed write leaves the ledger where it was so the
 * next parse retries.
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

  // Deductions the game's own save overwrote. Skipped when this parse is of
  // the file the app itself wrote — the check belongs to the first game save after it.
  const ownFile = !!prev?.writtenHash && prev.writtenHash === pipeline.currentHash;
  if (prev && !ownFile && Object.keys(prev.written).length) {
    if (spec) {
      for (const lost of lostWrites(prev, snapshot)) {
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
    log.warn('prestige', 'review write skipped', { message: result.message, count: deductions.length });
    return none;
  }
  const byRow = new Map((result.applied ?? []).map((a) => [a.coachRow, a]));
  let total = 0;
  for (const e of entries) {
    const a = byRow.get(e.coachRow);
    if (a) {
      e.before = a.before;
      e.after = a.after;
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
  const entries = [...(ledger?.entries ?? [])].reverse().slice(0, 240);
  return {
    tier,
    seasonYear,
    entries,
    seasonTotals: seasonYear != null && ledger ? seasonDeductions(ledger.entries, seasonYear) : {},
    lastReview: ledger?.lastReview ?? null,
    baselineOnly: !!ledger && !ledger.entries.length
  };
}
