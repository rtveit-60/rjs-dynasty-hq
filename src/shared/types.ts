export type ThemeMode = 'system' | 'light' | 'dark';

export type BrandPack = 'real' | 'parody';

export interface Settings {
  savePath: string | null;
  schoolTeamRow: number | null;
  theme: ThemeMode;
  brandPack: BrandPack;
  portraitsDir: string | null;
  logosDir: string | null;
  autoUpdate: boolean;
  windowBounds?: { x: number; y: number; width: number; height: number };
}

export interface TeamColors {
  primary: string;
  secondary: string | null;
}

export interface TeamInfo {
  row: number;
  displayName: string;
  longName: string;
  nickName: string;
  shortName: string;
  colors: TeamColors;
  offScheme: string;
  defScheme: string;
  headCoach: string | null;
  offCoordinator: string | null;
  defCoordinator: string | null;
  city: string | null;
  state: string | null;
  founded: number | null;
  offPlaybook: string;
  defPlaybook: string;
  /** Head coach's selected playbook rows (Coach.Offensive/DefensivePlaybook); resolves the
   * actual book the team runs, which can differ from the scheme default. Null if unread. */
  offPlaybookRow: number | null;
  defPlaybookRow: number | null;
  isUserTeam: boolean;
  rank: number;
  lastWeekRank: number;
}

export interface GameInfo {
  week: number;
  weekType: string;
  homeRow: number;
  awayRow: number;
  homeScore: number;
  awayScore: number;
  status: 'home' | 'away' | 'unplayed';
  gotw: boolean;
  overtime: boolean;
  network: string;
  attendance: number;
}

export interface RosterPlayer {
  row: number;
  firstName: string;
  lastName: string;
  jersey: number;
  position: string;
  overall: number;
  schoolYear: string;
  redshirt: string;
  heightIn: number;
  weightLb: number;
  speed: number;
  devTrait: string;
  archetype: string;
  homeState: string;
  homeTown: string;
  portraitId: number;
}

export interface DepthChartSlot {
  position: string;
  playerRows: number[];
}

export interface SeasonState {
  seasonYear: number;
  dynastyYear: number;
  week: number;
  weekType: string;
  stage: string;
}

/**
 * The bowl a team played in a given season. Only readable once the save has
 * reached bowl season — before then the bowl slots carry no teams.
 */
export interface BowlAppearance {
  name: string;
  /** Stable art key from the save (e.g. "Rose_Bowl"); survives sponsor renames. */
  assetName: string;
  won: boolean;
  playoff: boolean;
  primary: string;
  secondary: string;
}

/** One season's bottom line, from the save's rolling five-season stat window. */
export interface SeasonRecord {
  year: number;
  wins: number;
  losses: number;
  confChamp: boolean;
  natlChamp: boolean;
  cfpMade: boolean;
  bowlWon: boolean;
  /** Season still being played — the record is a running total, not final. */
  inProgress: boolean;
  bowl: BowlAppearance | null;
}

/** One completed year of the head coach's current contract. */
export interface ContractYear {
  year: number;
  /** Raw save enum, e.g. "Win9Games". */
  expectation: string;
  securityStatus: string;
  securityPct: number;
}

/**
 * The athletic director's standing mandate for the head coach, plus the job
 * security that rides on it. Read from the Coach table's contract fields.
 */
/**
 * One of the AD's three seasonal goal slots. The goal's *definition* lives in
 * the game's asset files, not the save, so only its status is readable.
 */
export interface SeasonGoalSlot {
  slot: number;
  status: string;
  /** Stable goal identifier, `<assetTable>:<row>` — same goal, same id, always. */
  id: string;
  /** Wording, once this goal has been identified; empty until then. */
  label: string;
}

export interface CoachContract {
  coachName: string;
  /** The AD's goal this season — raw save enum, e.g. "WinNY6Bowl". */
  expectation: string;
  /** Best result banked so far this season; empty until something is earned. */
  progress: string;
  securityStatus: string;
  securityPct: number;
  /** Job-security standing among all head coaches (1 = safest). */
  securityRank: number;
  yearsRemaining: number;
  contractLength: number;
  status: string;
  pointsThisYear: number;
  pointsLastYear: number;
  pointsTwoYearsAgo: number;
  /** The season's contract-point bar, from the Team table. */
  pointsExpectedThisYear: number;
  /** The AD's three seasonal goals — status only; see SeasonGoalSlot. */
  seasonGoals: SeasonGoalSlot[];
  history: ContractYear[];
}

export interface BudgetPillar {
  label: string;
  points: number;
  grade: string | null;
}

export interface BudgetInfo {
  total: number;
  remaining: number;
  rollover: number;
  overallGrade: string | null;
  pillars: BudgetPillar[];
  spending: { label: string; points: number; leaguePct: number | null }[];
  staffWeekly: { hc: number; oc: number; dc: number };
}

export interface SeasonSplits {
  scope: 'current' | 'lastSeason';
  games: number;
  wins: number;
  losses: number;
  rushAtt: number;
  passAtt: number;
  rushYds: number;
  passYds: number;
  thirdDowns: number;
  thirdConv: number;
  fourthDowns: number;
  fourthConv: number;
  redzoneTrips: number;
  redzoneTds: number;
  redzoneFgs: number;
  sacks: number;
  takeaways: number;
  giveaways: number;
  defRushYds: number;
  defPassYds: number;
}

export interface StaffTendency {
  role: 'HC' | 'OC' | 'DC';
  name: string;
  prestige: string | null;
  careerWins: number | null;
  careerLosses: number | null;
  offRunPass: number | null;
  defRunPass: number | null;
  offAggression: number | null;
  defAggression: number | null;
}

