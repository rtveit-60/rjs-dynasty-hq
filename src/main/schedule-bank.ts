import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { adoptLegacyDir, stateDir } from './state-dirs.ts';
import type { GameInfo } from '../shared/types.ts';

/**
 * The save keeps game-by-game results for the current season only — every
 * SeasonGame row is recycled when the year turns. So each parse banks the
 * whole league schedule for the season underway; once the year advances, the
 * banked file is the only game-by-game record that season has. Same idea as
 * history.ts, one level deeper. Banked per dynasty: year files carry no
 * dynasty-discriminating key of their own, so without the namespace any two
 * dynasties would overwrite each other's seasons.
 */
const YEAR_FILE = /^year-(\d{4})\.json$/;

function dir(dynastyId: string | null, currentYear = 0): string {
  // First claim adopts the flat pre-namespacing bank. Year files beyond the
  // save's own season are provably another dynasty's — deleted rather than
  // moved; that dynasty rewrites its current season on its own next parse.
  adoptLegacyDir('schedules', dynastyId, YEAR_FILE, (f) => {
    const y = Number(f.match(YEAR_FILE)?.[1] ?? 0);
    return currentYear > 0 && y > currentYear;
  });
  return stateDir('schedules', dynastyId);
}

export function bankSeasonGames(
  dynastyId: string | null,
  calendarYear: number,
  games: GameInfo[]
): void {
  try {
    if (!calendarYear || !games.length) return;
    writeFileSync(
      join(dir(dynastyId, calendarYear), `year-${calendarYear}.json`),
      JSON.stringify(games),
      'utf8'
    );
  } catch {
    // banking is an enhancement — never fail a parse over it
  }
}

/** Every banked season for this dynasty, year → league games. */
export function readBankedGames(dynastyId: string | null): Map<number, GameInfo[]> {
  const out = new Map<number, GameInfo[]>();
  try {
    const d = dir(dynastyId);
    for (const f of readdirSync(d)) {
      const m = f.match(YEAR_FILE);
      if (!m) continue;
      try {
        const games = JSON.parse(readFileSync(join(d, f), 'utf8')) as GameInfo[];
        if (Array.isArray(games) && games.length) out.set(Number(m[1]), games);
      } catch {
        // a corrupt year file only costs that year
      }
    }
  } catch {
    // no bank yet
  }
  return out;
}
