import type {
  DepthChartSlot,
  RosterPlayer,
  SeasonState,
  Snapshot,
  TeamInfo
} from '../../shared/types.ts';
import { SCHOOL_LOCATIONS } from '../data/school-locations.ts';
import { ensureCoachSchema } from './coach-schema.ts';
import {
  isNullRef,
  mainTable,
  readTable,
  recordHasField,
  refFromRecord,
  refsFromArrayRecord,
  tableById,
  tableWithField,
  tablesByName,
  val
} from './franchise.ts';

const PLAYER_FIELDS = [
  'FirstName',
  'LastName',
  'JerseyNum',
  'Position',
  'OverallRating',
  'SchoolYear',
  'RedshirtStatus',
  'Height',
  'Weight',
  'SpeedRating',
  'TraitDevelopment',
  'PLYR_HOME_STATE',
  'TeamIndex',
  'ProspectStarRating',
  'PLYR_PORTRAIT',
  'HomePipeline',
  'PlayerType',
  'PLYR_HOME_TOWN'
];

function rgbHex(r: unknown, g: unknown, b: unknown): string | null {
  const nums = [r, g, b].map((n) => Number(n));
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
  return '#' + nums.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
}

interface StaffMember {
  name: string;
  row: number;
}

interface StaffEntry {
  hc: StaffMember | null;
  oc: StaffMember | null;
  dc: StaffMember | null;
  anyUser: boolean;
}

const COACH_FIELDS = [
  'FirstName',
  'LastName',
  'Position',
  'TeamIndex',
  'IsUserControlled',
  'Age',
  'CoachPrestige',
  'COACH_OFFTENDENCYRUNPASS',
  'COACH_DEFTENDENCYRUNPASS',
  'COACH_OFFTENDENCYAGGRESSCONSERV',
  'COACH_DEFTENDENCYAGGRESSCONSERV',
  'CareerStats'
];

const STAFF_ROLE: Record<string, keyof Pick<StaffEntry, 'hc' | 'oc' | 'dc'>> = {
  HeadCoach: 'hc',
  OffensiveCoordinator: 'oc',
  DefensiveCoordinator: 'dc'
};

/** Coaching staff keyed by the engine's TeamIndex (matches Team.TeamIndex, not table row). */
async function extractStaff(franchise: any): Promise<Map<number, StaffEntry>> {
  const map = new Map<number, StaffEntry>();
  try {
    const table = mainTable(franchise, 'Coach');
    if (!(await ensureCoachSchema(franchise, table))) return map;
    await table.readRecords(COACH_FIELDS);
    table.records.forEach((rec: any, row: number) => {
      if (rec.isEmpty) return;
      const role = STAFF_ROLE[String(val(rec, 'Position'))];
      if (!role) return;
      const teamIndex = Number(val(rec, 'TeamIndex'));
      if (!Number.isInteger(teamIndex) || teamIndex < 0 || teamIndex >= 250) return;
      const name = `${String(val(rec, 'FirstName') ?? '').trim()} ${String(val(rec, 'LastName') ?? '').trim()}`.trim();
      if (!name) return;
      const entry = map.get(teamIndex) ?? { hc: null, oc: null, dc: null, anyUser: false };
      entry[role] = { name, row };
      if (val(rec, 'IsUserControlled') === true) entry.anyUser = true;
      map.set(teamIndex, entry);
    });
  } catch {
    // Coach data is an enhancement — never fail the snapshot over it.
  }
  return map;
}

async function staffTendencies(
  franchise: any,
  staff: StaffEntry | undefined
): Promise<import('../../shared/types.ts').StaffTendency[]> {
  if (!staff) return [];
  let coachTable: any;
  try {
    coachTable = mainTable(franchise, 'Coach');
  } catch {
    return [];
  }
  const num = (rec: any, k: string): number | null => {
    const v = Number(val(rec, k));
    return Number.isFinite(v) ? v : null;
  };
  const out: import('../../shared/types.ts').StaffTendency[] = [];
  const roles: ['HC' | 'OC' | 'DC', StaffMember | null][] = [
    ['HC', staff.hc],
    ['OC', staff.oc],
    ['DC', staff.dc]
  ];
  for (const [role, member] of roles) {
    if (!member) continue;
    const rec = coachTable.records?.[member.row];
    if (!rec || rec.isEmpty) continue;

    let careerWins: number | null = null;
    let careerLosses: number | null = null;
    try {
      const careerRef = refFromRecord(rec, 'CareerStats');
      if (!isNullRef(careerRef)) {
        const careerTable = await tableById(franchise, careerRef.tableId);
        const careerRec = careerTable?.records?.[careerRef.row];
        if (careerRec) {
          careerWins = num(careerRec, 'Wins');
          careerLosses = num(careerRec, 'Losses');
        }
      }
    } catch {
      // career record is decoration; leave nulls
    }

    out.push({
      role,
      name: member.name,
      prestige: String(val(rec, 'CoachPrestige') ?? '') || null,
      careerWins,
      careerLosses,
      offRunPass: num(rec, 'COACH_OFFTENDENCYRUNPASS'),
      defRunPass: num(rec, 'COACH_DEFTENDENCYRUNPASS'),
      offAggression: num(rec, 'COACH_OFFTENDENCYAGGRESSCONSERV'),
      defAggression: num(rec, 'COACH_DEFTENDENCYAGGRESSCONSERV')
    });
  }
  return out;
}

