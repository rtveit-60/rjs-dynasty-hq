/**
 * On-demand profiles: the pop-up detail behind any clicked name. Player and
 * coach profiles follow the save's own stat links (Player.SeasonStats /
 * CareerStats / GameStats, Coach.CareerStats and the transaction log); school
 * profiles read the schedule, the year-by-year series history and the
 * program's all-time ledger. Everything here is read per request — none of it
 * belongs in the snapshot.
 */
import type {
  CoachCareerStats,
  CoachProfile,
  CoachStop,
  GameInfo,
  GameLogRow,
  PlayerProfile,
  PlayerStop,
  ScheduleGame,
  SchoolAllTime,
  SchoolProfile,
  SchoolSeason,
  SeasonStatRow,
  StatLine,
  TargetSchool
} from '../../shared/types.ts';
import { SCHOOL_LOCATIONS } from '../data/school-locations.ts';
import { ensureCoachSchema } from './coach-schema.ts';
import {
  isNullRef,
  mainTable,
  refFromRecord,
  refsFromArrayRecord,
  tableById,
  tableWithField,
  tablesByName,
  val
} from './franchise.ts';
import { CARD_FIELDS, abilitiesFromRecord, ratingsFromRecord } from './recruit-card.ts';

// ---------------------------------------------------------------------------
// Shared context

interface Ctx {
  teamTable: any;
  teamTableId: number;
  nameByRow: Map<number, string>;
  rowByTeamIndex: Map<number, number>;
  /** Team row by the school's PresentationId — the id space Coach.AlmaMater lives in. */
  rowByPresentationId: Map<number, number>;
  /** SeasonInfo.CurrentYear — the 0-based index SEAS_YEAR/SeasonYear count in. */
  yearIndex: number;
  /** Calendar year of season index 0, so calendar = base + SEAS_YEAR. */
  calendarBase: number;
  /** SeasonInfo.CurrentStage — 'OffSeason' once the year is final. */
  stage: string;
}

const TEAM_FIELDS = [
  'LongName',
  'DisplayName',
  'NickName',
  'TeamIndex',
  'PresentationId',
  'MediaPoll_CurrentRank',
  'PrestigeRank',
  'CurSeasonConfStanding',
  'OffensiveRank',
  'DefensiveRank',
  'TeamHistoricalData',
  'TeamSeriesHistory',
  'TEAM_BACKGROUNDCOLORR',
  'TEAM_BACKGROUNDCOLORG',
  'TEAM_BACKGROUNDCOLORB',
  'TEAM_BACKGROUNDCOLORR2',
  'TEAM_BACKGROUNDCOLORG2',
  'TEAM_BACKGROUNDCOLORB2'
];

async function buildCtx(franchise: any): Promise<Ctx> {
  const teamTable = mainTable(franchise, 'Team');
  await teamTable.readRecords(TEAM_FIELDS);
  const nameByRow = new Map<number, string>();
  const rowByTeamIndex = new Map<number, number>();
  const rowByPresentationId = new Map<number, number>();
  (teamTable.records as any[]).forEach((rec, row) => {
    if (rec.isEmpty) return;
    const name = String(val(rec, 'LongName') ?? '').trim() || String(val(rec, 'DisplayName') ?? '').trim();
    if (!name) return;
    nameByRow.set(row, name);
    const ti = Number(val(rec, 'TeamIndex'));
    if (Number.isInteger(ti) && ti >= 0) rowByTeamIndex.set(ti, row);
    const pid = Number(val(rec, 'PresentationId'));
    if (Number.isInteger(pid) && pid > 0) rowByPresentationId.set(pid, row);
  });

  let yearIndex = 0;
  let calendarBase = 0;
  let stage = '';
  const si = await tableWithField(franchise, 'SeasonInfo', 'CurrentSeasonYear');
  const sir = si?.records?.find((r: any) => !r.isEmpty);
  if (sir) {
    const calendar = Number(val(sir, 'CurrentSeasonYear') ?? 0);
    yearIndex = Number(val(sir, 'CurrentYear') ?? 0);
    calendarBase = calendar - yearIndex;
    stage = String(val(sir, 'CurrentStage') ?? '');
  }
  return {
    teamTable,
    teamTableId: teamTable.header?.tableId ?? -1,
    nameByRow,
    rowByTeamIndex,
    rowByPresentationId,
    yearIndex,
    calendarBase,
    stage
  };
}

// ---------------------------------------------------------------------------
// Stat lines — one definition renders season, career and game rows alike.

type Get = (field: string) => number;

interface CategoryDef {
  name: string;
  /** Category renders when any of these is non-zero. */
  when: string[];
  cells: [string, (g: Get) => string][];
}

