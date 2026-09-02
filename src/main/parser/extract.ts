import type {
  BowlAppearance,
  CoachContract,
  DepthChartSlot,
  HeismanWinner,
  ProgramHonor,
  RivalrySeries,
  RosterPlayer,
  SeasonRecord,
  SeasonState,
  Snapshot,
  TeamHistoryData,
  TeamInfo
} from '../../shared/types.ts';
import { COACH_GOAL_LABELS } from '../data/coach-goals.ts';
import { SCHOOL_LOCATIONS } from '../data/school-locations.ts';
import { ensureCoachSchema } from './coach-schema.ts';
import {
  decodePlaybookRow,
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
  'PLYR_HOME_TOWN',
  'RecruitingDealbreaker',
  'IdealRecruitingPitch',
  'PLYR_DRAFTROUND'
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
  /** Head coach's selected playbook rows (Coach.Offensive/DefensivePlaybook, low 17 bits). */
  offPlaybookRow: number | null;
  defPlaybookRow: number | null;
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
  'CareerStats',
  'OffensivePlaybook',
  'DefensivePlaybook',
  // AD mandate + job security (schema indices 116-126). The whole Coach layout
  // decodes since the drift pad moved to its true slot (see coach-schema.ts).
  'ContractLength',
  'ContractStatus',
  'ContractYearsRemaining',
  'ContractExpectationProgress',
  'ContractYearSummaries',
  'CurrentContractExpectation',
  'CurrentJobSecurityPercentage',
  'CurrentJobSecurityPercentageRank',
  'CurrentJobSecurityStatus',
  'EarnedContractPoints_ThisYear',
  'EarnedContractPoints_LastYear',
  'EarnedContractPoints_TwoYearsAgo'
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
      const entry =
        map.get(teamIndex) ??
        { hc: null, oc: null, dc: null, anyUser: false, offPlaybookRow: null, defPlaybookRow: null };
      entry[role] = { name, row };
      if (val(rec, 'IsUserControlled') === true) entry.anyUser = true;
      // The team's playbook selection lives on the head coach's record.
      if (role === 'hc') {
        entry.offPlaybookRow = decodePlaybookRow(val(rec, 'OffensivePlaybook'));
        entry.defPlaybookRow = decodePlaybookRow(val(rec, 'DefensivePlaybook'));
      }
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
      coachRow: member.row,
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

/**
 * The AD's standing mandate for the head coach plus the job security riding on
 * it. The goal is an enum ladder (Win4Games…Win9Games, WinConfChamp,
 * WinNY6Bowl); the save carries no prose for it, so the UI supplies wording.
 * `Count_` is the engine's "unset" sentinel and is normalised to empty.
 */
async function extractCoachContract(
  franchise: any,
  staff: StaffEntry | undefined,
  teamRec: any
): Promise<CoachContract | null> {
  if (!staff?.hc) return null;
  try {
    const coachTable = mainTable(franchise, 'Coach');
    const rec = coachTable.records?.[staff.hc.row];
    if (!rec || rec.isEmpty) return null;

    const num = (k: string): number => {
      const v = Number(val(rec, k));
      return Number.isFinite(v) ? v : 0;
    };
    const str = (k: string): string => {
      const v = String(val(rec, k) ?? '').trim();
      return v === 'Count_' || v === 'Invalid' || v === 'undefined' ? '' : v;
    };

    const history: import('../../shared/types.ts').ContractYear[] = [];
    const ref = refFromRecord(rec, 'ContractYearSummaries');
    if (!isNullRef(ref)) {
      const arrTable = await tableById(franchise, ref.tableId);
      const arrRec = arrTable?.records?.[ref.row];
      if (arrRec) {
        for (const r of refsFromArrayRecord(arrRec)) {
          const t = await tableById(franchise, r.tableId);
          const y = t?.records?.[r.row];
          if (!y) continue;
          const year = Number(val(y, 'ContractYear'));
          if (!Number.isFinite(year) || year < 1900) continue;
          history.push({
            year,
            expectation: String(val(y, 'ExpectationLevelAchieved') ?? ''),
            securityStatus: String(val(y, 'JobSecurityStatusAchieved') ?? ''),
            securityPct: Number(val(y, 'JobSecurityPercentageAchieved') ?? 0)
          });
        }
        history.sort((a, b) => a.year - b.year);
      }
    }

    // The AD's three seasonal goals hang off Team, not Coach. Their refs are
    // FranTk asset ids into the game's tuning stores; the wording is generated
    // into COACH_GOAL_LABELS by scripts/extract-coach-goals.ts.
    const homeState = SCHOOL_LOCATIONS[String(val(teamRec, 'LongName') ?? '')]?.[1] ?? null;
    const seasonGoals: import('../../shared/types.ts').SeasonGoalSlot[] = [];
    for (let slot = 1; slot <= 3; slot++) {
      const status = String(val(teamRec, `HCContractGoal${slot}Status`) ?? '').trim();
      if (!status || status === 'Count_' || status === 'Invalid') continue;
      const id = goalRefId(refFromRecord(teamRec, `HCContractGoal${slot}`));
      const raw = (id && COACH_GOAL_LABELS[id]) || '';
      seasonGoals.push({ slot, status, id, label: displayGoalLabel(raw, homeState) });
    }
    const expectedPts = Number(val(teamRec, 'ExpectedContractPoints_ThisYear'));

    const expectation = str('CurrentContractExpectation');
    if (!expectation && !history.length && !seasonGoals.length) return null;

    return {
      coachName: staff.hc.name,
      expectation,
      progress: str('ContractExpectationProgress'),
      securityStatus: str('CurrentJobSecurityStatus'),
      securityPct: num('CurrentJobSecurityPercentage'),
      securityRank: num('CurrentJobSecurityPercentageRank'),
      yearsRemaining: num('ContractYearsRemaining'),
      contractLength: num('ContractLength'),
      status: str('ContractStatus'),
      pointsThisYear: num('EarnedContractPoints_ThisYear'),
      pointsLastYear: num('EarnedContractPoints_LastYear'),
      pointsTwoYearsAgo: num('EarnedContractPoints_TwoYearsAgo'),
      pointsExpectedThisYear: Number.isFinite(expectedPts) ? expectedPts : 0,
      seasonGoals,
      history
    };
  } catch {
    return null;
  }
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
    offPlaybookRow: null,
    defPlaybookRow: null,
    headCoach: null,
    offCoordinator: null,
    defCoordinator: null,
    city: SCHOOL_LOCATIONS[longName || displayName]?.[0] ?? null,
    state: SCHOOL_LOCATIONS[longName || displayName]?.[1] ?? null,
    founded: SCHOOL_LOCATIONS[longName || displayName]?.[2] ?? null,
    isUserTeam: false,
    rank: Number(val(rec, 'MediaPoll_CurrentRank') ?? 0),
    lastWeekRank: Number(val(rec, 'MediaPoll_LastWeeksRank') ?? 0),
    adDemeanor: enumOrNull(val(rec, 'ADDemeanor')),
    adPriorities: [
      val(rec, 'ADPriorityPrimary'),
      val(rec, 'ADPrioritySecondary'),
      val(rec, 'ADPriorityTertiary')
    ]
      .map((v) => enumOrNull(v))
      .filter((v): v is string => !!v)
  };
}

