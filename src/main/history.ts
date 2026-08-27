import { app } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SeasonRecord } from '../shared/types.ts';

/** Seasons shown on the Program Dashboard record graph. */
const KEEP = 8;

/**
 * The save only carries a rolling five-season window, so completed seasons are
 * banked per school under userData/history and merged back on every parse.
 * Save data always wins for the years it still covers.
 */
export function mergeSeasonHistory(teamRow: number, fromSave: SeasonRecord[]): SeasonRecord[] {
  try {
    const dir = join(app.getPath('userData'), 'history');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `seasons-${teamRow}.json`);
    let stored: Record<string, SeasonRecord> = {};
    try {
      stored = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      // first parse for this school
    }
    // Save data wins, except a banked bowl: it is only readable during bowl
    // season, so never let a later parse blank one out.
    for (const rec of fromSave) {
      stored[rec.year] = { ...rec, bowl: rec.bowl ?? stored[rec.year]?.bowl ?? null };
    }
    const years = Object.keys(stored)
      .map(Number)
      .sort((a, b) => a - b);
    const latest = years[years.length - 1];
    const merged = years.map((y) => {
      const rec = stored[y];
      return rec.inProgress && y !== latest ? { ...rec, inProgress: false } : rec;
    });
    writeFileSync(file, JSON.stringify(Object.fromEntries(merged.map((m) => [m.year, m]))), 'utf8');
    return merged.slice(-KEEP);
  } catch {
    return fromSave.slice(-KEEP);
  }
}
