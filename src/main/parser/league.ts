/**
 * League-wide season stat leaders, for Media HQ. One sweep over every rostered
 * player's current-season stat row — a few thousand ref follows, so the
 * pipeline computes it once per parse and caches the result.
 */
import type { LeaderCategory, LeaderRow, LeagueLeaders, TeamSeasonTotals } from '../../shared/types.ts';
import {
  isNullRef,
  mainTable,
  refFromRecord,
  refsFromArrayRecord,
  tableById,
  tableWithField,
  val,
  type Ref
} from './franchise.ts';

async function recordAt(franchise: any, ref: Ref | null): Promise<any | null> {
  if (isNullRef(ref)) return null;
  const t = await tableById(franchise, ref.tableId);
  return t?.records?.[ref.row] ?? null;
}

const num = (rec: any, key: string): number => {
  const v = Number(val(rec, key));
  return Number.isFinite(v) ? v : 0;
};

interface Tally {
  playerRow: number;
  name: string;
  position: string;
  teamIndex: number;
  passYds: number;
  passTds: number;
  rushYds: number;
  rushTds: number;
  recvYds: number;
  recvCatches: number;
  tackles: number;
  tfl: number;
  sacks: number;
  ints: number;
  fgs: number;
}

const PLAYER_FIELDS = ['FirstName', 'LastName', 'Position', 'TeamIndex', 'SeasonStats'];

export async function extractLeagueLeaders(franchise: any): Promise<LeagueLeaders | null> {
  try {
    // The season index SEAS_YEAR counts in, plus the calendar year for display.
    const si = await tableWithField(franchise, 'SeasonInfo', 'CurrentSeasonYear');
    const sir = si?.records?.find((r: any) => !r.isEmpty);
    const yearIndex = Number(val(sir, 'CurrentYear') ?? 0);
    const seasonYear = Number(val(sir, 'CurrentSeasonYear') ?? 0);

    // Team names by TeamIndex, the id space player rows carry.
    const teamTable = mainTable(franchise, 'Team');
    await teamTable.readRecords(['LongName', 'DisplayName', 'TeamIndex']);
    const teamByIndex = new Map<number, { name: string; row: number }>();
    (teamTable.records as any[]).forEach((rec, row) => {
      if (rec.isEmpty) return;
      const name =
        String(val(rec, 'DisplayName') ?? '').trim() || String(val(rec, 'LongName') ?? '').trim();
      const ti = Number(val(rec, 'TeamIndex'));
      if (name && Number.isInteger(ti) && ti >= 0) teamByIndex.set(ti, { name, row });
    });

    const pt = mainTable(franchise, 'Player');
    await pt.readRecords(PLAYER_FIELDS);

    const tallies: Tally[] = [];
    const records: any[] = pt.records ?? [];
    for (let row = 0; row < records.length; row++) {
      const rec = records[row];
      if (!rec || rec.isEmpty) continue;
      const teamIndex = Number(val(rec, 'TeamIndex'));
      if (!Number.isInteger(teamIndex) || teamIndex < 0 || !teamByIndex.has(teamIndex)) continue;

      const seasonArr = await recordAt(franchise, refFromRecord(rec, 'SeasonStats'));
      if (!seasonArr) continue;
      let t: Tally | null = null;
      for (const ref of refsFromArrayRecord(seasonArr)) {
        const srec = await recordAt(franchise, ref);
        if (!srec || num(srec, 'SEAS_YEAR') !== yearIndex) continue;
        if (!t) {
          t = {
            playerRow: row,
            name: `${String(val(rec, 'FirstName') ?? '').trim()} ${String(val(rec, 'LastName') ?? '').trim()}`.trim(),
            position: String(val(rec, 'Position') ?? ''),
            teamIndex,
            passYds: 0,
            passTds: 0,
            rushYds: 0,
            rushTds: 0,
            recvYds: 0,
            recvCatches: 0,
            tackles: 0,
            tfl: 0,
            sacks: 0,
            ints: 0,
            fgs: 0
          };
        }
        // A year can hold more than one row (offense beside returns) carrying
        // disjoint categories, so summing never double-counts.
        t.passYds += num(srec, 'PASSYARDS');
        t.passTds += num(srec, 'PASSTDS');
        t.rushYds += num(srec, 'RUSHYARDS');
        t.rushTds += num(srec, 'RUSHTDS');
        t.recvYds += num(srec, 'RECEIVEYARDS');
        t.recvCatches += num(srec, 'RECEIVECATCHES');
        t.tackles += num(srec, 'DEFTACKLES') + num(srec, 'ASSDEFTACKLES');
        t.tfl += num(srec, 'DEFTACKLESFORLOSS');
        t.sacks += num(srec, 'DLINESACKS') + num(srec, 'DLINEHALFSACK') / 2;
        t.ints += num(srec, 'DSECINTS');
        t.fgs += num(srec, 'KICKFGMADE');
      }
      if (t) tallies.push(t);
    }

    const top = (
      key: LeaderCategory['key'],
      label: string,
      short: string,
      value: (t: Tally) => number,
      sub: (t: Tally) => string
    ): LeaderCategory => ({
      key,
      label,
      short,
      rows: [...tallies]
        .filter((t) => value(t) > 0)
        .sort((a, b) => value(b) - value(a))
        .slice(0, 5)
        .map((t): LeaderRow => {
          const team = teamByIndex.get(t.teamIndex);
          return {
            playerRow: t.playerRow,
            name: t.name,
            position: t.position,
            team: team?.name ?? '',
            teamRow: team?.row ?? null,
            value: value(t),
            sub: sub(t)
          };
        })
    });

    // Per-team season totals, for the program panel and league context.
    const teamTotals = new Map<number, TeamSeasonTotals>();
    for (const t of tallies) {
      const team = teamByIndex.get(t.teamIndex);
      if (!team) continue;
      const agg =
        teamTotals.get(team.row) ??
        ({ teamRow: team.row, passYds: 0, rushYds: 0, offTds: 0, fgs: 0, sacks: 0, ints: 0 } as TeamSeasonTotals);
      agg.passYds += t.passYds;
      agg.rushYds += t.rushYds;
      agg.offTds += t.passTds + t.rushTds;
      agg.fgs += t.fgs;
      agg.sacks += t.sacks;
      agg.ints += t.ints;
      teamTotals.set(team.row, agg);
    }

    return {
      seasonYear,
      categories: [
        top('pass', 'Passing yards', 'PASS', (t) => t.passYds, (t) => `${t.passTds} TD`),
        top('rush', 'Rushing yards', 'RUSH', (t) => t.rushYds, (t) => `${t.rushTds} TD`),
        top('recv', 'Receiving yards', 'REC', (t) => t.recvYds, (t) => `${t.recvCatches} rec`),
        top('total', 'Total yards', 'ALL', (t) => t.passYds + t.rushYds + t.recvYds, (t) => `${t.passTds + t.rushTds} TD`),
        top('tackles', 'Tackles', 'TKL', (t) => t.tackles, (t) => `${t.tfl} TFL`),
        top('sacks', 'Sacks', 'SACK', (t) => t.sacks, (t) => `${t.tackles} tkl`),
        top('ints', 'Interceptions', 'INT', (t) => t.ints, (t) => `${t.tackles} tkl`)
      ],
      teams: [...teamTotals.values()]
    };
  } catch {
    return null;
  }
}