const n = (v: number): string => String(v);
const grand = (v: number): string => v.toLocaleString('en-US');
const per = (num: number, den: number): string => (den > 0 ? (num / den).toFixed(1) : '0.0');
const pct = (num: number, den: number): string => (den > 0 ? `${Math.round((num / den) * 100)}%` : '—');
/** Full sacks plus halves at 0.5, printed the way box scores print them. */
const sacks = (full: number, half: number): string => {
  const v = full + half / 2;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

const CATEGORIES: CategoryDef[] = [
  {
    name: 'Passing',
    when: ['PASSATTEMPTS'],
    cells: [
      ['C/ATT', (g) => `${g('PASSCOMPLETED')}/${g('PASSATTEMPTS')}`],
      ['PCT', (g) => pct(g('PASSCOMPLETED'), g('PASSATTEMPTS'))],
      ['YDS', (g) => grand(g('PASSYARDS'))],
      ['AVG', (g) => per(g('PASSYARDS'), g('PASSATTEMPTS'))],
      ['TD', (g) => n(g('PASSTDS'))],
      ['INT', (g) => n(g('PASSINTS'))],
      ['LNG', (g) => n(g('PASSLONGEST'))],
      ['SCK', (g) => n(g('PASSSACKED'))]
    ]
  },
  {
    name: 'Rushing',
    when: ['RUSHATTEMPTS'],
    cells: [
      ['CAR', (g) => n(g('RUSHATTEMPTS'))],
      ['YDS', (g) => grand(g('RUSHYARDS'))],
      ['AVG', (g) => per(g('RUSHYARDS'), g('RUSHATTEMPTS'))],
      ['TD', (g) => n(g('RUSHTDS'))],
      ['LNG', (g) => n(g('RUSHLONGEST'))],
      ['BTK', (g) => n(g('RUSHBROKENTACKLES'))],
      ['FUM', (g) => n(g('RUSHFUMBLES'))]
    ]
  },
  {
    name: 'Receiving',
    when: ['RECEIVECATCHES', 'RECEIVEYARDS', 'RECEIVEDROPS'],
    cells: [
      ['REC', (g) => n(g('RECEIVECATCHES'))],
      ['YDS', (g) => grand(g('RECEIVEYARDS'))],
      ['AVG', (g) => per(g('RECEIVEYARDS'), g('RECEIVECATCHES'))],
      ['TD', (g) => n(g('RECEIVETDS'))],
      ['LNG', (g) => n(g('RECEIVELONGEST'))],
      ['YAC', (g) => grand(g('RECEIVEYARDSAFTER'))],
      ['DRP', (g) => n(g('RECEIVEDROPS'))]
    ]
  },
  {
    name: 'Blocking',
    when: ['OLINEPANCAKES', 'OLINESACKSALLOWED'],
    cells: [
      ['PANCAKES', (g) => n(g('OLINEPANCAKES'))],
      ['SACKS ALW', (g) => n(g('OLINESACKSALLOWED'))]
    ]
  },
  {
    name: 'Defense',
    when: [
      'DEFTACKLES',
      'ASSDEFTACKLES',
      'DEFTACKLESFORLOSS',
      'DLINESACKS',
      'DLINEHALFSACK',
      'DSECINTS',
      'DEFPASSDEFLECTIONS',
      'DLINEFORCEDFUMBLES',
      'DLINEFUMBLERECOVERIES',
      'BIGHITS'
    ],
    cells: [
      ['TKL', (g) => n(g('DEFTACKLES') + g('ASSDEFTACKLES'))],
      ['SOLO', (g) => n(g('DEFTACKLES'))],
      ['TFL', (g) => n(g('DEFTACKLESFORLOSS'))],
      ['SACK', (g) => sacks(g('DLINESACKS'), g('DLINEHALFSACK'))],
      ['INT', (g) => n(g('DSECINTS'))],
      ['PD', (g) => n(g('DEFPASSDEFLECTIONS'))],
      ['FF', (g) => n(g('DLINEFORCEDFUMBLES'))],
      ['FR', (g) => n(g('DLINEFUMBLERECOVERIES'))],
      ['TD', (g) => n(g('DSECINTTDS') + g('DLINEFUMBLETDS'))]
    ]
  },
  {
    name: 'Kicking',
    when: ['KICKFGATTEMPTS', 'KICKEPATTEMPTS'],
    cells: [
      ['FG', (g) => `${g('KICKFGMADE')}/${g('KICKFGATTEMPTS')}`],
      ['PCT', (g) => pct(g('KICKFGMADE'), g('KICKFGATTEMPTS'))],
      ['LNG', (g) => n(g('KICKFGLONGEST'))],
      ['XP', (g) => `${g('KICKEPMADE')}/${g('KICKEPATTEMPTS')}`],
      ['50+', (g) => `${g('KICKFGMADE50ORMORE')}/${g('KICKFGATTEMPTS50ORMORE')}`]
    ]
  },
  {
    name: 'Punting',
    when: ['PUNTATTEMPTS'],
    cells: [
      ['PUNTS', (g) => n(g('PUNTATTEMPTS'))],
      ['YDS', (g) => grand(g('PUNTYARDS'))],
      ['AVG', (g) => per(g('PUNTYARDS'), g('PUNTATTEMPTS'))],
      ['NET', (g) => per(g('PUNTNETYARDS'), g('PUNTATTEMPTS'))],
      ['LNG', (g) => n(g('PUNTLONGEST'))],
      ['IN20', (g) => n(g('PUNTIN20'))],
      ['TB', (g) => n(g('PUNTTOUCHBACKS'))]
    ]
  },
  {
    name: 'Kick Return',
    when: ['KRETATTEMPTS'],
    cells: [
      ['RET', (g) => n(g('KRETATTEMPTS'))],
      ['YDS', (g) => grand(g('KRETYARDS'))],
      ['AVG', (g) => per(g('KRETYARDS'), g('KRETATTEMPTS'))],
      ['TD', (g) => n(g('KRETTDS'))],
      ['LNG', (g) => n(g('KRETLONGEST'))]
    ]
  },
  {
    name: 'Punt Return',
    when: ['PRETATTEMPTS'],
    cells: [
      ['RET', (g) => n(g('PRETATTEMPTS'))],
      ['YDS', (g) => grand(g('PRETYARDS'))],
      ['AVG', (g) => per(g('PRETYARDS'), g('PRETATTEMPTS'))],
      ['TD', (g) => n(g('PRETTDS'))],
      ['LNG', (g) => n(g('PRETLONGEST'))]
    ]
  }
];

/** Render every category a stat record triggers. Works on any of the stat tables. */
function statLines(rec: any): StatLine[] {
  const g: Get = (field) => {
    const v = Number(val(rec, field));
    return Number.isFinite(v) ? v : 0;
  };
  const out: StatLine[] = [];
  for (const cat of CATEGORIES) {
    if (!cat.when.some((f) => g(f) !== 0)) continue;
    out.push({ category: cat.name, cells: cat.cells.map(([label, fn]) => ({ label, value: fn(g) })) });
  }
  return out;
}

function numOf(rec: any, field: string): number {
  const v = Number(val(rec, field));
  return Number.isFinite(v) ? v : 0;
}

async function recordAt(franchise: any, ref: { tableId: number; row: number } | null): Promise<any | null> {
  if (isNullRef(ref)) return null;
  const t = await tableById(franchise, ref.tableId);
  return t?.records?.[ref.row] ?? null;
}

// ---------------------------------------------------------------------------
// Player

const PROFILE_PLAYER_FIELDS = [
  ...CARD_FIELDS,
  'JerseyNum',
  'SchoolYear',
  'RedshirtStatus',
  'TeamIndex',
  'PLYR_CONSECYEARSWITHTEAM',
  'YearlyAwardCount',
  'InjuryStatus',
  'ProspectStarRating',
  'RecruitingDealbreaker',
  'SeasonStats',
  'CareerStats',
  'GameStats'
];

const STAR_MAP: Record<string, number> = {
  FIVE_STAR: 5,
  FOUR_STAR: 4,
  THREE_STAR: 3,
  TWO_STAR: 2,
  ONE_STAR: 1
};

const SEASON_GAME_FIELDS = [
  'SeasonYear',
  'SeasonWeek',
  'SeasonWeekType',
  'HomeTeam',
  'AwayTeam',
  'HomeScore',
  'AwayScore',
  'GameStatus',
  'BowlGame',
  'BroadcastNetwork',
  'Attendance',
  'IsOvertimeGame'
];

function seasonGameTable(franchise: any): any | null {
  const candidates = tablesByName(franchise, 'SeasonGame').filter(
    (t: any) => (t.header?.recordCapacity ?? 0) > 100
  );
  if (!candidates.length) return null;
  return candidates.sort((a: any, b: any) => b.header.recordCapacity - a.header.recordCapacity)[0];
}

export async function extractPlayerProfile(
  franchise: any,
  playerRow: number,
  userTeamRow: number | null = null
): Promise<PlayerProfile | null> {
  try {
    const ctx = await buildCtx(franchise);
    const pt = mainTable(franchise, 'Player');
    await pt.readRecords(PROFILE_PLAYER_FIELDS);
    const rec = pt.records?.[playerRow];
    if (!rec || rec.isEmpty) return null;

    const teamIndex = Number(val(rec, 'TeamIndex'));
    const teamRow = ctx.rowByTeamIndex.get(teamIndex) ?? null;

    // Season-by-season rows. A year can hold more than one row (a returner has
    // a KP-return row beside the offense row) — merge them under the year.
    const byYear = new Map<number, SeasonStatRow>();
    const seasonArr = await recordAt(franchise, refFromRecord(rec, 'SeasonStats'));
    if (seasonArr) {
      for (const ref of refsFromArrayRecord(seasonArr)) {
        const srec = await recordAt(franchise, ref);
        if (!srec) continue;
        const idx = numOf(srec, 'SEAS_YEAR');
        if (idx < 0) continue;
        const year = ctx.calendarBase + idx;
        const rowTeamIdx = numOf(srec, 'YEARBYYEARTEAMINDEX');
        const rowTeamRow = ctx.rowByTeamIndex.get(rowTeamIdx) ?? null;
        const team =
          (rowTeamRow !== null ? ctx.nameByRow.get(rowTeamRow) : null) ??
          String(val(srec, 'TeamPrefixName') ?? '').trim();
        const lines = statLines(srec);
        const entry = byYear.get(year);
        if (entry) {
          entry.lines.push(...lines);
          entry.gamesPlayed = Math.max(entry.gamesPlayed, numOf(srec, 'GAMESPLAYED'));
          entry.gamesStarted = Math.max(entry.gamesStarted, numOf(srec, 'GAMESSTARTED'));
          if (!entry.team && team) {
            entry.team = team;
            entry.teamRow = rowTeamRow;
          }
        } else {
          byYear.set(year, {
            year,
            team,
            teamRow: rowTeamRow,
            gamesPlayed: numOf(srec, 'GAMESPLAYED'),
            gamesStarted: numOf(srec, 'GAMESSTARTED'),
            lines
          });
        }
      }
    }
    const seasons = [...byYear.values()].sort((a, b) => b.year - a.year);

    // Schools worn, oldest first, from the season rows' own team columns.
    const stops: PlayerStop[] = [];
    for (const s of [...seasons].reverse()) {
      const last = stops[stops.length - 1];
      if (!s.team) continue;
      if (!last || last.team !== s.team) stops.push({ fromYear: s.year, team: s.team, teamRow: s.teamRow });
    }

    // Career totals.
    const careerRec = await recordAt(franchise, refFromRecord(rec, 'CareerStats'));
    const career: StatLine[] = careerRec ? statLines(careerRec) : [];
    if (careerRec && numOf(careerRec, 'GAMESPLAYED') > 0) {
      career.unshift({
        category: 'Games',
        cells: [
          { label: 'GP', value: String(numOf(careerRec, 'GAMESPLAYED')) },
          { label: 'GS', value: String(numOf(careerRec, 'GAMESSTARTED')) }
        ]
      });
    }

    // Game log. Rows point at the SeasonGame and the opponent directly.
    const games: GameLogRow[] = [];
    const gamesArr = await recordAt(franchise, refFromRecord(rec, 'GameStats'));
    if (gamesArr) {
      const sg = seasonGameTable(franchise);
      if (sg) await sg.readRecords(SEASON_GAME_FIELDS);
      for (const ref of refsFromArrayRecord(gamesArr)) {
        const grec = await recordAt(franchise, ref);
        if (!grec) continue;
        const oppRef = refFromRecord(grec, 'OpposingTeam');
        const gameRef = refFromRecord(grec, 'SeasonGame');
        const opponentRow = !isNullRef(oppRef) && oppRef.tableId === ctx.teamTableId ? oppRef.row : null;
        const game = !isNullRef(gameRef) && sg && gameRef.tableId === sg.header?.tableId
          ? sg.records?.[gameRef.row]
          : null;
        let year = 0;
        let week = 0;
        let weekType = '';
        let home = false;
        let result = '';
        if (game) {
          year = ctx.calendarBase + numOf(game, 'SeasonYear');
          week = numOf(game, 'SeasonWeek');
          weekType = String(val(game, 'SeasonWeekType') ?? '');
          const homeRef = refFromRecord(game, 'HomeTeam');
          home = !isNullRef(homeRef) && homeRef.row !== opponentRow;
          const status = String(val(game, 'GameStatus') ?? '');
          if (status === 'HomeWon' || status === 'AwayWon' || status === 'Tie') {
            const us = numOf(game, home ? 'HomeScore' : 'AwayScore');
            const them = numOf(game, home ? 'AwayScore' : 'HomeScore');
            const letter = us > them ? 'W' : us < them ? 'L' : 'T';
            const ot = val(game, 'IsOvertimeGame') === true ? ' (OT)' : '';
            result = `${letter} ${us}–${them}${ot}`;
          }
        }
        games.push({
          year,
          week,
          weekType,
          opponent: opponentRow !== null ? (ctx.nameByRow.get(opponentRow) ?? '') : '',
          opponentRow,
          home,
          result,
          lines: statLines(grec)
        });
      }
      games.sort((a, b) => b.year - a.year || b.week - a.week);
    }

    // Recruiting context, when this player is (or was) a board prospect.
    let recruit: PlayerProfile['recruit'] = null;
    try {
      const rt = mainTable(franchise, 'Recruit');
      await rt.readRecords([
        'Player',
        'NationalRank',
        'PositionRank',
        'StateRank',
        'RecruitStage',
        'TotalScholarshipOffers',
        'TopSchoolsList'
      ]);
      const playerTableId = pt.header?.tableId ?? -1;
      for (const rrec of rt.records as any[]) {
        if (rrec.isEmpty) continue;
        const pref = refFromRecord(rrec, 'Player');
        if (isNullRef(pref) || pref.tableId !== playerTableId || pref.row !== playerRow) continue;
        const stage = String(val(rrec, 'RecruitStage') ?? '');

        // The race: every pursuing school with its influence, best first.
        const pursuing: TargetSchool[] = [];
        const topRec = await recordAt(franchise, refFromRecord(rrec, 'TopSchoolsList'));
        for (const er of topRec ? refsFromArrayRecord(topRec).slice(0, 8) : []) {
          const entry = await recordAt(franchise, er);
          if (!entry) continue;
          const tid = Number(val(entry, 'TeamId'));
          const trow = ctx.rowByTeamIndex.get(tid);
          pursuing.push({
            name: (trow !== undefined ? ctx.nameByRow.get(trow) : null) ?? `Team ${tid}`,
            influence: numOf(entry, 'TeamInfluence'),
            isUser: userTeamRow !== null && trow === userTeamRow,
            delta: null
          });
        }
        pursuing.sort((a, b) => b.influence - a.influence);
        const committedTo = stage.includes('Committed') ? (pursuing[0]?.name ?? null) : null;

        const deal = String(val(rec, 'RecruitingDealbreaker') ?? '');
        recruit = {
          stars: STAR_MAP[String(val(rec, 'ProspectStarRating'))] ?? 0,
          nationalRank: numOf(rrec, 'NationalRank'),
          positionRank: numOf(rrec, 'PositionRank'),
          stateRank: numOf(rrec, 'StateRank'),
          stage,
          offers: numOf(rrec, 'TotalScholarshipOffers'),
          committedTo,
          dealbreaker: /^Invalid/.test(deal) ? '' : deal,
          pursuing
        };
        break;
      }
    } catch {
      // no recruit context outside recruiting season — the profile stands without it
    }

    const jersey = numOf(rec, 'JerseyNum');
    return {
      kind: 'player',
      row: playerRow,
      name: `${String(val(rec, 'FirstName') ?? '').trim()} ${String(val(rec, 'LastName') ?? '').trim()}`.trim(),
      position: String(val(rec, 'Position') ?? ''),
      archetype: String(val(rec, 'PlayerType') ?? ''),
      jersey: teamRow !== null && jersey >= 0 ? jersey : null,
      heightIn: numOf(rec, 'Height'),
      weightLb: numOf(rec, 'Weight') + 160,
      overall: numOf(rec, 'OverallRating'),
      devTrait: String(val(rec, 'TraitDevelopment') ?? ''),
      schoolYear: String(val(rec, 'SchoolYear') ?? ''),
      redshirt: String(val(rec, 'RedshirtStatus') ?? ''),
      homeTown: String(val(rec, 'PLYR_HOME_TOWN') ?? ''),
      homeState: String(val(rec, 'PLYR_HOME_STATE') ?? ''),
      teamRow,
      teamName: teamRow !== null ? (ctx.nameByRow.get(teamRow) ?? null) : null,
      injury: String(val(rec, 'InjuryStatus') ?? ''),
      yearsWithTeam: numOf(rec, 'PLYR_CONSECYEARSWITHTEAM'),
      awards: numOf(rec, 'YearlyAwardCount'),
      ratings: ratingsFromRecord(rec),
      ...abilitiesFromRecord(rec),
      career,
      seasons,
      games,
      stops: stops.length > 1 ? stops : [],
      recruit
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Coach

const PROFILE_COACH_FIELDS = [
  'FirstName',
  'LastName',
  'Position',
  'TeamIndex',
  'PrevTeamIndex',
  'PrevPosition',
  'Age',
  'AlmaMater',
  'CoachPrestige',
  'SeasonsWithTeam',
  'HomeState',
  'Personality',
  'CoachBackstory',
  'COACH_SPECIALTY',
  'PrimaryPipeline',
  'DominantArchetype',
  'COACH_WASPLAYER',
  'YearsCoaching',
  'ContractLength',
  'ContractYearsRemaining',
  'ContractStatus',
  'CurrentJobSecurityStatus',
  'CurrentJobSecurityPercentage',
  'CareerStats',
  'SeasonStats'
];

/**
 * A coach's résumé, newest stop first.
 *
 * Head-coach stints are rebuilt from the teams' own year-by-year history rows
 * — every TeamHistoricSeriesYear names its season's coach of record
 * ("S. Sarkisian"), so grouping one coach's rows into consecutive runs
 * recovers where they coached, for how long, and the record they posted.
 * That text key is only trusted when the abbreviated name is unique across
 * the whole Coach table (2 collisions among 494 names in the sample save; an
 * ambiguous coach simply gets no reconstructed stints, never wrong ones).
 *
 * The save's CoachTransactionHistoryEntry is no use for careers — it's a
 * rolling window covering only the most recent carousel. Coordinator stints
 * therefore carry dates only for the current job (SeasonsWithTeam) plus one
 * undated step back (PrevTeamIndex/PrevPosition).
 */
async function coachStops(
  franchise: any,
  ctx: Ctx,
  coachTable: any,
  rec: any,
  teamRow: number | null
): Promise<CoachStop[]> {
  const stops: CoachStop[] = [];
  const currentCalendar = ctx.calendarBase + ctx.yearIndex;
  const role = String(val(rec, 'Position') ?? '');
  const first = String(val(rec, 'FirstName') ?? '').trim();
  const last = String(val(rec, 'LastName') ?? '').trim();

  // The history rows abbreviate to "S. Sarkisian" — usable only when unique.
  const key = first && last ? `${first[0]}. ${last}` : '';
  let unique = false;
  if (key) {
    let n = 0;
    for (const c of coachTable.records as any[]) {
      if (c.isEmpty) continue;
      const f = String(val(c, 'FirstName') ?? '').trim();
      const l = String(val(c, 'LastName') ?? '').trim();
      if (f && l && `${f[0]}. ${l}` === key) n++;
    }
    unique = n === 1;
  }

  const years: { teamRow: number; year: number; w: number; l: number }[] = [];
  if (unique) {
    const teamRecs: any[] = ctx.teamTable.records ?? [];
    for (let trow = 0; trow < teamRecs.length; trow++) {
      const trec = teamRecs[trow];
      if (trec.isEmpty) continue;
      const seriesRec = await recordAt(franchise, refFromRecord(trec, 'TeamSeriesHistory'));
      if (!seriesRec) continue;
      for (const ref of refsFromArrayRecord(seriesRec)) {
        if (ref.tableId & 0x4000) continue; // asset-space padding
        const yrec = await recordAt(franchise, ref);
        if (!yrec) continue;
        const cn = String(val(yrec, 'CoachName') ?? '').trim();
        if (cn !== key && cn !== `${first} ${last}`) continue;
        const year = numOf(yrec, 'Year');
        if (year) years.push({ teamRow: trow, year, w: numOf(yrec, 'Wins'), l: numOf(yrec, 'Losses') });
      }
    }
  }
  years.sort((a, b) => a.year - b.year);
  for (const y of years) {
    const tail = stops[stops.length - 1];
    if (tail && tail.teamRow === y.teamRow && tail.toYear === y.year - 1) {
      tail.toYear = y.year;
      tail.wins = (tail.wins ?? 0) + y.w;
      tail.losses = (tail.losses ?? 0) + y.l;
    } else {
      stops.push({
        teamRow: y.teamRow,
        team: ctx.nameByRow.get(y.teamRow) ?? '',
        role: 'HeadCoach',
        fromYear: y.year,
        toYear: y.year,
        wins: y.w,
        losses: y.l,
        current: false
      });
    }
  }

  // The current job — either the tail of the reconstructed runs, or dated by
  // SeasonsWithTeam (completed seasons at this school; verified: Sarkisian 1
  // at Duke since 2033, Swinney 0 at Texas since 2034).
  if (teamRow !== null) {
    const tail = stops[stops.length - 1];
    if (role === 'HeadCoach' && tail && tail.teamRow === teamRow && tail.toYear === currentCalendar) {
      tail.current = true;
      tail.toYear = null;
    } else {
      stops.push({
        teamRow,
        team: ctx.nameByRow.get(teamRow) ?? '',
        role,
        fromYear: currentCalendar - numOf(rec, 'SeasonsWithTeam'),
        toYear: null,
        wins: null,
        losses: null,
        current: true
      });
    }
  }

  // One step back — but only when the reconstructed runs say nothing about
  // that school at all. A dated tenure beats an undated echo of the same stop
  // (PrevPosition can disagree with the year rows about the role there, and
  // the year rows are the season-by-season record).
  const prevRole = String(val(rec, 'PrevPosition') ?? '');
  const prevRow = ctx.rowByTeamIndex.get(Number(val(rec, 'PrevTeamIndex')));
  if (
    prevRow !== undefined &&
    prevRow !== teamRow &&
    prevRole &&
    !/^(Invalid_?|Count_?)/.test(prevRole) &&
    !stops.some((s) => s.teamRow === prevRow && !s.current)
  ) {
    stops.push({
      teamRow: prevRow,
      team: ctx.nameByRow.get(prevRow) ?? '',
      role: prevRole,
      fromYear: null,
      toYear: null,
      wins: null,
      losses: null,
      current: false
    });
  }

  // Newest first; undated stops sink to the bottom.
  stops.sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    return (b.toYear ?? b.fromYear ?? -1) - (a.toYear ?? a.fromYear ?? -1);
  });
  return stops;
}

export async function extractCoachProfile(franchise: any, coachRow: number): Promise<CoachProfile | null> {
  try {
    const ctx = await buildCtx(franchise);
    const ct = mainTable(franchise, 'Coach');
    if (!(await ensureCoachSchema(franchise, ct))) return null;
    await ct.readRecords(PROFILE_COACH_FIELDS);
    const rec = ct.records?.[coachRow];
    if (!rec || rec.isEmpty) return null;

    const teamIndex = Number(val(rec, 'TeamIndex'));
    const teamRow = ctx.rowByTeamIndex.get(teamIndex) ?? null;

    // AlmaMater is a school PresentationId. The schema declares the field's
    // range (1100–1300 today) and the library hands back the raw offset bits,
    // so rebase onto the declared minimum before joining Team.PresentationId.
    // Verified against the real coaches shipped in the save: Sarkisian→BYU,
    // Riley→Texas Tech, Brohm→Louisville, Smart→Georgia, Frost→Nebraska.
    let almaMaterRow: number | null = null;
    const amRaw = Number(val(rec, 'AlmaMater'));
    if (Number.isFinite(amRaw)) {
      const attr = (franchise.schemaList?.schemaMap?.['Coach']?.attributes ?? []).find(
        (a: any) => a.name === 'AlmaMater'
      );
      const min = Number(attr?.minValue ?? 0);
      const pid = amRaw >= min ? amRaw : min + amRaw;
      almaMaterRow = ctx.rowByPresentationId.get(pid) ?? null;
    }

    let career: CoachCareerStats | null = null;
    const crec = await recordAt(franchise, refFromRecord(rec, 'CareerStats'));
    if (crec) {
      career = {
        wins: numOf(crec, 'Wins'),
        losses: numOf(crec, 'Losses'),
        winsAtSchool: numOf(crec, 'WinsAtCurrentSchool'),
        lossesAtSchool: numOf(crec, 'LossesAtCurrentSchool'),
        bowlWins: numOf(crec, 'BowlWins'),
        bowlLosses: numOf(crec, 'BowlLosses'),
        playoffWins: numOf(crec, 'PlayoffWins'),
        playoffLosses: numOf(crec, 'PlayoffLosses'),
        confChampWins: numOf(crec, 'ConfChampWins'),
        confChampLosses: numOf(crec, 'ConfChampLosses'),
        natlChampWins: numOf(crec, 'NCWins'),
        natlChampLosses: numOf(crec, 'NCLosses'),
        rivalWins: numOf(crec, 'RivalWins'),
        rivalLosses: numOf(crec, 'RivalLosses'),
        top25Wins: numOf(crec, 'Top25Wins'),
        top25Losses: numOf(crec, 'Top25Losses'),
        draftPicks: numOf(crec, 'DraftPicks'),
        firstRoundPicks: numOf(crec, 'FirstRoundDraftPicks'),
        top5Classes: numOf(crec, 'Top5RecruitClasses'),
        timesFired: numOf(crec, 'TimesFired'),
        prestigeGains: numOf(crec, 'NumPrestigeIncreases')
      };
    }

    let seasonWins = 0;
    let seasonLosses = 0;
    const srec = await recordAt(franchise, refFromRecord(rec, 'SeasonStats'));
    if (srec) {
      seasonWins = numOf(srec, 'Wins');
      seasonLosses = numOf(srec, 'Losses');
    }

    const stops = await coachStops(franchise, ctx, ct, rec, teamRow);

    return {
      kind: 'coach',
      row: coachRow,
      name: `${String(val(rec, 'FirstName') ?? '').trim()} ${String(val(rec, 'LastName') ?? '').trim()}`.trim(),
      role: String(val(rec, 'Position') ?? ''),
      teamRow,
      teamName: teamRow !== null ? (ctx.nameByRow.get(teamRow) ?? null) : null,
      age: numOf(rec, 'Age'),
      yearsCoaching: numOf(rec, 'YearsCoaching'),
      seasonsWithTeam: numOf(rec, 'SeasonsWithTeam'),
      almaMater: almaMaterRow !== null ? (ctx.nameByRow.get(almaMaterRow) ?? null) : null,
      almaMaterRow,
      // HomeState is real for shipped coaches (Sarkisian→California,
      // Riley→Texas — verified) but generated and created coaches sit on the
      // enum's first value, Alabama (294 of 498 in the sample), and nothing in
      // the save separates a real Alabamian from the default. Suppress it:
      // better no state than a made-up one.
      homeState: (() => {
        const s = String(val(rec, 'HomeState') ?? '').trim();
        return s && s !== 'Alabama' ? s : null;
      })(),
      prestige: String(val(rec, 'CoachPrestige') ?? ''),
      personality: String(val(rec, 'Personality') ?? ''),
      backstory: String(val(rec, 'CoachBackstory') ?? ''),
      specialty: String(val(rec, 'COACH_SPECIALTY') ?? ''),
      pipeline: String(val(rec, 'PrimaryPipeline') ?? ''),
      archetype: String(val(rec, 'DominantArchetype') ?? ''),
      wasPlayer: val(rec, 'COACH_WASPLAYER') === true,
      offScheme: '',
      defScheme: '',
      contractYears: numOf(rec, 'ContractYearsRemaining'),
      contractLength: numOf(rec, 'ContractLength'),
      contractStatus: String(val(rec, 'ContractStatus') ?? ''),
      securityStatus: String(val(rec, 'CurrentJobSecurityStatus') ?? ''),
      securityPct: numOf(rec, 'CurrentJobSecurityPercentage'),
      seasonWins,
      seasonLosses,
      career,
      stops
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// School

/** Postseason result labels from a history row's four bowl-result slots, deepest first. */
const POSTSEASON_SLOTS: [string, string][] = [
  ['NationalBowlGameResult', 'Natl championship'],
  ['SemiFinalsBowlGameResult', 'CFP semifinal'],
  ['QuarterFinalsBowlGameResult', 'CFP quarterfinal'],
  ['FirstRoundCFPBowlGameResult', 'CFP first round']
];

/** Team stat panel for one season's TeamStats row; games from its own W-L-T. */
function teamStatLines(s: any): StatLine[] {
  const n = (f: string) => numOf(s, f);
  const g = n('WINS') + n('LOSSES') + n('TIES');
  if (!g) return [];
  const pg = (v: number) => (v / g).toFixed(1);
  const pctf = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');
  const margin = n('TAKEAWAYS') - n('GIVEAWAYS');
  const poss = n('POSSESSIONTIME') / g;
  return [
    {
      category: 'Offense',
      cells: [
        { label: 'YDS/G', value: pg(n('OFFYARDS')) },
        { label: 'PASS/G', value: pg(n('OFFPASSYARDS')) },
        { label: 'RUSH/G', value: pg(n('OFFRUSHYARDS')) },
        { label: '3RD DOWN', value: pctf(n('THIRDDOWNCONV'), n('THIRDDOWNS')) },
        { label: 'RZ TD', value: pctf(n('OFFREDZONETDS'), n('OFFREDZONES')) },
        { label: 'SACKS ALW', value: String(n('SACKSALLOWED')) }
      ]
    },
    {
      category: 'Defense',
      cells: [
        { label: 'YDS/G', value: pg(n('DEFPASSYARDS') + n('DEFRUSHYARDS')) },
        { label: 'PASS/G', value: pg(n('DEFPASSYARDS')) },
        { label: 'RUSH/G', value: pg(n('DEFRUSHYARDS')) },
        { label: 'SACKS', value: String(n('SACKS')) },
        { label: 'INT', value: String(n('DEFINTS')) },
        { label: 'RZ TD ALW', value: pctf(n('DEFREDZONETDS'), n('DEFREDZONES')) }
      ]
    },
    {
      category: 'Ball Control',
      cells: [
        { label: 'TO MARGIN', value: margin > 0 ? `+${margin}` : String(margin) },
        { label: 'TAKE', value: String(n('TAKEAWAYS')) },
        { label: 'GIVE', value: String(n('GIVEAWAYS')) },
        { label: 'POSS/G', value: `${Math.floor(poss / 60)}:${String(Math.round(poss % 60)).padStart(2, '0')}` },
        { label: 'PEN', value: String(n('PENALTIES')) },
        { label: 'PEN YDS', value: String(n('PENALTYYARDS')) }
      ]
    }
  ];
}

/** A banked league year reduced to one school's schedule rows. */
function scheduleFromBanked(games: GameInfo[], teamRow: number, ctx: Ctx): ScheduleGame[] {
  return games
    .filter((g) => g.homeRow === teamRow || g.awayRow === teamRow)
    .map((g) => {
      const home = g.homeRow === teamRow;
      const played = g.status !== 'unplayed';
      const us = home ? g.homeScore : g.awayScore;
      const them = home ? g.awayScore : g.homeScore;
      const opponentRow = home ? g.awayRow : g.homeRow;
      return {
        week: g.week,
        weekType: g.weekType,
        opponent: ctx.nameByRow.get(opponentRow) ?? 'TBD',
        opponentRow,
        home,
        neutral: false,
        outcome: !played ? '' : us > them ? 'W' : us < them ? 'L' : 'T',
        scoreUs: us,
        scoreThem: them,
        bowlName: g.bowlName ?? null,
        network: g.network,
        attendance: g.attendance
      };
    })
    .sort((a, b) => a.week - b.week);
}

function points(schedule: ScheduleGame[]): { pointsFor: number | null; pointsAgainst: number | null } {
  const played = schedule.filter((g) => g.outcome);
  if (!played.length) return { pointsFor: null, pointsAgainst: null };
  return {
    pointsFor: played.reduce((s, g) => s + g.scoreUs, 0),
    pointsAgainst: played.reduce((s, g) => s + g.scoreThem, 0)
  };
}

export async function extractSchoolProfile(
  franchise: any,
  teamRow: number,
  banked?: Map<number, GameInfo[]>
): Promise<SchoolProfile | null> {
  try {
    const ctx = await buildCtx(franchise);
    const rec = ctx.teamTable.records?.[teamRow];
    if (!rec || rec.isEmpty) return null;
    const longName = String(val(rec, 'LongName') ?? '').trim() || String(val(rec, 'DisplayName') ?? '').trim();

    // Schedule: this team's games in the current season, week order.
    const schedule: ScheduleGame[] = [];
    let wins = 0;
    let losses = 0;
    const sg = seasonGameTable(franchise);
    if (sg) {
      await sg.readRecords(SEASON_GAME_FIELDS);
      for (const g of sg.records as any[]) {
        if (g.isEmpty) continue;
        if (numOf(g, 'SeasonYear') !== ctx.yearIndex) continue;
        const homeRef = refFromRecord(g, 'HomeTeam');
        const awayRef = refFromRecord(g, 'AwayTeam');
        const isHome = !isNullRef(homeRef) && homeRef.tableId === ctx.teamTableId && homeRef.row === teamRow;
        const isAway = !isNullRef(awayRef) && awayRef.tableId === ctx.teamTableId && awayRef.row === teamRow;
        if (!isHome && !isAway) continue;
        const oppRef = isHome ? awayRef : homeRef;
        const opponentRow = !isNullRef(oppRef) && oppRef.tableId === ctx.teamTableId ? oppRef.row : null;
        const status = String(val(g, 'GameStatus') ?? '');
        const played = status === 'HomeWon' || status === 'AwayWon' || status === 'Tie';
        const us = numOf(g, isHome ? 'HomeScore' : 'AwayScore');
        const them = numOf(g, isHome ? 'AwayScore' : 'HomeScore');
        const outcome = !played ? '' : us > them ? 'W' : us < them ? 'L' : 'T';
        if (outcome === 'W') wins++;
        if (outcome === 'L') losses++;
        let bowlName: string | null = null;
        const bowlRec = await recordAt(franchise, refFromRecord(g, 'BowlGame'));
        if (bowlRec) bowlName = String(val(bowlRec, 'Name') ?? '').trim() || null;
        schedule.push({
          week: numOf(g, 'SeasonWeek'),
          weekType: String(val(g, 'SeasonWeekType') ?? ''),
          opponent: opponentRow !== null ? (ctx.nameByRow.get(opponentRow) ?? 'TBD') : 'TBD',
          opponentRow,
          home: isHome,
          neutral: false,
          outcome,
          scoreUs: us,
          scoreThem: them,
          bowlName,
          network: String(val(g, 'BroadcastNetwork') ?? ''),
          attendance: numOf(g, 'Attendance')
        });
      }
      schedule.sort((a, b) => a.week - b.week);
    }

    // Seasons, newest first, from the team's own series-history rows.
    const currentYear = ctx.calendarBase + ctx.yearIndex;
    const inSeason = ctx.stage !== 'OffSeason';
    const seasons: SchoolSeason[] = [];
    let conference = '';
    const seriesRec = await recordAt(franchise, refFromRecord(rec, 'TeamSeriesHistory'));
    if (seriesRec) {
      for (const ref of refsFromArrayRecord(seriesRec)) {
        // The array is padded with asset-space refs once real history runs out.
        if (ref.tableId & 0x4000) continue;
        const yrec = await recordAt(franchise, ref);
        if (!yrec) continue;
        const year = numOf(yrec, 'Year');
        if (!year) continue;
        let postseason = '';
        for (const [field, label] of POSTSEASON_SLOTS) {
          const v = String(val(yrec, field) ?? '');
          if (v && !/^Invalid_?$/.test(v)) {
            postseason = `${label} — ${v}`;
            break;
          }
        }
        if (!conference) conference = String(val(yrec, 'ConferenceName') ?? '').trim();
        seasons.push({
          year,
          current: inSeason && year === currentYear,
          wins: numOf(yrec, 'Wins'),
          losses: numOf(yrec, 'Losses'),
          ties: numOf(yrec, 'Ties'),
          conference: String(val(yrec, 'ConferenceName') ?? '').trim(),
          confWins: numOf(yrec, 'ConferenceWins'),
          confLosses: numOf(yrec, 'ConferenceLosses'),
          confStanding: numOf(yrec, 'FinalConferenceStanding'),
          finalRank: numOf(yrec, 'FinalMediaRank'),
          coachName: String(val(yrec, 'CoachName') ?? '').trim(),
          postseason,
          pointsFor: null,
          pointsAgainst: null,
          schedule: [],
          stats: []
        });
      }
      seasons.sort((a, b) => b.year - a.year);
    }

    // A brand-new dynasty can have games before its first history row exists.
    if (schedule.length && !seasons.some((s) => s.year === currentYear)) {
      seasons.unshift({
        year: currentYear,
        current: inSeason,
        wins: 0,
        losses: 0,
        ties: 0,
        conference,
        confWins: 0,
        confLosses: 0,
        confStanding: 0,
        finalRank: 0,
        coachName: '',
        postseason: '',
        pointsFor: null,
        pointsAgainst: null,
        schedule: [],
        stats: []
      });
    }

    // The live season gets its schedule from the save; every earlier year gets
    // whatever the app banked while that season was being played. A season's
    // history row also trails the schedule mid-week (it rolls up at week
    // advance; results land at the final whistle), so the schedule tally
    // overrides W-L wherever a schedule exists.
    for (const season of seasons) {
      if (season.year === currentYear) {
        season.schedule = schedule;
      } else {
        const yearGames = banked?.get(season.year);
        if (yearGames) season.schedule = scheduleFromBanked(yearGames, teamRow, ctx);
      }
      if (season.schedule.length) {
        const played = season.schedule.filter((g) => g.outcome);
        season.wins = played.filter((g) => g.outcome === 'W').length;
        season.losses = played.filter((g) => g.outcome === 'L').length;
        season.ties = played.filter((g) => g.outcome === 'T').length;
        Object.assign(season, points(season.schedule));
      }
      if (season.current) {
        // Standing/rank are still moving — show the live fields, not finals.
        season.confStanding = numOf(rec, 'CurSeasonConfStanding');
        season.finalRank = numOf(rec, 'MediaPoll_CurrentRank');
      }
    }

    // Team stat panels from the save's rolling five-season window (index i is
    // CurrentSeasonYear − i, newest first — same layout extract.ts verified).
    const windowRec = await recordAt(franchise, refFromRecord(rec, 'TeamSeasonStats'));
    if (windowRec) {
      const refs = refsFromArrayRecord(windowRec);
      for (let i = 0; i < refs.length; i++) {
        const srec = await recordAt(franchise, refs[i]);
        if (!srec) continue;
        const season = seasons.find((s) => s.year === currentYear - i);
        if (season) season.stats = teamStatLines(srec);
      }
    }

    // All-time ledger.
    let allTime: SchoolAllTime | null = null;
    const hrec = await recordAt(franchise, refFromRecord(rec, 'TeamHistoricalData'));
    if (hrec) {
      allTime = {
        wins: numOf(hrec, 'Wins'),
        losses: numOf(hrec, 'Losses'),
        ties: numOf(hrec, 'Ties'),
        homeWins: numOf(hrec, 'HomeWins'),
        homeLosses: numOf(hrec, 'HomeLosses'),
        bowlsMade: numOf(hrec, 'BowlsMade'),
        bowlsWon: numOf(hrec, 'BowlsWon'),
        cfpMade: numOf(hrec, 'CFPSMade'),
        cfpWon: numOf(hrec, 'CFPSWon'),
        ny6Made: numOf(hrec, 'NY6BowlsMade'),
        ny6Won: numOf(hrec, 'NY6BowlsWon'),
        natlChampsMade: numOf(hrec, 'NationalChampionshipsMade'),
        natlChampsWon: numOf(hrec, 'NationalChampionshipsWon'),
        rivalryWins: numOf(hrec, 'RivalryWins'),
        rivalryLosses: numOf(hrec, 'RivalryLosses'),
        heismans: numOf(hrec, 'HeismanWinners'),
        allAmericans: numOf(hrec, 'AllAmericans1stAnd2nd'),
        playersDrafted: numOf(hrec, 'PlayersDrafted'),
        weeksRankedTop25: numOf(hrec, 'WeeksRankedTop25InMediaPoll'),
        top5Classes: numOf(hrec, 'Top5RecruitingClasses'),
        top10Classes: numOf(hrec, 'Top10RecruitingClasses'),
        top25Classes: numOf(hrec, 'Top25RecruitingClasses'),
        longestHomeWinStreak: numOf(hrec, 'LongestHomeWinStreak'),
        currentHomeWinStreak: numOf(hrec, 'CurrentHomeWinStreak')
      };
    }

    // Staff, with coach rows so the modal can chain into coach profiles.
    const staff: SchoolProfile['staff'] = [];
    try {
      const ct = mainTable(franchise, 'Coach');
      if (await ensureCoachSchema(franchise, ct)) {
        await ct.readRecords(['FirstName', 'LastName', 'Position', 'TeamIndex']);
        const teamIndex = Number(val(rec, 'TeamIndex'));
        const ROLE: Record<string, string> = {
          HeadCoach: 'Head Coach',
          OffensiveCoordinator: 'Offensive Coordinator',
          DefensiveCoordinator: 'Defensive Coordinator'
        };
        (ct.records as any[]).forEach((c, row) => {
          if (c.isEmpty) return;
          if (Number(val(c, 'TeamIndex')) !== teamIndex) return;
          const role = ROLE[String(val(c, 'Position'))];
          if (!role) return;
          const name = `${String(val(c, 'FirstName') ?? '').trim()} ${String(val(c, 'LastName') ?? '').trim()}`.trim();
          if (name) staff.push({ role, name, row });
        });
        staff.sort((a, b) => Object.values(ROLE).indexOf(a.role) - Object.values(ROLE).indexOf(b.role));
      }
    } catch {
      // staff block is decoration
    }

    // Offensive/DefensiveRank are 0-based (exactly one team holds 0, and the
    // sample's rank-0 offense is also its yards-per-game leader); 255 is the
    // sentinel on FCS filler teams. Shift to the 1-based rank the game shows.
    const ladderRank = (field: string): number => {
      const raw = numOf(rec, field);
      return raw >= 0 && raw < 200 ? raw + 1 : 0;
    };

    const loc = SCHOOL_LOCATIONS[longName];
    const primary =
      rgbHex(val(rec, 'TEAM_BACKGROUNDCOLORR'), val(rec, 'TEAM_BACKGROUNDCOLORG'), val(rec, 'TEAM_BACKGROUNDCOLORB')) ??
      '#3f4a5a';
    const secondary = rgbHex(
      val(rec, 'TEAM_BACKGROUNDCOLORR2'),
      val(rec, 'TEAM_BACKGROUNDCOLORG2'),
      val(rec, 'TEAM_BACKGROUNDCOLORB2')
    );

    return {
      kind: 'school',
      row: teamRow,
      name: longName,
      nickName: String(val(rec, 'NickName') ?? '').trim(),
      city: loc?.[0] ?? null,
      state: loc?.[1] ?? null,
      founded: loc?.[2] ?? null,
      colors: { primary, secondary },
      conference,
      stadium: null,
      rank: numOf(rec, 'MediaPoll_CurrentRank'),
      prestigeRank: numOf(rec, 'PrestigeRank'),
      confStanding: numOf(rec, 'CurSeasonConfStanding'),
      offenseRank: ladderRank('OffensiveRank'),
      defenseRank: ladderRank('DefensiveRank'),
      staff,
      wins,
      losses,
      seasons,
      allTime
    };
  } catch {
    return null;
  }
}

function rgbHex(r: unknown, g: unknown, b: unknown): string | null {
  const nums = [r, g, b].map((x) => Number(x));
  if (nums.some((x) => !Number.isFinite(x) || x < 0 || x > 255)) return null;
  return '#' + nums.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
}