function teamFromRecord(rec: any, row: number): TeamInfo | null {
  const longName = String(val(rec, 'LongName') ?? '').trim();
  const displayName = String(val(rec, 'DisplayName') ?? '').trim();
  if (!longName && !displayName) return null;
  const primary =
    rgbHex(val(rec, 'TEAM_BACKGROUNDCOLORR'), val(rec, 'TEAM_BACKGROUNDCOLORG'), val(rec, 'TEAM_BACKGROUNDCOLORB')) ??
    '#3f4a5a';
  const secondary = rgbHex(
    val(rec, 'TEAM_BACKGROUNDCOLORR2'),
    val(rec, 'TEAM_BACKGROUNDCOLORG2'),
    val(rec, 'TEAM_BACKGROUNDCOLORB2')
  );
  return {
    row,
    displayName,
    longName: longName || displayName,
    nickName: String(val(rec, 'NickName') ?? '').trim(),
    shortName: String(val(rec, 'ShortName') ?? '').trim(),
    colors: { primary, secondary },
    offScheme: String(val(rec, 'CurrentOffensiveScheme') ?? ''),
    defScheme: String(val(rec, 'CurrentDefensiveScheme') ?? ''),
    offPlaybook: String(val(rec, 'DefaultOffensiveScheme') ?? ''),
    defPlaybook: String(val(rec, 'DefaultDefensiveScheme') ?? ''),
    headCoach: null,
    offCoordinator: null,
    defCoordinator: null,
    city: SCHOOL_LOCATIONS[longName || displayName]?.[0] ?? null,
    state: SCHOOL_LOCATIONS[longName || displayName]?.[1] ?? null,
    founded: SCHOOL_LOCATIONS[longName || displayName]?.[2] ?? null,
    isUserTeam: false,
    rank: Number(val(rec, 'MediaPoll_CurrentRank') ?? 0),
    lastWeekRank: Number(val(rec, 'MediaPoll_LastWeeksRank') ?? 0)
  };
}

/** All current-season games (played + scheduled) from the main SeasonGame table. */
async function extractGames(
  franchise: any,
  teamTableId: number,
  currentYearIndex: number
): Promise<import('../../shared/types.ts').GameInfo[]> {
  const games: import('../../shared/types.ts').GameInfo[] = [];
  try {
    const candidates = tablesByName(franchise, 'SeasonGame').filter(
      (t: any) => (t.header?.recordCapacity ?? 0) > 100
    );
    if (!candidates.length) return games;
    const table = candidates.sort(
      (a: any, b: any) => b.header.recordCapacity - a.header.recordCapacity
    )[0];
    await table.readRecords([
      'HomeTeam',
      'AwayTeam',
      'HomeScore',
      'AwayScore',
      'GameStatus',
      'SeasonWeek',
      'SeasonWeekType',
      'SeasonYear',
      'IsGameOfTheWeek',
      'IsOvertimeGame',
      'BroadcastNetwork',
      'Attendance'
    ]);
    for (const rec of table.records) {
      if (rec.isEmpty) continue;
      if (Number(val(rec, 'SeasonYear')) !== currentYearIndex) continue;
      const status = String(val(rec, 'GameStatus'));
      if (status === 'Unscheduled' || status === 'Invalid_') continue;
      const home = refFromRecord(rec, 'HomeTeam');
      const away = refFromRecord(rec, 'AwayTeam');
      if (isNullRef(home) || isNullRef(away) || home.tableId !== teamTableId || away.tableId !== teamTableId) continue;
      games.push({
        week: Number(val(rec, 'SeasonWeek') ?? 0),
        weekType: String(val(rec, 'SeasonWeekType') ?? ''),
        homeRow: home.row,
        awayRow: away.row,
        homeScore: Number(val(rec, 'HomeScore') ?? 0),
        awayScore: Number(val(rec, 'AwayScore') ?? 0),
        status: status === 'HomeWon' ? 'home' : status === 'AwayWon' ? 'away' : 'unplayed',
        gotw: val(rec, 'IsGameOfTheWeek') === true,
        overtime: val(rec, 'IsOvertimeGame') === true,
        network: String(val(rec, 'BroadcastNetwork') ?? ''),
        attendance: Number(val(rec, 'Attendance') ?? 0)
      });
    }
  } catch {
    // games power media + context; never fail the snapshot
  }
  return games;
}

