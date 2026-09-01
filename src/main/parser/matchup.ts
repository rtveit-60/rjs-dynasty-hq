import type {
  GameInfo,
  MatchupExtras,
  MatchupMeeting,
  SeasonSplits,
  StatRecordEntry
} from '../../shared/types.ts';
import { extractSplits } from './extract.ts';
import {
  isNullRef,
  mainTable,
  readTable,
  refFromRecord,
  refsFromArrayRecord,
  tableById,
  val
} from './franchise.ts';

/**
 * The game's live FBS record book: League.Player{Season,Game,Career}StatRecords
 * each point at a small PlayerStatRecord array — records-to-beat seeded with
 * real history (Barry Sanders' 2,628 season rushing yards and so on), rewritten
 * with the dynasty player's name and year when one falls. Names are
 * denormalized text, so rows survive player recycling.
 */
async function readRecordBook(franchise: any): Promise<StatRecordEntry[]> {
  const out: StatRecordEntry[] = [];
  try {
    const league = await readTable(mainTable(franchise, 'League'));
    const lrec = (league.records as any[]).find((r: any) => !r.isEmpty);
    if (!lrec) return out;
    const scopes: [string, StatRecordEntry['scope']][] = [
      ['PlayerSeasonStatRecords', 'season'],
      ['PlayerGameStatRecords', 'game'],
      ['PlayerCareerStatRecords', 'career']
    ];
    for (const [field, scope] of scopes) {
      const ref = refFromRecord(lrec, field);
      if (isNullRef(ref)) continue;
      const arrTable = await tableById(franchise, ref.tableId);
      const arrRec = arrTable?.records?.[ref.row];
      for (const r of arrRec ? refsFromArrayRecord(arrRec) : []) {
        const t = await tableById(franchise, r.tableId);
        const rec = t?.records?.[r.row];
        if (!rec) continue;
        const statType = String(val(rec, 'statType') ?? '');
        const value = Number(val(rec, 'statValue') ?? 0);
        if (!statType || !Number.isFinite(value) || value <= 0) continue;
        out.push({
          scope,
          statType,
          value,
          firstName: String(val(rec, 'firstName') ?? ''),
          lastName: String(val(rec, 'lastName') ?? ''),
          teamName: String(val(rec, 'teamName') ?? ''),
          year: Number(val(rec, 'calendarYear') ?? 0)
        });
      }
    }
  } catch {
    // the record book is decoration — the tab renders without it
  }
  return out;
}

/**
 * Everything the Matchup tab needs that the snapshot doesn't carry: season
 * splits for both schools (the same panels Tendencies reads, computable for
 * any team row), all banked prior meetings between them, and the record book.
 */
export async function extractMatchupExtras(
  franchise: any,
  homeRow: number,
  awayRow: number,
  banked: Map<number, GameInfo[]>
): Promise<MatchupExtras> {
  const teamTable = await readTable(mainTable(franchise, 'Team'));
  const splitsFor = async (row: number): Promise<SeasonSplits | null> => {
    const rec = teamTable.records?.[row];
    return rec && !rec.isEmpty ? extractSplits(franchise, rec) : null;
  };

  const meetings: MatchupMeeting[] = [];
  for (const [year, games] of banked) {
    for (const g of games) {
      const samePair =
        (g.homeRow === homeRow && g.awayRow === awayRow) ||
        (g.homeRow === awayRow && g.awayRow === homeRow);
      if (!samePair || g.status === 'unplayed') continue;
      meetings.push({
        year,
        week: g.week,
        weekType: g.weekType,
        homeRow: g.homeRow,
        awayRow: g.awayRow,
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        bowlName: g.bowlName ?? null
      });
    }
  }
  meetings.sort((a, b) => a.year - b.year || a.week - b.week);

  return {
    home: await splitsFor(homeRow),
    away: await splitsFor(awayRow),
    meetings,
    records: await readRecordBook(franchise)
  };
}