export interface TargetSchool {
  name: string;
  influence: number;
  isUser: boolean;
  /** Influence gained/lost since last week, when the school's board tracks this recruit. */
  delta: number | null;
}

export interface RecruitTargetEntry {
  name: string;
  position: string;
  stars: number;
  quality: string;
  stage: string;
  scholarship: string;
  committedWeek: number;
  nilOffer: number;
  nilExpectation: number;
  influence: number;
  hoursSpent: number;
  isFavorite: boolean;
  visitWeek: number | null;
  visitActivity: string | null;
  nationalRank: number;
  stateRank: number;
  positionRank: number;
  offers: number;
  homeState: string;
  pursuing: TargetSchool[];
}

export interface BoardInfo {
  hoursTotal: number;
  hoursAssigned: number;
  targets: RecruitTargetEntry[];
}

export interface PipelineStrength {
  pipeline: string;
  label: string;
  level: string;
  tier: number;
  value: number;
}

export interface SchoolGrade {
  label: string;
  grade: string;
}

export interface ClassRecruit {
  /** Row in the Recruit table — matches the recruiting board's own ids. */
  row: number;
  /** Row in the Player table, where names/ratings/abilities live. */
  playerRow: number;
  name: string;
  position: string;
  /** Save archetype enum, e.g. "OT_Agile" — the prefix is the role family. */
  archetype: string;
  stars: number;
  quality: string;
  stage: string;
  classType: string;
  /** True for portal transfers, which only appear in the offseason. */
  isTransfer: boolean;
  devTrait: string;
  homeState: string;
  pipeline: string;
  heightIn: number;
  weightLb: number;
  nationalRank: number;
  stateRank: number;
  positionRank: number;
  offers: number;
  race: TargetSchool[];
  userInfluence: number;
  onBoard: boolean;
  committedTo: string | null;
  edges: string[];
}

export interface AbilitySlot {
  /** Ability name; empty for physical slots, which the save stores as tier only. */
  name: string;
  /** Bronze | Silver | Gold | Platinum. */
  rank: string;
}

/**
 * Detail for one recruit, fetched on demand rather than shipped in every
 * snapshot — 4,101 recruits times 59 ratings is far too much to push per save.
 */
export interface RecruitCard {
  row: number;
  name: string;
  position: string;
  archetype: string;
  heightIn: number;
  weightLb: number;
  overall: number;
  devTrait: string;
  homeTown: string;
  homeState: string;
  /** Position-relevant ratings, already ordered for display. */
  ratings: { label: string; value: number }[];
  mental: AbilitySlot[];
  physical: AbilitySlot[];
}

export interface RecruitingData {
  classYear: number;
  total: number;
  pipelines: PipelineStrength[];
  reportCard: SchoolGrade[];
  proPotential: SchoolGrade[];
  recruits: ClassRecruit[];
}

export type MediaEventType =
  | 'userGame'
  | 'bigGame'
  | 'pollMove'
  | 'commit'
  | 'coachChange'
  | 'rosterMove'
  | 'seasonSoFar';

export interface MediaEvent {
  id: string;
  createdAt: number;
  seasonYear: number;
  week: number;
  weekType: string;
  type: MediaEventType;
  priority: number;
  aboutUser: boolean;
  tags: string[];
  outlet: string;
  headline: string;
  dek: string;
  body: string[];
}

export interface Snapshot {
  parsedAt: number;
  fileName: string;
  season: SeasonState | null;
  teams: TeamInfo[];
  games: GameInfo[];
  school: {
    team: TeamInfo;
    roster: RosterPlayer[];
    depthChart: DepthChartSlot[];
    budget: BudgetInfo | null;
    splits: SeasonSplits | null;
    staff: StaffTendency[];
    board: BoardInfo | null;
    recruiting: RecruitingData | null;
    seasonHistory: SeasonRecord[];
    contract: CoachContract | null;
  } | null;
}

// --- Playbooks (extracted offline from game assets into resources/playbooks/<enum>.json) ---

export interface PlaybookPlayer {
  x: number; // yards, +x = offense's right
  y: number; // yards downfield, LOS = 0
  posId?: number;
  posType?: number;
  side?: number;
}

export interface PlaybookRoute {
  points: { x: number; y: number }[]; // absolute yard polyline, [0] = player's alignment
}

export interface PlaybookPlay {
  name: string;
  id: number;
  routes: PlaybookRoute[];
  /** Controller passing icon per player slot (e.g. 'X','Y','A','B','RB'); null = not a target. */
  buttons: (string | null)[];
}

export interface PlaybookFormation {
  family: string; // e.g. "Shotgun"
  name: string; // e.g. "Spread Y-Flex"
  personnel: string[]; // substitution package names
  alignment: PlaybookPlayer[]; // base ("Normal") alignment, ~11 players
  motions: string[]; // alignment-variant names
  plays: PlaybookPlay[];
}

export interface PlaybookBook {
  slug: string; // book asset slug, e.g. "ohio_state"
  side: 'offense' | 'defense';
  name: string; // display name, e.g. "Ohio State"
  formationCount: number;
  playCount: number;
  formations: PlaybookFormation[];
}

export type WatchStatus =
  | { kind: 'idle' }
  | { kind: 'watching'; lastUpdate: number | null }
  | { kind: 'parsing' }
  | { kind: 'error'; message: string };

export interface AppState {
  settings: Settings;
  status: WatchStatus;
  snapshot: Snapshot | null;
  media: MediaEvent[];
  updateReady: string | null;
}

export interface DetectedSave {
  path: string;
  name: string;
  modified: number;
  isAutosave: boolean;
}