function playerFromRecord(rec: any, row: number): RosterPlayer {
  const rawWeight = Number(val(rec, 'Weight') ?? 0);
  return {
    row,
    firstName: String(val(rec, 'FirstName') ?? ''),
    lastName: String(val(rec, 'LastName') ?? ''),
    jersey: Number(val(rec, 'JerseyNum') ?? 0),
    position: String(val(rec, 'Position') ?? ''),
    overall: Number(val(rec, 'OverallRating') ?? 0),
    schoolYear: String(val(rec, 'SchoolYear') ?? ''),
    redshirt: String(val(rec, 'RedshirtStatus') ?? ''),
    heightIn: Number(val(rec, 'Height') ?? 0),
    // The engine stores weight as an offset from 160 lbs (Madden lineage).
    weightLb: rawWeight + 160,
    speed: Number(val(rec, 'SpeedRating') ?? 0),
    devTrait: String(val(rec, 'TraitDevelopment') ?? ''),
    archetype: String(val(rec, 'PlayerType') ?? ''),
    homeState: String(val(rec, 'PLYR_HOME_STATE') ?? ''),
    homeTown: String(val(rec, 'PLYR_HOME_TOWN') ?? ''),
    portraitId: Number(val(rec, 'PLYR_PORTRAIT') ?? 0)
  };
}

function extractBudget(teamRec: any): import('../../shared/types.ts').BudgetInfo | null {
  const n = (k: string) => Number(val(teamRec, k) ?? 0);
  const g = (k: string) => {
    const v = String(val(teamRec, k) ?? '');
    return v ? v.replace('plus', '+').replace('minus', '−') : null;
  };
  const total = n('ProgramPointBudget');
  if (!total) return null;
  return {
    total,
    remaining: n('RemainingProgramPoints'),
    rollover: n('RolloverProgramPoints'),
    overallGrade: g('ProgramPointsBudgetGrade'),
    pillars: [
      { label: 'Brand Exposure', points: n('BrandExposureProgramPoints'), grade: g('ProgramPointsBrandExposureGrade') },
      { label: 'Program Traditions', points: n('ProgramTraditionsProgramPoints'), grade: g('ProgramPointsProgramTraditionsGrade') },
      { label: 'Stadium Atmosphere', points: n('StadiumAtmosphereProgramPoints'), grade: g('ProgramPointsStadiumAtmosphereGrade') },
      { label: 'Conference Prestige', points: n('ConferencePrestigeProgramPoints'), grade: g('ProgramPointsConferencePrestigeGrade') },
      { label: 'Contract Goals', points: n('CoachContractGoalsProgramPoints'), grade: null },
      { label: 'Rollover', points: n('RolloverProgramPoints'), grade: null }
    ].filter((p) => p.points > 0),
    spending: [
      { label: 'NIL', points: n('NILProgramPointsSpent') },
      { label: 'Support Staff', points: n('StaffProgramPointsSpent') },
      { label: 'Recruiting', points: n('RecruitProgramPointsSpent') },
      { label: 'Facilities', points: n('FacilitiesProgramPointsSpent') }
    ].filter((s) => s.points > 0),
    staffWeekly: {
      hc: n('HeadCoachProgramPointBudget'),
      oc: n('OffensiveCoordinatorPointBudget'),
      dc: n('DefensiveCoordinatorPointBudget')
    }
  };
}

const SPLIT_FIELDS: Record<string, keyof Omit<import('../../shared/types.ts').SeasonSplits, 'scope' | 'games'>> = {
  WINS: 'wins',
  LOSSES: 'losses',
  RUSHATTEMPTS: 'rushAtt',
  PASSATTEMPTS: 'passAtt',
  OFFRUSHYARDS: 'rushYds',
  OFFPASSYARDS: 'passYds',
  THIRDDOWNS: 'thirdDowns',
  THIRDDOWNCONV: 'thirdConv',
  FOURTHDOWNS: 'fourthDowns',
  FOURTHDOWNCONV: 'fourthConv',
  OFFREDZONES: 'redzoneTrips',
  OFFREDZONETDS: 'redzoneTds',
  OFFREDZONEFGS: 'redzoneFgs',
  SACKS: 'sacks',
  TAKEAWAYS: 'takeaways',
  GIVEAWAYS: 'giveaways',
  DEFRUSHYARDS: 'defRushYds',
  DEFPASSYARDS: 'defPassYds'
};

