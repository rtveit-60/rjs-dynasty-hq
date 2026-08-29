import { app } from 'electron';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameInfo } from '../shared/types.ts';

/**
 * The save keeps game-by-game results for the current season only — every
 * SeasonGame row is recycled when the year turns. So each parse banks the
 * whole league schedule for the season underway; once the year advances, the
 * banked file is the only game-by-game record that season has. Same idea as
 * history.ts, one level deeper.
 */
function dir(): string {
  const d = join(app.getPath('userData'), 'schedules');
  mkdirSync(d, { recursive: true });
  return d;
}

export function bankSeasonGames(calendarYear: number, games: GameInfo[]): void {
  try {
    if (!calendarYear || !games.length) return;
    writeFileSync(join(dir(), `year-${calendarYear}.json`), JSON.stringify(games), 'utf8');
  } catch {
    // banking is an enhancement — never fail a parse over it
  }
}

/** Every banked season, year → league games. */
export function readBankedGames(): Map<number, GameInfo[]> {
  const out = new Map<number, GameInfo[]>();
  try {
    for (const f of readdirSync(dir())) {
      const m = f.match(/^year-(\d{4})\.json$/);
      if (!m) continue;
      try {
        const games = JSON.parse(readFileSync(join(dir(), f), 'utf8')) as GameInfo[];
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
