import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { adoptLegacyFile, stateDir } from './state-dirs.ts';
import type { SeasonRecord } from '../shared/types.ts';

/** Seasons shown on the Program Dashboard record graph. */
const KEEP = 8;

/**
 * The save only carries a rolling five-season window, so completed seasons are
 * banked per dynasty and school under userData/history and merged back on
 * every parse. Save data always wins for the years it still covers.
 */
export function mergeSeasonHistory(
  dynastyId: string | null,
  teamRow: number,
  fromSave: SeasonRecord[]
): SeasonRecord[] {
  try {
    const name = `seasons-${teamRow}.json`;
    const adopted = adoptLegacyFile('history', dynastyId, name);
    const file = join(stateDir('history', dynastyId), name);
    let stored: Record<string, SeasonRecord> = {};
    try {
      stored = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      // first parse for this school
    }
    // A freshly adopted flat file may carry rows another dynasty banked for
    // this school. Years this save hasn't reached yet are provably foreign —
    // drop them; and while the current season is still being played the save
    // owns its row outright, so a leftover banked bowl can't ride along.
    const nowYear = fromSave.length ? Math.max(...fromSave.map((r) => r.year)) : 0;
    if (adopted && nowYear) {
      for (const key of Object.keys(stored)) if (Number(key) > nowYear) delete stored[key];
      const live = fromSave.find((r) => r.year === nowYear);
      const banked = stored[nowYear];
      if (banked?.bowl && live?.inProgress && !live.bowl) stored[nowYear] = { ...banked, bowl: null };
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