async function extractSplits(franchise: any, teamRec: any): Promise<import('../../shared/types.ts').SeasonSplits | null> {
  const sumRows = async (arrayRef: ReturnType<typeof refFromRecord>, onlyLast: boolean) => {
    if (isNullRef(arrayRef)) return null;
    const arrTable = await tableById(franchise, arrayRef.tableId);
    const arrRec = arrTable?.records?.[arrayRef.row];
    if (!arrRec) return null;
    let refs = refsFromArrayRecord(arrRec);
    if (!refs.length) return null;
    if (onlyLast) refs = [refs[refs.length - 1]];
    const acc: Record<string, number> = {};
    let counted = 0;
    for (const r of refs) {
      const statTable = await tableById(franchise, r.tableId);
      const rec = statTable?.records?.[r.row];
      if (!rec) continue;
      counted++;
      for (const [field, key] of Object.entries(SPLIT_FIELDS)) {
        acc[key] = (acc[key] ?? 0) + Number(val(rec, field) ?? 0);
      }
    }
    return counted ? { acc, counted } : null;
  };

  try {
    const current = await sumRows(refFromRecord(teamRec, 'TeamGameStatsRegSeason'), false);
    if (current) {
      return { scope: 'current', games: current.counted, ...(current.acc as any) };
    }
    const last = await sumRows(refFromRecord(teamRec, 'TeamSeasonStats'), true);
    if (last) {
      const games = (last.acc['wins'] ?? 0) + (last.acc['losses'] ?? 0);
      return { scope: 'lastSeason', games, ...(last.acc as any) };
    }
  } catch {
    // stats are an enhancement
  }
  return null;
}

const STAR_MAP: Record<string, number> = {
  FIVE_STAR: 5,
  FOUR_STAR: 4,
  THREE_STAR: 3,
  TWO_STAR: 2,
  ONE_STAR: 1
};

const RECRUIT_FIELDS = [
  'Player',
  'TopSchoolsList',
  'QualityModifier',
  'RecruitStage',
  'NationalRank',
  'StateRank',
  'PositionRank',
  'TotalScholarshipOffers',
  'Class'
];

async function extractBoard(
  franchise: any,
  teamRec: any,
  playerTable: any,
  teamIndexToName: Map<number, string>,
  ownTeamIndex: number
): Promise<{ info: import('../../shared/types.ts').BoardInfo; recruitRows: Set<number> } | null> {
  const recruitRows = new Set<number>();
  try {
    const boardRef = refFromRecord(teamRec, 'RecruitingBoard');
    if (isNullRef(boardRef)) return null;
    const boardTable = await tableById(franchise, boardRef.tableId);
    const boardRec = boardTable?.records?.[boardRef.row];
    if (!boardRec) return null;

    const recruitTable = await readTable(mainTable(franchise, 'Recruit'), RECRUIT_FIELDS);
    const playerTableId = playerTable.header?.tableId ?? -1;

    const listRef = refFromRecord(boardRec, 'Recruits');
    const targets: import('../../shared/types.ts').RecruitTargetEntry[] = [];
    if (!isNullRef(listRef)) {
      const listTable = await tableById(franchise, listRef.tableId);
      const listRec = listTable?.records?.[listRef.row];
      const targetRefs = listRec ? refsFromArrayRecord(listRec) : [];
      const targetTables = new Map<number, any>();
      for (const tr of targetRefs) {
        if (!targetTables.has(tr.tableId)) targetTables.set(tr.tableId, await tableById(franchise, tr.tableId));
        const targetRec = targetTables.get(tr.tableId)?.records?.[tr.row];
        if (!targetRec || targetRec.isEmpty) continue;
        const recruitRef = refFromRecord(targetRec, 'Recruit');
        const recruitRec = !isNullRef(recruitRef) ? recruitTable.records?.[recruitRef.row] : null;
        if (!recruitRec) continue;
        recruitRows.add(recruitRef!.row);
        const playerRef = refFromRecord(recruitRec, 'Player');
        const playerRec =
          !isNullRef(playerRef) && playerRef.tableId === playerTableId
            ? playerTable.records?.[playerRef.row]
            : null;
        if (!playerRec) continue;

        const pursuing: import('../../shared/types.ts').TargetSchool[] = [];
        const topRef = refFromRecord(recruitRec, 'TopSchoolsList');
        if (!isNullRef(topRef)) {
          const topTable = await tableById(franchise, topRef.tableId);
          const topRec = topTable?.records?.[topRef.row];
          const entryRefs = topRec ? refsFromArrayRecord(topRec) : [];
          for (const er of entryRefs.slice(0, 8)) {
            const entryTable = await tableById(franchise, er.tableId);
            const entry = entryTable?.records?.[er.row];
            if (!entry) continue;
            const tid = Number(val(entry, 'TeamId'));
            pursuing.push({
              name: teamIndexToName.get(tid) ?? `Team ${tid}`,
              influence: Number(val(entry, 'TeamInfluence') ?? 0),
              isUser: tid === ownTeamIndex
            });
          }
          pursuing.sort((a, b) => b.influence - a.influence);
        }

        targets.push({
          name: `${String(val(playerRec, 'FirstName') ?? '')} ${String(val(playerRec, 'LastName') ?? '')}`.trim(),
          position: String(val(playerRec, 'Position') ?? ''),
          stars: STAR_MAP[String(val(playerRec, 'ProspectStarRating'))] ?? 0,
          quality: String(val(recruitRec, 'QualityModifier') ?? 'NORMAL'),
          stage: String(val(recruitRec, 'RecruitStage') ?? ''),
          scholarship: String(val(targetRec, 'ScholarshipStatus') ?? ''),
          committedWeek: Number(val(targetRec, 'CommittedWeekNumber') ?? 0),
          nilOffer: Number(val(targetRec, 'CurrentNILOffer') ?? 0),
          nilExpectation: Number(val(targetRec, 'NILExpectation') ?? 0),
          influence: Number(val(targetRec, 'ProspectInfluenceTotal') ?? 0),
          hoursSpent: Number(val(targetRec, 'ProspectHoursSpentCurrent') ?? 0),
          isFavorite: val(targetRec, 'IsFavorite') === true,
          hasVisit: !isNullRef(refFromRecord(targetRec, 'ScheduledVisit')),
          nationalRank: Number(val(recruitRec, 'NationalRank') ?? 0),
          stateRank: Number(val(recruitRec, 'StateRank') ?? 0),
          positionRank: Number(val(recruitRec, 'PositionRank') ?? 0),
          offers: Number(val(recruitRec, 'TotalScholarshipOffers') ?? 0),
          homeState: String(val(playerRec, 'PLYR_HOME_STATE') ?? ''),
          pursuing
        });
      }
    }
    targets.sort((a, b) => b.stars - a.stars || b.influence - a.influence);

    return {
      info: {
        hoursTotal: Number(val(boardRec, 'RecruitingHoursTotal') ?? 0),
        hoursAssigned: Number(val(boardRec, 'RecruitingHoursAssigned') ?? 0),
        targets
      },
      recruitRows
    };
  } catch {
    return null;
  }
}