/** Real enum values only — the save's Count_/Invalid sentinels read as null. */
function enumOrNull(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s && !/^(Count_?|Invalid_?|First_?|Last_?)$/.test(s) ? s : null;
}

/**
 * Live vacancies from the save's JobOpening table. Empty outside the game's
 * own postseason carousel weeks; when populated, each row names the team, the
 * role, who left and why (Fired / Retired / Pro / NewJob / ContractEnding),
 * and — once filled — who took it and for how many program points.
 */
async function extractJobOpenings(
  franchise: any,
  teamTableId: number,
  realTeamRows: Set<number>
): Promise<import('../../shared/types.ts').JobOpeningEntry[]> {
  const out: import('../../shared/types.ts').JobOpeningEntry[] = [];
  try {
    const table = tablesByName(franchise, 'JobOpening')[0];
    if (!table) return out;
    await readTable(table);
    const live = (table.records as any[]).filter((r) => !r.isEmpty);
    if (!live.length) return out;

    const coachTable = mainTable(franchise, 'Coach');
    const coachName = (ref: { tableId: number; row: number } | null): string | null => {
      if (!ref || isNullRef(ref)) return null;
      const rec = coachTable?.records?.[ref.row];
      if (!rec || rec.isEmpty) return null;
      const name = `${String(val(rec, 'FirstName') ?? '').trim()} ${String(val(rec, 'LastName') ?? '').trim()}`.trim();
      return name || null;
    };

    for (const rec of live) {
      const teamRef = refFromRecord(rec, 'Team');
      if (!teamRef || isNullRef(teamRef) || teamRef.tableId !== teamTableId) continue;
      if (!realTeamRows.has(teamRef.row)) continue;
      const role = STAFF_ROLE[String(val(rec, 'Position'))];
      if (!role) continue;
      out.push({
        teamRow: teamRef.row,
        role: role.toUpperCase() as 'HC' | 'OC' | 'DC',
        prevCoach: coachName(refFromRecord(rec, 'PrevCoach')),
        reason: enumOrNull(val(rec, 'Reason')) ?? 'None',
        filled: val(rec, 'Filled') === true,
        selectedCoach: coachName(refFromRecord(rec, 'SelectedCoach')),
        finalPts: Number(val(rec, 'FinalContractProgramPoints') ?? 0),
        highestOfferPts: Number(val(rec, 'HighestOfferedProgramPoints') ?? 0)
      });
    }
  } catch {
    // openings are an enhancement — never fail the snapshot over them
  }
  return out;
}

/**
 * League-wide job security for every HC/OC/DC — the Coaching Carousel board.
 * Reads the Coach table already loaded by extractStaff.
 */
async function extractCarousel(
  franchise: any,
  teamIndexToRow: Map<number, number>,
  realTeamRows: Set<number>
): Promise<import('../../shared/types.ts').CarouselEntry[]> {
  const out: import('../../shared/types.ts').CarouselEntry[] = [];
  try {
    const table = mainTable(franchise, 'Coach');
    if (!(await ensureCoachSchema(franchise, table))) return out;
    await table.readRecords(COACH_FIELDS);
    let coachRow = -1;
    for (const rec of table.records as any[]) {
      coachRow++;
      if (rec.isEmpty) continue;
      const role = STAFF_ROLE[String(val(rec, 'Position'))];
      if (!role) continue;
      const teamIndex = Number(val(rec, 'TeamIndex'));
      const teamRow = teamIndexToRow.get(teamIndex);
      if (teamRow === undefined || !realTeamRows.has(teamRow)) continue;
      const status = enumOrNull(val(rec, 'CurrentJobSecurityStatus'));
      if (!status) continue;
      const name = `${String(val(rec, 'FirstName') ?? '').trim()} ${String(val(rec, 'LastName') ?? '').trim()}`.trim();
      if (!name) continue;
      const age = Number(val(rec, 'Age'));
      // The enum aliases range markers onto real values (First_Active=Signed,
      // First_Pending=PendingFire...) and the lib reads back whichever name
      // comes first — normalize so the UI always sees the semantic one.
      const CONTRACT_ALIAS: Record<string, string> = {
        First_Active: 'Signed',
        First_Pending: 'PendingFire',
        Last_Active: 'PendingRetire',
        Last_Pending: 'PendingHire'
      };
      const rawContract = String(val(rec, 'ContractStatus') ?? '');
      out.push({
        teamRow,
        role: role.toUpperCase() as 'HC' | 'OC' | 'DC',
        name,
        coachRow,
        age: Number.isFinite(age) && age > 0 ? age : null,
        securityStatus: status,
        securityPct: Number(val(rec, 'CurrentJobSecurityPercentage') ?? 0),
        securityRank: Number(val(rec, 'CurrentJobSecurityPercentageRank') ?? 0),
        yearsRemaining: Number(val(rec, 'ContractYearsRemaining') ?? 0),
        contractLength: Number(val(rec, 'ContractLength') ?? 0),
        contractStatus: CONTRACT_ALIAS[rawContract] ?? rawContract,
        isUser: val(rec, 'IsUserControlled') === true
      });
    }
    out.sort((a, b) => a.securityPct - b.securityPct);
  } catch {
    // carousel data is an enhancement — never fail the snapshot over it
  }
  return out;
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
      'Attendance',
      'BowlGame'
    ]);
    // Bowl slots repeat the same few BowlGame rows; resolve each name once.
    const bowlNames = new Map<string, string | null>();
    for (const rec of table.records) {
      if (rec.isEmpty) continue;
      if (Number(val(rec, 'SeasonYear')) !== currentYearIndex) continue;
      const status = String(val(rec, 'GameStatus'));
      if (status === 'Unscheduled' || status === 'Invalid_') continue;
      const home = refFromRecord(rec, 'HomeTeam');
      const away = refFromRecord(rec, 'AwayTeam');
      if (isNullRef(home) || isNullRef(away) || home.tableId !== teamTableId || away.tableId !== teamTableId) continue;
      let bowlName: string | null = null;
      const bowlRef = refFromRecord(rec, 'BowlGame');
      if (!isNullRef(bowlRef)) {
        const key = `${bowlRef.tableId}:${bowlRef.row}`;
        if (!bowlNames.has(key)) {
          const bowlRec = (await tableById(franchise, bowlRef.tableId))?.records?.[bowlRef.row];
          bowlNames.set(key, bowlRec ? String(val(bowlRec, 'Name') ?? '').trim() || null : null);
        }
        bowlName = bowlNames.get(key) ?? null;
      }
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
        attendance: Number(val(rec, 'Attendance') ?? 0),
        bowlName
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
    portraitId: Number(val(rec, 'PLYR_PORTRAIT') ?? 0),
    departing: departureOf(rec),
    draftRound: (() => {
      const round = Number(val(rec, 'PLYR_DRAFTROUND') ?? 63);
      return round >= 1 && round < 63 ? round : null;
    })()
  };
}