const PIPELINE_TIER: Record<string, number> = {
  Unrecognized: 0,
  NicheInterest: 1,
  Respected: 2,
  Popular: 3,
  HouseholdName: 4,
  CulturalPillar: 5
};

const GRADE_NUM: Record<string, number> = {
  F: 0,
  Dminus: 1,
  D: 2,
  Dplus: 3,
  Cminus: 4,
  C: 5,
  Cplus: 6,
  Bminus: 7,
  B: 8,
  Bplus: 9,
  Aminus: 10,
  A: 11,
  Aplus: 12
};

function gradePretty(raw: string): string {
  return raw.replace('plus', '+').replace('minus', '−');
}

function wordSpace(raw: string): string {
  return raw.replace(/([a-z])([A-Z])/g, '$1 $2');
}

const PRO_POTENTIAL_GROUP: Record<string, string> = {
  QB: 'QB',
  HB: 'RB',
  FB: 'RB',
  WR: 'WR',
  TE: 'TE',
  LT: 'OL',
  LG: 'OL',
  C: 'OL',
  RG: 'OL',
  RT: 'OL',
  LE: 'DL',
  RE: 'DL',
  DT: 'DL',
  NT: 'DL',
  LOLB: 'LB',
  MLB: 'LB',
  ROLB: 'LB',
  CB: 'DB',
  FS: 'DB',
  SS: 'DB',
  K: 'K',
  P: 'P'
};

interface SchoolAssets {
  pipelines: Map<string, { level: string; tier: number; value: number }>;
  proGrades: Map<string, number>;
  state: string | null;
}

/** Pipeline strengths + report-card grades for every school, keyed by TeamIndex. */
async function extractSchoolAssets(
  franchise: any,
  teamTable: any,
  rowToTeamIndex: Map<number, number>
): Promise<Map<number, SchoolAssets>> {
  const out = new Map<number, SchoolAssets>();
  for (const [row, teamIndex] of rowToTeamIndex) {
    const rec = teamTable.records[row];
    if (!rec || rec.isEmpty) continue;
    const assets: SchoolAssets = {
      pipelines: new Map(),
      proGrades: new Map(),
      state: SCHOOL_LOCATIONS[String(val(rec, 'LongName') ?? '')]?.[1] ?? null
    };
    try {
      const listRef = refFromRecord(rec, 'SchoolPipelineInfluenceList');
      if (!isNullRef(listRef)) {
        const arrTable = await tableById(franchise, listRef.tableId);
        const arrRec = arrTable?.records?.[listRef.row];
        for (const er of arrRec ? refsFromArrayRecord(arrRec) : []) {
          const entryTable = await tableById(franchise, er.tableId);
          const entry = entryTable?.records?.[er.row];
          if (!entry) continue;
          const pipeline = String(val(entry, 'Pipeline') ?? '');
          const level = String(val(entry, 'InfluenceLevel') ?? '');
          if (!pipeline) continue;
          assets.pipelines.set(pipeline, {
            level,
            tier: PIPELINE_TIER[level] ?? 0,
            value: Number(val(entry, 'InfluenceValue') ?? 0)
          });
        }
      }
      const trackRef = refFromRecord(rec, 'MySchoolTrackingTable');
      if (!isNullRef(trackRef)) {
        const trackTable = await tableById(franchise, trackRef.tableId);
        const track = trackTable?.records?.[trackRef.row];
        if (track) {
          for (const group of ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K', 'P']) {
            const g = String(val(track, `ProPotentialGrade${group}`) ?? '');
            if (g in GRADE_NUM) assets.proGrades.set(group, GRADE_NUM[g]);
          }
        }
      }
    } catch {
      // per-school assets are best-effort
    }
    out.set(teamIndex, assets);
  }
  return out;
}

const REPORT_CARD_FIELDS: [string, string][] = [
  ['AcademicPrestigeGrade', 'Academic Prestige'],
  ['AthleticFacilitiesGrade', 'Athletic Facilities'],
  ['BrandExposureGrade', 'Brand Exposure'],
  ['CampusLifestyleGrade', 'Campus Lifestyle'],
  ['ChampionshipContenderGrade', 'Championship Contender'],
  ['CoachPrestigeGrade', 'Coach Prestige'],
  ['CoachStabilityGrade', 'Coach Stability'],
  ['ConferencePrestigeGrade', 'Conference Prestige'],
  ['ProgramTraditionGrade', 'Program Tradition'],
  ['StadiumAtmosphereGrade', 'Stadium Atmosphere']
];

async function extractRecruiting(
  franchise: any,
  teamRec: any,
  playerTable: any,
  teamIndexToName: Map<number, string>,
  schoolAssets: Map<number, SchoolAssets>,
  ownTeamIndex: number,
  boardRecruitRows: Set<number>,
  seasonYear: number
): Promise<import('../../shared/types.ts').RecruitingData | null> {
  try {
    const recruitTable = await readTable(mainTable(franchise, 'Recruit'), RECRUIT_FIELDS);
    const playerTableId = playerTable.header?.tableId ?? -1;
    const own = schoolAssets.get(ownTeamIndex);

    // User-facing report card + pipelines
    let reportCard: import('../../shared/types.ts').SchoolGrade[] = [];
    let proPotential: import('../../shared/types.ts').SchoolGrade[] = [];
    const trackRef = refFromRecord(teamRec, 'MySchoolTrackingTable');
    if (!isNullRef(trackRef)) {
      const trackTable = await tableById(franchise, trackRef.tableId);
      const track = trackTable?.records?.[trackRef.row];
      if (track) {
        reportCard = REPORT_CARD_FIELDS.map(([field, label]) => ({
          label,
          grade: gradePretty(String(val(track, field) ?? ''))
        })).filter((g) => g.grade);
        proPotential = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K', 'P'].map((group) => ({
          label: group,
          grade: gradePretty(String(val(track, `ProPotentialGrade${group}`) ?? ''))
        })).filter((g) => g.grade);
      }
    }
    const pipelines: import('../../shared/types.ts').PipelineStrength[] = [...(own?.pipelines ?? new Map()).entries()]
      .map(([pipeline, p]) => ({
        pipeline,
        label: wordSpace(pipeline),
        level: wordSpace(p.level),
        tier: p.tier,
        value: p.value
      }))
      .sort((a, b) => b.tier - a.tier || b.value - a.value);

    // Pre-read the pursuit tables once (they're shared across recruits).
    const recruits: import('../../shared/types.ts').ClassRecruit[] = [];
    for (let row = 0; row < recruitTable.records.length; row++) {
      const rec = recruitTable.records[row];
      if (rec.isEmpty) continue;
      const playerRef = refFromRecord(rec, 'Player');
      const p = !isNullRef(playerRef) && playerRef.tableId === playerTableId ? playerTable.records[playerRef.row] : null;
      if (!p || p.isEmpty) continue;

      const race: import('../../shared/types.ts').TargetSchool[] = [];
      let userInfluence = 0;
      const rivalIndexes: number[] = [];
      const topRef = refFromRecord(rec, 'TopSchoolsList');
      if (!isNullRef(topRef)) {
        const topTable = await tableById(franchise, topRef.tableId);
        const topRec = topTable?.records?.[topRef.row];
        for (const er of topRec ? refsFromArrayRecord(topRec) : []) {
          const entryTable = await tableById(franchise, er.tableId);
          const entry = entryTable?.records?.[er.row];
          if (!entry) continue;
          const tid = Number(val(entry, 'TeamId'));
          const influence = Number(val(entry, 'TeamInfluence') ?? 0);
          if (tid === ownTeamIndex) userInfluence = influence;
          else rivalIndexes.push(tid);
          race.push({
            name: teamIndexToName.get(tid) ?? `Team ${tid}`,
            influence,
            isUser: tid === ownTeamIndex
          });
        }
        race.sort((a, b) => b.influence - a.influence);
      }

      const stage = String(val(rec, 'RecruitStage') ?? '');
      const committed = stage.includes('Committed');
      const pipeline = String(val(p, 'HomePipeline') ?? '');
      const homeState = String(val(p, 'PLYR_HOME_STATE') ?? '');
      const position = String(val(p, 'Position') ?? '');

      const edges: string[] = [];
      if (!committed && own) {
        const userTier = own.pipelines.get(pipeline)?.tier ?? 0;
        const rivalTier = Math.max(
          0,
          ...rivalIndexes.map((ti) => schoolAssets.get(ti)?.pipelines.get(pipeline)?.tier ?? 0)
        );
        if (userTier >= 3 && userTier > rivalTier) edges.push('Pipeline');

        const group = PRO_POTENTIAL_GROUP[position];
        if (group) {
          const userGrade = own.proGrades.get(group) ?? -1;
          const rivalGrade = Math.max(
            -1,
            ...rivalIndexes.map((ti) => schoolAssets.get(ti)?.proGrades.get(group) ?? -1)
          );
          // "Distinct" = a full letter grade over a credible rival — beating a
          // scrub race on grades isn't an insight worth flagging.
          if (rivalGrade >= GRADE_NUM['B'] && userGrade - rivalGrade >= 3) edges.push('Pro Potential');
        }

        if (own.state && wordSpace(homeState) === own.state) edges.push('Home State');
        if (race[0]?.isUser && userInfluence > 0) edges.push('Leading');
      }

      const classRaw = String(val(rec, 'Class') ?? '');
      recruits.push({
        row,
        name: `${String(val(p, 'FirstName') ?? '')} ${String(val(p, 'LastName') ?? '')}`.trim(),
        position,
        stars: STAR_MAP[String(val(p, 'ProspectStarRating'))] ?? 0,
        quality: String(val(rec, 'QualityModifier') ?? 'NORMAL'),
        stage,
        classType: classRaw.startsWith('JuniorCollege') ? 'JUCO' : 'HS',
        devTrait: String(val(p, 'TraitDevelopment') ?? ''),
        homeState,
        pipeline,
        heightIn: Number(val(p, 'Height') ?? 0),
        weightLb: Number(val(p, 'Weight') ?? 0) + 160,
        nationalRank: Number(val(rec, 'NationalRank') ?? 0),
        stateRank: Number(val(rec, 'StateRank') ?? 0),
        positionRank: Number(val(rec, 'PositionRank') ?? 0),
        offers: Number(val(rec, 'TotalScholarshipOffers') ?? 0),
        race: race.slice(0, 3),
        userInfluence,
        onBoard: boardRecruitRows.has(row),
        committedTo: committed ? (race[0]?.name ?? null) : null,
        edges
      });
    }

    recruits.sort((a, b) => b.stars - a.stars || (a.nationalRank || 99999) - (b.nationalRank || 99999));

    return {
      classYear: seasonYear + 1,
      total: recruits.length,
      pipelines,
      reportCard,
      proPotential,
      recruits
    };
  } catch {
    return null;
  }
}