/**
 * Whether this player is done after the season. The game itself keeps
 * graduates and draft entries on the roster until week 4 of the offseason,
 * which is exactly why Team Needs reads wrong in-game until then.
 * PLYR_DRAFTROUND is 63 until a player is actually drafted.
 */
function departureOf(rec: any): 'senior' | 'drafted' | null {
  const round = Number(val(rec, 'PLYR_DRAFTROUND') ?? 63);
  if (round >= 1 && round < 63) return 'drafted';
  if (String(val(rec, 'SchoolYear')) === 'Senior') return 'senior';
  return null;
}

function idealPitchOf(rec: any): string {
  const p = String(val(rec, 'IdealRecruitingPitch') ?? '');
  return /^Invalid/.test(p) || p === 'undefined' ? '' : p;
}

function dealbreakerOf(rec: any): string {
  const d = String(val(rec, 'RecruitingDealbreaker') ?? '');
  return /^Invalid/.test(d) ? '' : d;
}

/**
 * Team Needs mirrors the game's recruiting-hub panel: OFFENSIVE / DEFENSIVE /
 * SPECIAL TEAMS TARGETS, one `targeted/needed` cell per position in the
 * game's own vocabulary — tackles and guards collapse to T and G, LE/RE to
 * EDGE, LOLB/ROLB to OLB, MLB shows as MIKE, FS and SS stay apart, and LS is
 * not displayed (all verified against the in-game screen).
 */
const NEED_GROUP: Record<string, string> = {
  QB: 'QB', HB: 'HB', FB: 'FB', WR: 'WR', TE: 'TE',
  LT: 'T', RT: 'T', LG: 'G', RG: 'G', C: 'C',
  LE: 'EDGE', RE: 'EDGE', DT: 'DT', NT: 'DT',
  LOLB: 'OLB', ROLB: 'OLB', MLB: 'MIKE',
  CB: 'CB', FS: 'FS', SS: 'SS',
  K: 'K', P: 'P'
};
const NEED_SIDE: Record<string, 'OFF' | 'DEF' | 'ST'> = {
  QB: 'OFF', HB: 'OFF', FB: 'OFF', WR: 'OFF', TE: 'OFF', T: 'OFF', G: 'OFF', C: 'OFF',
  EDGE: 'DEF', DT: 'DEF', OLB: 'DEF', MIKE: 'DEF', CB: 'DEF', FS: 'DEF', SS: 'DEF',
  K: 'ST', P: 'ST'
};
const NEED_ORDER = [
  'QB', 'HB', 'FB', 'WR', 'TE', 'T', 'G', 'C',
  'EDGE', 'DT', 'OLB', 'MIKE', 'CB', 'FS', 'SS',
  'K', 'P'
];

/**
 * The game's own minimum roster composition, from the PositionCountTable row
 * whose values sum to 57 in the franchise-common tuning store
 * c45d7f72-500c-8bd1-1e95-271bfd1d2b18 (row 5; identical across store
 * revisions — see RESEARCH "Team Needs"). Collapsed into the panel's display
 * groups: T = LT+RT, G = LG+RG, EDGE = LE+RE, OLB = LOLB+ROLB.
 */
export const NEED_FLOOR: Record<string, number> = {
  QB: 3, HB: 2, FB: 2, WR: 4, TE: 2, T: 4, G: 6, C: 3,
  EDGE: 6, DT: 3, OLB: 6, MIKE: 3, CB: 4, FS: 3, SS: 3,
  K: 1, P: 1
};

/**
 * Projected roster shape per position group: who is really here next season.
 * League averages come from every real program's roster in the same save, so
 * the reference bar is the game's own roster-building behavior, not a guess.
 */
function buildTeamNeeds(
  playerTable: any,
  ownTeamIndex: number,
  committedTargets: { position: string; stage: string; pursuing: import('../../shared/types.ts').TargetSchool[] }[]
): import('../../shared/types.ts').TeamNeed[] {
  const own = new Map<string, { now: number; departing: number }>();
  for (const rec of playerTable.records as any[]) {
    if (rec.isEmpty) continue;
    if (Number(val(rec, 'TeamIndex')) !== ownTeamIndex) continue;
    const group = NEED_GROUP[String(val(rec, 'Position'))];
    if (!group) continue;
    const slot = own.get(group) ?? { now: 0, departing: 0 };
    slot.now++;
    if (departureOf(rec)) slot.departing++;
    own.set(group, slot);
  }
  if (!own.size) return [];

  const committed = new Map<string, number>();
  const targeted = new Map<string, number>();
  for (const t of committedTargets) {
    const group = NEED_GROUP[t.position];
    if (!group) continue;
    // Committed to us, not merely committed somewhere while still on the board.
    if (t.stage.includes('Committed') && t.pursuing[0]?.isUser) {
      committed.set(group, (committed.get(group) ?? 0) + 1);
    } else {
      // Still being chased — the strip's left number.
      targeted.set(group, (targeted.get(group) ?? 0) + 1);
    }
  }

  return NEED_ORDER.map((group) => {
    const slot = own.get(group) ?? { now: 0, departing: 0 };
    const incoming = committed.get(group) ?? 0;
    const projected = slot.now - slot.departing + incoming;
    return {
      group,
      side: NEED_SIDE[group] ?? 'ST',
      now: slot.now,
      departing: slot.departing,
      committed: incoming,
      projected,
      targeted: targeted.get(group) ?? 0,
      needed: Math.max(0, (NEED_FLOOR[group] ?? 0) - projected),
      floor: NEED_FLOOR[group] ?? 0
    };
  });
}

const SPEND_FIELDS: [string, string][] = [
  ['NIL', 'NILProgramPointsSpent'],
  ['Support Staff', 'StaffProgramPointsSpent'],
  ['Recruiting', 'RecruitProgramPointsSpent'],
  ['Facilities', 'FacilitiesProgramPointsSpent']
];