async function extractSeason(franchise: any): Promise<SeasonState | null> {
  const t = await tableWithField(franchise, 'SeasonInfo', 'CurrentSeasonYear');
  const rec = t?.records?.find((r: any) => !r.isEmpty);
  if (!rec) return null;
  return {
    seasonYear: Number(val(rec, 'CurrentSeasonYear') ?? 0),
    dynastyYear: Number(val(rec, 'CurrentYear') ?? 0) + 1,
    week: Number(val(rec, 'CurrentWeek') ?? 0),
    weekType: String(val(rec, 'CurrentWeekType') ?? '')
  };
}

/**
 * Resolve depth chart slot refs to ordered Player rows. Slots point at an array-table
 * record; entries are either Player refs directly or entry records holding a Player ref.
 */
async function resolveDepthSlot(franchise: any, slotRef: any, playerTableId: number): Promise<number[]> {
  if (isNullRef(slotRef)) return [];
  const arrTable = await tableById(franchise, slotRef.tableId);
  const arrRec = arrTable?.records?.[slotRef.row];
  if (!arrRec) return [];
  const refs = refsFromArrayRecord(arrRec);
  const rows: number[] = [];
  for (const r of refs) {
    if (r.tableId === playerTableId) {
      rows.push(r.row);
      continue;
    }
    const entryTable = await tableById(franchise, r.tableId);
    const entryRec = entryTable?.records?.[r.row];
    if (!entryRec) continue;
    const playerRef = refFromRecord(entryRec, 'Player');
    if (playerRef && playerRef.tableId === playerTableId) rows.push(playerRef.row);
  }
  return rows;
}

export async function extractSnapshot(
  franchise: any,
  opts: { schoolTeamRow: number | null; fileName: string }
): Promise<Snapshot> {
  const teamTable = await readTable(mainTable(franchise, 'Team'));
  const playerTable = await readTable(mainTable(franchise, 'Player'), PLAYER_FIELDS);
  const playerTableId = playerTable.header?.tableId ?? -1;

  const staffByTeamIndex = await extractStaff(franchise);

  const teams: TeamInfo[] = [];
  const teamIndexToName = new Map<number, string>();
  const rowToTeamIndex = new Map<number, number>();
  teamTable.records.forEach((rec: any, row: number) => {
    if (rec.isEmpty) return;
    const info = teamFromRecord(rec, row);
    if (!info) return;
    const teamIndex = recordHasField(rec, 'TeamIndex') ? Number(val(rec, 'TeamIndex')) : row;
    teamIndexToName.set(teamIndex, info.longName);
    rowToTeamIndex.set(row, teamIndex);
    const staff = staffByTeamIndex.get(teamIndex);
    if (staff) {
      info.headCoach = staff.hc?.name ?? null;
      info.offCoordinator = staff.oc?.name ?? null;
      info.defCoordinator = staff.dc?.name ?? null;
      info.isUserTeam = staff.anyUser;
    }
    teams.push(info);
  });
  teams.sort((a, b) => a.longName.localeCompare(b.longName));

  const season = await extractSeason(franchise);
  const games = await extractGames(
    franchise,
    teamTable.header?.tableId ?? -1,
    Math.max(0, (season?.dynastyYear ?? 1) - 1)
  );

  let school: Snapshot['school'] = null;
  const teamRow = opts.schoolTeamRow;
  if (teamRow !== null && teamTable.records[teamRow] && !teamTable.records[teamRow].isEmpty) {
    const teamRec = teamTable.records[teamRow];
    const team = teams.find((t) => t.row === teamRow) ?? teamFromRecord(teamRec, teamRow)!;

    // Preferred roster join: the Team.Roster ref → array of Player refs.
    let playerRows: number[] = [];
    const rosterRef = refFromRecord(teamRec, 'Roster');
    if (!isNullRef(rosterRef)) {
      const arrTable = await tableById(franchise, rosterRef.tableId);
      const arrRec = arrTable?.records?.[rosterRef.row];
      if (arrRec) {
        playerRows = refsFromArrayRecord(arrRec)
          .filter((r) => r.tableId === playerTableId)
          .map((r) => r.row);
      }
    }
    // Fallback join: Player.TeamIndex against the team's own index field (or row).
    if (!playerRows.length) {
      const teamIndex = recordHasField(teamRec, 'TeamIndex') ? Number(val(teamRec, 'TeamIndex')) : teamRow;
      playerTable.records.forEach((rec: any, row: number) => {
        if (!rec.isEmpty && Number(val(rec, 'TeamIndex')) === teamIndex) playerRows.push(row);
      });
    }

    const roster = playerRows
      .map((row) => {
        const rec = playerTable.records[row];
        return rec && !rec.isEmpty ? playerFromRecord(rec, row) : null;
      })
      .filter((p): p is RosterPlayer => !!p)
      .sort((a, b) => b.overall - a.overall);

    const depthChart: DepthChartSlot[] = [];
    const dcRef = refFromRecord(teamRec, 'DepthChart');
    if (!isNullRef(dcRef)) {
      const dcTable = await tableById(franchise, dcRef.tableId);
      const dcRec = dcTable?.records?.[dcRef.row];
      if (dcRec?._fields) {
        for (const pos of Object.keys(dcRec._fields)) {
          if (pos === 'LockedEntries') continue;
          const slotRef = refFromRecord(dcRec, pos);
          const playerRowsForSlot = await resolveDepthSlot(franchise, slotRef, playerTableId);
          if (playerRowsForSlot.length) depthChart.push({ position: pos, playerRows: playerRowsForSlot });
        }
      }
    }

    const ownTeamIndex = rowToTeamIndex.get(teamRow) ?? teamRow;
    const budget = extractBudget(teamRec);
    const splits = await extractSplits(franchise, teamRec);
    const staff = await staffTendencies(franchise, staffByTeamIndex.get(ownTeamIndex));
    const boardResult = await extractBoard(franchise, teamRec, playerTable, teamIndexToName, ownTeamIndex);
    const schoolAssets = await extractSchoolAssets(franchise, teamTable, rowToTeamIndex);
    const recruiting = await extractRecruiting(
      franchise,
      teamRec,
      playerTable,
      teamIndexToName,
      schoolAssets,
      ownTeamIndex,
      boardResult?.recruitRows ?? new Set(),
      season?.seasonYear ?? 0
    );

    school = {
      team,
      roster,
      depthChart,
      budget,
      splits,
      staff,
      board: boardResult?.info ?? null,
      recruiting
    };
  }

  return {
    parsedAt: Date.now(),
    fileName: opts.fileName,
    season,
    teams,
    games,
    school
  };
}