/** League-wide spending share per category: sum of category spend over sum of budgets. */
function leagueSpendingPct(teamTable: any): Map<string, number> {
  const out = new Map<string, number>();
  let budgets = 0;
  const sums = new Map<string, number>(SPEND_FIELDS.map(([label]) => [label, 0]));
  for (const rec of teamTable.records) {
    if (rec.isEmpty) continue;
    const budget = Number(val(rec, 'ProgramPointBudget') ?? 0);
    if (!budget) continue;
    budgets += budget;
    for (const [label, field] of SPEND_FIELDS) {
      sums.set(label, (sums.get(label) ?? 0) + Number(val(rec, field) ?? 0));
    }
  }
  if (budgets > 0) {
    for (const [label, sum] of sums) out.set(label, Math.round((sum / budgets) * 100));
  }
  return out;
}

function extractBudget(
  teamRec: any,
  leaguePct: Map<string, number>
): import('../../shared/types.ts').BudgetInfo | null {
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
    spending: SPEND_FIELDS.map(([label, field]) => ({
      label,
      points: n(field),
      leaguePct: leaguePct.get(label) ?? null
    })).filter((s) => s.points > 0),
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

export async function extractSplits(franchise: any, teamRec: any): Promise<import('../../shared/types.ts').SeasonSplits | null> {
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

/**
 * `Recruit.Class` short label. Transfers only populate once the save reaches the
 * offseason portal window — mid-season the class is high schoolers and JUCOs.
 */
function classLabel(raw: string): string {
  if (raw.startsWith('JuniorCollege')) return 'JUCO';
  if (raw.startsWith('Transfer')) {
    const yr = raw.slice('Transfer_'.length);
    return `TR ${yr.slice(0, 2)}`;
  }
  return 'HS';
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

/**
 * Weekly influence deltas for every (school, recruit) pursuit: sweep each
 * school's recruiting board once and record Total vs LastWeek influence.
 * Keyed `${recruitRow}:${teamIndex}`.
 */
async function extractPursuitDeltas(
  franchise: any,
  teamTable: any,
  rowToTeamIndex: Map<number, number>
): Promise<Map<string, number>> {
  const deltas = new Map<string, number>();
  try {
    for (const [row, teamIndex] of rowToTeamIndex) {
      const teamRec = teamTable.records[row];
      if (!teamRec || teamRec.isEmpty) continue;
      const boardRef = refFromRecord(teamRec, 'RecruitingBoard');
      if (isNullRef(boardRef)) continue;
      const boardTable = await tableById(franchise, boardRef.tableId);
      const boardRec = boardTable?.records?.[boardRef.row];
      if (!boardRec) continue;
      const listRef = refFromRecord(boardRec, 'Recruits');
      if (isNullRef(listRef)) continue;
      const listTable = await tableById(franchise, listRef.tableId);
      const listRec = listTable?.records?.[listRef.row];
      for (const tr of listRec ? refsFromArrayRecord(listRec) : []) {
        const targetTable = await tableById(franchise, tr.tableId);
        const targetRec = targetTable?.records?.[tr.row];
        if (!targetRec || targetRec.isEmpty) continue;
        const recruitRef = refFromRecord(targetRec, 'Recruit');
        if (isNullRef(recruitRef)) continue;
        const total = Number(val(targetRec, 'ProspectInfluenceTotal') ?? 0);
        const lastWeek = Number(val(targetRec, 'ProspectInfluenceTotalLastWeek') ?? 0);
        deltas.set(`${recruitRef.row}:${teamIndex}`, total - lastWeek);
      }
    }
  } catch {
    // deltas are decoration
  }
  return deltas;
}

/** ScheduledVisit → ActiveVisitInfo: the week (and activity) of a planned or completed visit. */
async function resolveVisit(
  franchise: any,
  targetRec: any
): Promise<{ visitWeek: number | null; visitActivity: string | null }> {
  try {
    const visitRef = refFromRecord(targetRec, 'ScheduledVisit');
    if (!isNullRef(visitRef)) {
      const visitTable = await tableById(franchise, visitRef.tableId);
      const rec = visitTable?.records?.[visitRef.row];
      if (rec) {
        const week = Number(val(rec, 'WeekNumber'));
        return {
          visitWeek: Number.isFinite(week) ? week : null,
          visitActivity: String(val(rec, 'Activity') ?? '') || null
        };
      }
    }
  } catch {
    // visits are decoration
  }
  return { visitWeek: null, visitActivity: null };
}

async function extractBoard(
  franchise: any,
  teamRec: any,
  playerTable: any,
  teamIndexToName: Map<number, string>,
  ownTeamIndex: number,
  pursuitDeltas: Map<string, number>
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
              isUser: tid === ownTeamIndex,
              delta: pursuitDeltas.get(`${recruitRef!.row}:${tid}`) ?? null
            });
          }
          pursuing.sort((a, b) => b.influence - a.influence);
        }

        targets.push({
          recruitRow: recruitRef!.row,
          playerRow: playerRef!.row,
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
          ...(await resolveVisit(franchise, targetRec)),
          nationalRank: Number(val(recruitRec, 'NationalRank') ?? 0),
          stateRank: Number(val(recruitRec, 'StateRank') ?? 0),
          positionRank: Number(val(recruitRec, 'PositionRank') ?? 0),
          offers: Number(val(recruitRec, 'TotalScholarshipOffers') ?? 0),
          homeState: String(val(playerRec, 'PLYR_HOME_STATE') ?? ''),
          dealbreaker: dealbreakerOf(playerRec),
          idealPitch: idealPitchOf(playerRec),
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

/**
 * Edge-verdict threshold: |net score| past this reads as a real advantage or
 * disadvantage. Signals cap at race ±3, pipeline ±3, pro potential ±3, home
 * state ±2 — so 2.5 needs one dominant signal or two moderate ones.
 */
const EDGE_SIGNIFICANT = 2.5;

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
  seasonYear: number,
  pursuitDeltas: Map<string, number>
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
            isUser: tid === ownTeamIndex,
            delta: pursuitDeltas.get(`${row}:${tid}`) ?? null
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

      // Edge verdict (RJ's rule, 2026-08-30): the user school scored against
      // the strongest school in the recruit's race. Two regimes: in the race,
      // the game's own live standing dominates and program comparisons only
      // modulate (leading must not read red); outside it, program pull can
      // flag an opportunity but never a loss — you aren't losing a race you
      // aren't running. Green/red past ±EDGE_SIGNIFICANT; committed recruits
      // are settled and read neutral.
      let edgeScore = 0;
      const edgeParts: string[] = [];
      const inRace = userInfluence > 0;
      if (!committed && own) {
        const part = (d: number, label: string): void => {
          if (Math.abs(d) < 0.05) return;
          edgeScore += d;
          edgeParts.push(`${label} ${d > 0 ? '+' : ''}${(Math.round(d * 10) / 10).toFixed(1)}`);
        };
        const topRival = race.find((s) => !s.isUser) ?? null;
        if (inRace && topRival) {
          part(
            (4 * (userInfluence - topRival.influence)) /
              Math.max(userInfluence, topRival.influence, 1),
            'race standing'
          );
          // Front-runner bump: being the race's #1 is an edge in itself, the
          // way the old Leading chip treated it.
          if (race[0]?.isUser) part(1, 'leading');
        }
        const staticWeight = inRace ? 0.5 : 1;
        const rivals = rivalIndexes
          .map((ti) => schoolAssets.get(ti))
          .filter((a): a is SchoolAssets => !!a);
        if (pipeline) {
          const userTier = own.pipelines.get(pipeline)?.tier ?? 0;
          const bestRivalTier = Math.max(0, ...rivals.map((r) => r.pipelines.get(pipeline)?.tier ?? 0));
          part(staticWeight * Math.max(-2, Math.min(2, userTier - bestRivalTier)), 'pipeline');
        }
        const group = PRO_POTENTIAL_GROUP[position];
        if (group) {
          const userGrade = own.proGrades.get(group) ?? -1;
          const bestRivalGrade = Math.max(-1, ...rivals.map((r) => r.proGrades.get(group) ?? -1));
          if (userGrade >= 0 && bestRivalGrade >= 0) {
            part(staticWeight * Math.max(-2, Math.min(2, (userGrade - bestRivalGrade) / 3)), 'pro potential');
          }
        }
        const stateName = wordSpace(homeState);
        if (own.state && stateName === own.state) part(staticWeight * 1.5, 'home state');
        else if (rivals.some((r) => r.state && r.state === stateName)) {
          part(staticWeight * -1.5, 'rival home state');
        }
      }
      const edgeCall: 'up' | 'even' | 'down' = committed
        ? 'even'
        : edgeScore >= EDGE_SIGNIFICANT
          ? 'up'
          : inRace && edgeScore <= -EDGE_SIGNIFICANT
            ? 'down'
            : 'even';
      const edgeWhy = committed
        ? 'Committed — race decided'
        : edgeParts.length
          ? `Net ${edgeScore > 0 ? '+' : ''}${(Math.round(edgeScore * 10) / 10).toFixed(1)} vs the top rival${inRace ? '' : ' (not in this race — program pull only)'} — ${edgeParts.join(' · ')}`
          : 'No comparative signal on this recruit';

      const classRaw = String(val(rec, 'Class') ?? '');
      recruits.push({
        row,
        // The Recruit row and the Player row are different indexes; anything
        // reading Player fields must use this one, not `row`.
        playerRow: playerRef!.row,
        name: `${String(val(p, 'FirstName') ?? '')} ${String(val(p, 'LastName') ?? '')}`.trim(),
        position,
        archetype: String(val(p, 'PlayerType') ?? ''),
        stars: STAR_MAP[String(val(p, 'ProspectStarRating'))] ?? 0,
        quality: String(val(rec, 'QualityModifier') ?? 'NORMAL'),
        stage,
        classType: classLabel(classRaw),
        isTransfer: classRaw.startsWith('Transfer'),
        overall: Number(val(p, 'OverallRating') ?? 0),
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
        edges,
        edgeScore: Math.round(edgeScore * 10) / 10,
        edgeCall,
        edgeWhy
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
    weekType: String(val(rec, 'CurrentWeekType') ?? ''),
    stage: String(val(rec, 'CurrentStage') ?? '')
  };
}

/**
 * Asset-space refs (goals, cities, stadiums, bowl trophies) carry a 0x4000 flag
 * on the table id; the remainder indexes a table in the game's asset files
 * rather than the save. Strip the flag to get a stable per-goal identifier.
 */
const ASSET_REF_FLAG = 0x4000;

/**
 * Goal wording ships verbatim from the game's tuning data and can carry
 * placeholders the game fills at draw time. Resolve the one the save lets us
 * resolve (the school's home state), genericize the rival name, and drop the
 * deadline tokens the app doesn't track. Presentation only — the generated
 * coach-goals.ts keeps the game's exact text.
 */
function displayGoalLabel(raw: string, homeState: string | null): string {
  if (!raw) return '';
  return raw
    .replace(/out</g, 'out <') // "Blow out<oppteamlongname>" ships without the space
    .replace(/<oppteamlongname>/g, 'your rival')
    .replace(/<homestate>/g, homeState ?? 'your home state')
    .replace(/\s*<time(_maint)?>/g, '')
    .trim();
}

function goalRefId(ref: { tableId: number; row: number } | null): string {
  if (!ref || (ref.tableId === 0 && ref.row === 0)) return '';
  if (!(ref.tableId & ASSET_REF_FLAG)) return '';
  return `${ref.tableId & (ASSET_REF_FLAG - 1)}:${ref.row}`;
}

/**
 * Program history for the Team History tab: rivalry series, the program's
 * national season awards, and the league's Heisman line.
 *
 * Rivalries come from the save's Rivalry table (233 live series with per-side
 * win totals, streaks and last-meeting scores). Awards come from
 * LeagueHistoryAward, which logs each season's national award show as a
 * fixed block of rows — names stored as plain text, so they stay right even
 * after the winner's Player row is recycled. Years are inferred from block
 * position anchored to the last completed season; the award types repeat each
 * block, which is how the block length is derived rather than assumed.
 */
async function extractTeamHistory(
  franchise: any,
  teamTableId: number,
  teamRow: number,
  teams: TeamInfo[],
  season: SeasonState | null
): Promise<TeamHistoryData | null> {
  const nameByRow = new Map(teams.map((t) => [t.row, t.longName || t.displayName]));
  const own = teams.find((t) => t.row === teamRow);
  const ownNames = new Set(
    [own?.longName, own?.displayName].filter((n): n is string => !!n).map((n) => n.toLowerCase())
  );

  const rivalries: RivalrySeries[] = [];
  try {
    const rt = tablesByName(franchise, 'Rivalry')[0];
    if (rt) {
      await readTable(rt);
      for (const rec of rt.records as any[]) {
        if (rec.isEmpty) continue;
        const t1 = refFromRecord(rec, 'Team1');
        const t2 = refFromRecord(rec, 'Team2');
        if (isNullRef(t1) || isNullRef(t2)) continue;
        if (t1.tableId !== teamTableId || t2.tableId !== teamTableId) continue;
        const side = t1.row === teamRow ? 1 : t2.row === teamRow ? 2 : 0;
        if (!side) continue;
        const rivalRow = side === 1 ? t2.row : t1.row;
        const usWins = Number(val(rec, side === 1 ? 'Team1Wins' : 'Team2Wins')) || 0;
        const themWins = Number(val(rec, side === 1 ? 'Team2Wins' : 'Team1Wins')) || 0;
        // StreakTeam is 0-based (0 = Team1, 1 = Team2) — verified against known
        // results: ND (Team2, streakTeam=1) on the W16 Army / W4 Navy runs.
        const streakTeam = Number(val(rec, 'StreakTeam'));
        const streakSide = streakTeam === 0 ? 1 : streakTeam === 1 ? 2 : 0;
        const streakLength = Number(val(rec, 'StreakLength')) || 0;
        rivalries.push({
          name: String(val(rec, 'Name') ?? '').trim(),
          secondaryName: String(val(rec, 'SecondaryName') ?? '').trim() || null,
          assetName: String(val(rec, 'AssetName') ?? '').trim(),
          rivalRow,
          rivalName: nameByRow.get(rivalRow) ?? 'Unknown',
          usWins,
          themWins,
          streakOurs: streakLength > 0 && streakSide !== 0 ? streakSide === side : null,
          streakLength,
          lastScoreUs: Number(val(rec, side === 1 ? 'Team1LastScore' : 'Team2LastScore')) || 0,
          lastScoreThem: Number(val(rec, side === 1 ? 'Team2LastScore' : 'Team1LastScore')) || 0
        });
      }
      rivalries.sort((a, b) => b.usWins + b.themWins - (a.usWins + a.themWins));
    }
  } catch {
    // rivalry table is decoration; the tab renders what it gets
  }

  const honors: ProgramHonor[] = [];
  const heisman: HeismanWinner[] = [];
  try {
    const lt = tablesByName(franchise, 'LeagueHistoryAward')[0];
    if (lt) {
      await readTable(lt);
      const rows = (lt.records as any[]).filter((r) => !r.isEmpty);
      if (rows.length) {
        const firstType = String(val(rows[0], 'AwardType') ?? '');
        let blockLen = rows.findIndex(
          (r, i) => i > 0 && String(val(r, 'AwardType') ?? '') === firstType
        );
        if (blockLen <= 0) blockLen = rows.length;
        const numBlocks = Math.ceil(rows.length / blockLen);
        const lastCompleted =
          season ? (season.stage === 'OffSeason' ? season.seasonYear : season.seasonYear - 1) : 0;
        rows.forEach((rec, i) => {
          const blockIdx = Math.floor(i / blockLen);
          const year = lastCompleted - (numBlocks - 1 - blockIdx);
          const awardType = String(val(rec, 'AwardType') ?? '');
          const first = String(val(rec, 'firstName') ?? '').trim();
          const last = String(val(rec, 'lastName') ?? '').trim();
          const school = String(val(rec, 'TeamDisplayName') ?? '').trim();
          const recipient = `${first} ${last}`.trim();
          if (!recipient) return;
          if (awardType === 'HEISMAN') heisman.push({ year, name: recipient, school });
          if (school && ownNames.has(school.toLowerCase())) {
            honors.push({
              year,
              awardType,
              recipient,
              position: String(val(rec, 'Position') ?? '').trim() || null
            });
          }
        });
        honors.sort((a, b) => b.year - a.year || a.awardType.localeCompare(b.awardType));
        heisman.sort((a, b) => b.year - a.year);
      }
    }
  } catch {
    // award log is decoration; the tab renders what it gets
  }

  if (!rivalries.length && !honors.length && !heisman.length) return null;
  return { rivalries, honors, heisman };
}

/** Every rivalry series as a light team-row pair list, for game flavor. */
async function extractRivalryPairs(
  franchise: any,
  teamTableId: number
): Promise<{ a: number; b: number; name: string }[]> {
  try {
    const rt = tablesByName(franchise, 'Rivalry')[0];
    if (!rt) return [];
    await readTable(rt);
    const out: { a: number; b: number; name: string }[] = [];
    for (const rec of rt.records as any[]) {
      if (rec.isEmpty) continue;
      const t1 = refFromRecord(rec, 'Team1');
      const t2 = refFromRecord(rec, 'Team2');
      if (isNullRef(t1) || isNullRef(t2)) continue;
      if (t1.tableId !== teamTableId || t2.tableId !== teamTableId) continue;
      const name = String(val(rec, 'Name') ?? '').trim();
      if (!name) continue;
      out.push({ a: t1.row, b: t2.row, name });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Weekly honors from PlayerAward (Period = 'Game'): national and per-conference
 * Offensive/Defensive Players of the Week for the latest completed week. Rows
 * persist from the previous season at the same week numbers and the ledger
 * references recyclable Player rows, so a row only counts when its player
 * still sits on the awarding team — always true for the current season's
 * winner, rarely for last year's copy. Mechanism in RESEARCH "Weekly awards".
 */
async function extractWeeklyAwards(
  franchise: any,
  playerTable: any,
  teamTable: any,
  games: import('../../shared/types.ts').GameInfo[]
): Promise<import('../../shared/types.ts').WeeklyAward[]> {
  try {
    const playedWeeks = games.filter((g) => g.status !== 'unplayed').map((g) => g.week);
    if (!playedWeeks.length) return [];
    const week = Math.max(...playedWeeks);
    const pa = tablesByName(franchise, 'PlayerAward').sort(
      (a: any, b: any) => (b.header?.recordCapacity ?? 0) - (a.header?.recordCapacity ?? 0)
    )[0];
    if (!pa) return [];
    await readTable(pa);
    const playerTableId = playerTable.header?.tableId ?? -1;
    const teamTableId = teamTable.header?.tableId ?? -1;
    const out: import('../../shared/types.ts').WeeklyAward[] = [];
    const seen = new Set<string>();
    for (const rec of pa.records as any[]) {
      if (rec.isEmpty) continue;
      if (String(val(rec, 'Period')) !== 'Game') continue;
      if (Number(val(rec, 'PeriodIndex')) !== week) continue;
      const type = String(val(rec, 'AwardType') ?? '');
      const side = type.startsWith('Offensive') ? 'off' : type.startsWith('Defensive') ? 'def' : null;
      if (!side) continue;
      const pref = refFromRecord(rec, 'Player');
      const p =
        !isNullRef(pref) && pref.tableId === playerTableId ? playerTable.records[pref.row] : null;
      if (!p || p.isEmpty) continue;
      const tref = refFromRecord(rec, 'Team');
      const t = !isNullRef(tref) && tref.tableId === teamTableId ? teamTable.records[tref.row] : null;
      if (!t || t.isEmpty) continue;
      // The disambiguating join: this season's winner is still on that team.
      if (Number(val(p, 'TeamIndex')) !== Number(val(t, 'TeamIndex'))) continue;
      const cref = refFromRecord(rec, 'Conference');
      const confRow = isNullRef(cref) ? null : cref!.row;
      const key = `${side}-${confRow ?? 'natl'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        week,
        side: side as 'off' | 'def',
        confRow,
        playerRow: pref!.row,
        name: `${String(val(p, 'FirstName') ?? '').trim()} ${String(val(p, 'LastName') ?? '').trim()}`.trim(),
        position: String(val(p, 'Position') ?? ''),
        teamRow: tref!.row,
        teamName:
          String(val(t, 'DisplayName') ?? '').trim() || String(val(t, 'LongName') ?? '').trim()
      });
    }
    // National honors first, then conference, offense before defense.
    return out.sort(
      (a, b) =>
        Number(a.confRow !== null) - Number(b.confRow !== null) || a.side.localeCompare(b.side)
    );
  } catch {
    return [];
  }
}

/**
 * League-wide winners from the latest annual awards show block, text names —
 * immune to Player-row recycling. Same block math as Team History; the year
 * label can run one ahead during the short pre-show offseason window (see
 * RESEARCH) — the media engine diffs block content, not the label, so no
 * stories fire early.
 */
async function extractAnnualAwards(
  franchise: any,
  season: SeasonState | null
): Promise<import('../../shared/types.ts').AnnualAwards | null> {
  try {
    const lt = tablesByName(franchise, 'LeagueHistoryAward')[0];
    if (!lt) return null;
    await readTable(lt);
    const rows = (lt.records as any[]).filter((r) => !r.isEmpty);
    if (!rows.length) return null;
    const firstType = String(val(rows[0], 'AwardType') ?? '');
    let blockLen = rows.findIndex((r, i) => i > 0 && String(val(r, 'AwardType') ?? '') === firstType);
    if (blockLen <= 0) blockLen = rows.length;
    const lastCompleted = season
      ? season.stage === 'OffSeason'
        ? season.seasonYear
        : season.seasonYear - 1
      : 0;
    const winners = rows
      .slice(rows.length - blockLen)
      .map((rec) => ({
        awardType: String(val(rec, 'AwardType') ?? ''),
        name: `${String(val(rec, 'firstName') ?? '').trim()} ${String(val(rec, 'lastName') ?? '').trim()}`.trim(),
        position: String(val(rec, 'Position') ?? '').trim() || null,
        teamName: String(val(rec, 'TeamDisplayName') ?? '').trim()
      }))
      .filter((w) => w.name && w.awardType);
    return winners.length ? { year: lastCompleted, winners } : null;
  } catch {
    return null;
  }
}

/** How deep into the postseason a bowl slot sits — the deepest one is the story. */
const BOWL_DEPTH: Record<string, number> = {
  BowlSeason1: 1,
  BowlSeason2: 2,
  BowlSeason3: 3,
  NationalChampionship: 4
};

/**
 * The bowl the team played this season, read from the SeasonGame rows that carry
 * a BowlGame ref. Slots sit unassigned (null team refs) until bowl season, so this
 * returns null for most of the year — the caller banks it once it appears.
 */
async function extractSeasonBowl(
  franchise: any,
  teamTableId: number,
  teamRow: number,
  currentYearIndex: number
): Promise<BowlAppearance | null> {
  try {
    const candidates = tablesByName(franchise, 'SeasonGame').filter(
      (t: any) => (t.header?.recordCapacity ?? 0) > 100
    );
    if (!candidates.length) return null;
    const table = candidates.sort(
      (a: any, b: any) => b.header.recordCapacity - a.header.recordCapacity
    )[0];
    await table.readRecords([
      'BowlGame',
      'HomeTeam',
      'AwayTeam',
      'GameStatus',
      'SeasonWeekType',
      'SeasonYear'
    ]);

    let best: { rec: any; bowlRef: any; isHome: boolean; depth: number } | null = null;
    for (const rec of table.records) {
      if (rec.isEmpty) continue;
      if (Number(val(rec, 'SeasonYear')) !== currentYearIndex) continue;
      const status = String(val(rec, 'GameStatus'));
      if (status !== 'HomeWon' && status !== 'AwayWon') continue;
      const bowlRef = refFromRecord(rec, 'BowlGame');
      if (isNullRef(bowlRef)) continue;
      const home = refFromRecord(rec, 'HomeTeam');
      const away = refFromRecord(rec, 'AwayTeam');
      const isHome = !isNullRef(home) && home.tableId === teamTableId && home.row === teamRow;
      const isAway = !isNullRef(away) && away.tableId === teamTableId && away.row === teamRow;
      if (!isHome && !isAway) continue;
      const depth = BOWL_DEPTH[String(val(rec, 'SeasonWeekType'))] ?? 0;
      if (!best || depth > best.depth) best = { rec, bowlRef, isHome, depth };
    }
    if (!best) return null;

    const bowlTable = await tableById(franchise, best.bowlRef.tableId);
    const bowlRec = bowlTable?.records?.[best.bowlRef.row];
    if (!bowlRec) return null;
    const name = String(val(bowlRec, 'Name') ?? '').trim();
    if (!name) return null;
    const status = String(val(best.rec, 'GameStatus'));
    return {
      name,
      assetName: String(val(bowlRec, 'AssetName') ?? '').trim(),
      won: (status === 'HomeWon') === best.isHome,
      playoff: val(bowlRec, 'IsPlayoffBowl') === true,
      primary:
        rgbHex(
          val(bowlRec, 'BOWL_PRIMARY_COLOR_R'),
          val(bowlRec, 'BOWL_PRIMARY_COLOR_G'),
          val(bowlRec, 'BOWL_PRIMARY_COLOR_B')
        ) ?? '#3f4a5a',
      secondary:
        rgbHex(
          val(bowlRec, 'BOWL_SECONDARY_COLOR_R'),
          val(bowlRec, 'BOWL_SECONDARY_COLOR_G'),
          val(bowlRec, 'BOWL_SECONDARY_COLOR_B')
        ) ?? '#ffffff'
    };
  } catch {
    return null;
  }
}

/**
 * Team.TeamSeasonStats is a rolling five-season window of TeamStats totals,
 * ordered newest-first: index 0 is the season underway (final once the save
 * reaches the offseason), and index i is CurrentSeasonYear - i. Verified across
 * two snapshots three seasons apart — the same years carry the same records.
 * Returned oldest-first; unplayed seasons (0-0) are dropped.
 */
async function extractSeasonHistory(
  franchise: any,
  teamRec: any,
  season: SeasonState | null,
  thisSeasonBowl: BowlAppearance | null
): Promise<SeasonRecord[]> {
  try {
    const baseYear = season?.seasonYear ?? 0;
    if (!baseYear) return [];
    const ref = refFromRecord(teamRec, 'TeamSeasonStats');
    if (isNullRef(ref)) return [];
    const arrTable = await tableById(franchise, ref.tableId);
    const arrRec = arrTable?.records?.[ref.row];
    if (!arrRec) return [];
    const inSeason = season?.stage !== 'OffSeason';
    const out: SeasonRecord[] = [];
    const refs = refsFromArrayRecord(arrRec);
    for (let i = 0; i < refs.length; i++) {
      const statsTable = await tableById(franchise, refs[i].tableId);
      const rec = statsTable?.records?.[refs[i].row];
      if (!rec) continue;
      const wins = Number(val(rec, 'WINS') ?? 0);
      const losses = Number(val(rec, 'LOSSES') ?? 0);
      if (wins + losses === 0) continue;
      out.push({
        year: baseYear - i,
        wins,
        losses,
        confChamp: Number(val(rec, 'CONFCHAMPSWON') ?? 0) > 0,
        natlChamp: Number(val(rec, 'NATCHAMPSWON') ?? 0) > 0,
        cfpMade: Number(val(rec, 'CFPSMADE') ?? 0) > 0,
        bowlWon: Number(val(rec, 'BOWLSWON') ?? 0) > 0,
        inProgress: i === 0 && inSeason,
        bowl: i === 0 ? thisSeasonBowl : null
      });
    }
    return out.reverse();
  } catch {
    return [];
  }
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

/**
 * Stable per-dynasty identity. FranchiseUser.TrophyProfileId is minted once at
 * dynasty creation (a microsecond-resolution creation stamp) and never changes
 * across seasons, job moves, file renames or the app's edited-sibling writes;
 * save-as copies of a dynasty share it, which is the continuity we want.
 * Verified across seven save lineages — see docs/RESEARCH.md "Dynasty
 * identity". Null (legacy flat state layout) when the field is unreadable.
 */
async function extractDynastyId(franchise: any): Promise<string | null> {
  try {
    const t = await tableWithField(franchise, 'FranchiseUser', 'TrophyProfileId');
    if (!t) return null;
    const users = (t.records as any[]).filter((r: any) => !r.isEmpty);
    const owner = users.find((r: any) => String(val(r, 'AdminLevel')) === 'Owner') ?? users[0];
    const raw = String(val(owner, 'TrophyProfileId') ?? '').trim();
    return /^\d{6,20}$/.test(raw) && Number(raw) > 0 ? raw : null;
  } catch {
    return null;
  }
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
  // Real programs only — the save also carries generic FCS squads (TEAM_TYPE
  // 'ProBowl', e.g. "FCS West") with their own coach pools.
  const realTeamRows = new Set<number>();
  teamTable.records.forEach((rec: any, row: number) => {
    if (rec.isEmpty) return;
    const info = teamFromRecord(rec, row);
    if (!info) return;
    if (String(val(rec, 'TEAM_TYPE') ?? '') === 'Current') realTeamRows.add(row);
    const teamIndex = recordHasField(rec, 'TeamIndex') ? Number(val(rec, 'TeamIndex')) : row;
    teamIndexToName.set(teamIndex, info.longName);
    rowToTeamIndex.set(row, teamIndex);
    const staff = staffByTeamIndex.get(teamIndex);
    if (staff) {
      info.headCoach = staff.hc?.name ?? null;
      info.offCoordinator = staff.oc?.name ?? null;
      info.defCoordinator = staff.dc?.name ?? null;
      info.offPlaybookRow = staff.offPlaybookRow;
      info.defPlaybookRow = staff.defPlaybookRow;
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

  const teamIndexToRow = new Map<number, number>();
  for (const [row, ti] of rowToTeamIndex) teamIndexToRow.set(ti, row);
  const carousel = await extractCarousel(franchise, teamIndexToRow, realTeamRows);
  const jobOpenings = await extractJobOpenings(
    franchise,
    teamTable.header?.tableId ?? -1,
    realTeamRows
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
    const budget = extractBudget(teamRec, leagueSpendingPct(teamTable));
    const splits = await extractSplits(franchise, teamRec);
    const staff = await staffTendencies(franchise, staffByTeamIndex.get(ownTeamIndex));
    const contract = await extractCoachContract(franchise, staffByTeamIndex.get(ownTeamIndex), teamRec);
    const pursuitDeltas = await extractPursuitDeltas(franchise, teamTable, rowToTeamIndex);
    const boardResult = await extractBoard(
      franchise,
      teamRec,
      playerTable,
      teamIndexToName,
      ownTeamIndex,
      pursuitDeltas
    );
    const schoolAssets = await extractSchoolAssets(franchise, teamTable, rowToTeamIndex);
    const seasonBowl = await extractSeasonBowl(
      franchise,
      teamTable.header?.tableId ?? -1,
      teamRow,
      Math.max(0, (season?.dynastyYear ?? 1) - 1)
    );
    const seasonHistory = await extractSeasonHistory(franchise, teamRec, season, seasonBowl);
    const history = await extractTeamHistory(
      franchise,
      teamTable.header?.tableId ?? -1,
      teamRow,
      teams,
      season
    );
    const recruiting = await extractRecruiting(
      franchise,
      teamRec,
      playerTable,
      teamIndexToName,
      schoolAssets,
      ownTeamIndex,
      boardResult?.recruitRows ?? new Set(),
      season?.seasonYear ?? 0,
      pursuitDeltas
    );

    school = {
      team,
      roster,
      depthChart,
      budget,
      splits,
      staff,
      board: boardResult?.info ?? null,
      recruiting,
      teamNeeds: buildTeamNeeds(playerTable, ownTeamIndex, boardResult?.info.targets ?? []),
      seasonHistory,
      contract,
      history
    };
  }

  const weeklyAwards = await extractWeeklyAwards(franchise, playerTable, teamTable, games);
  const annualAwards = await extractAnnualAwards(franchise, season);
  const rivalries = await extractRivalryPairs(franchise, teamTable.header?.tableId ?? -1);

  return {
    parsedAt: Date.now(),
    fileName: opts.fileName,
    dynastyId: await extractDynastyId(franchise),
    weeklyAwards,
    annualAwards,
    rivalries,
    season,
    teams,
    games,
    carousel,
    jobOpenings,
    school
  };
}
