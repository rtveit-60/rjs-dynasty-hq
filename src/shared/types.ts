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
  /** The school's AD personality: Patient / Balanced / Impatient / Reactionary. */
  adDemeanor: string | null;
  /** The AD's ranked priorities (Rival, Conference, Recruiting, Achievement, Offense, Defense). */
  adPriorities: string[];
}

/**
 * One materialized coaching vacancy from the save's JobOpening table. Rows
 * only exist while the game's own carousel runs (postseason) — mid-season the
 * table is empty and forecasting is all anyone has.
 */
export interface JobOpeningEntry {
  teamRow: number;
  role: 'HC' | 'OC' | 'DC';
  prevCoach: string | null;
  /** Save enum: Fired / Retired / Pro / NewJob / ContractEnding / None. */
  reason: string;
  filled: boolean;
  selectedCoach: string | null;
  /** Winning contract, in program points; 0 until filled. */
  finalPts: number;
  highestOfferPts: number;
}

/** One coach's job-security line for the league-wide carousel board. */
export interface CarouselEntry {
  teamRow: number;
  role: 'HC' | 'OC' | 'DC';
  name: string;
  /** Coach table row — the handle profile pop-ups open with. */
  coachRow: number;
  age: number | null;
  /** Save enum: Safe / SafeForNow / Low / HotSeat. */
  securityStatus: string;
  securityPct: number;
  /** National rank among coaches of any role (1 = safest); 0 when unset. */
  securityRank: number;
  yearsRemaining: number;
  contractLength: number;
  isUser: boolean;
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
  /** Bowl name when the game is a bowl/CFP slot; null otherwise. */
  bowlName?: string | null;
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
  /** Leaving after this season: a senior, or already drafted. The game keeps
   * both on the roster until week 4 of the offseason. */
  departing: 'senior' | 'drafted' | null;
}

/**
 * One cell of the game-style needs panel (`targeted/needed` per position).
 * `now` counts everyone the game still lists; `departing` are the
 * seniors/draftees inside that count; `committed` are commits on the way in.
 * `needed` measures the projected roster against the game's own minimum
 * roster composition — honest about departures, which the game itself
 * ignores until week 4 of the offseason.
 */
export interface TeamNeed {
  group: string;
  /** The row the game's own needs panel files this position under. */
  side: 'OFF' | 'DEF' | 'ST';
  now: number;
  departing: number;
  committed: number;
  /** now − departing + committed. */
  projected: number;
  /** Board targets still being chased at this position (commits excluded). */
  targeted: number;
  /** max(0, game roster floor − projected). */
  needed: number;
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

/** One rivalry series from the save's Rivalry table, seen from the user's side. */
export interface RivalrySeries {
  name: string;
  secondaryName: string | null;
  rivalRow: number;
  rivalName: string;
  usWins: number;
  themWins: number;
  /** Whose streak is live: true = ours, false = theirs, null = none recorded. */
  streakOurs: boolean | null;
  streakLength: number;
  lastScoreUs: number;
  lastScoreThem: number;
}

/**
 * One national season award won by someone at this program, from the save's
 * LeagueHistoryAward log (names stored as text there, so they survive player
 * rows being recycled after graduation).
 */
export interface ProgramHonor {
  year: number;
  /** Raw award enum from the save, e.g. "BEST_QB", "HEISMAN". */
  awardType: string;
  recipient: string;
  /** Position string as the save records it (player position, or HC/AC). */
  position: string | null;
}

export interface HeismanWinner {
  year: number;
  name: string;
  school: string;
}

export interface TeamHistoryData {
  rivalries: RivalrySeries[];
  honors: ProgramHonor[];
  heisman: HeismanWinner[];
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
  /** Coach table row — the handle profile pop-ups open with. */
  coachRow: number;
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
  /** Row in the Recruit table — joins board targets to class recruits. */
  recruitRow: number;
  /** Row in the Player table, where names/ratings/abilities live. */
  playerRow: number;
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
  /** Save enum, e.g. PlayingTime, ProximityToHome; '' when none. */
  dealbreaker: string;
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

// --- Profiles (on-demand pop-up detail for a player, coach or school) ---

/**
 * One stat cell as it should read on screen. Values arrive pre-formatted
 * because the sensible rendering differs per stat — "18-of-27" and "7.4" and
 * "1,240" all need different treatment and the renderer shouldn't have to know.
 */
export interface StatCell {
  label: string;
  value: string;
}

/** A labelled block of stat cells — Passing, Rushing, Defense, and so on. */
export interface StatLine {
  category: string;
  cells: StatCell[];
}

/** One season of a player's career, as the save's per-season stat rows record it. */
export interface SeasonStatRow {
  /** Calendar year (SEAS_YEAR resolved against the save's current season). */
  year: number;
  /** The school the player suited up for that year, from the stat row itself. */
  team: string;
  teamRow: number | null;
  gamesPlayed: number;
  gamesStarted: number;
  lines: StatLine[];
}

/** One game from a player's log. */
export interface GameLogRow {
  year: number;
  week: number;
  weekType: string;
  opponent: string;
  opponentRow: number | null;
  home: boolean;
  /** "W 45–14"; empty when the save has no result for the game. */
  result: string;
  lines: StatLine[];
}

/** A school change visible in a player's own season-by-season stat rows. */
export interface PlayerStop {
  fromYear: number;
  team: string;
  teamRow: number | null;
}

export interface PlayerProfile {
  kind: 'player';
  row: number;
  name: string;
  position: string;
  archetype: string;
  jersey: number | null;
  heightIn: number;
  weightLb: number;
  overall: number;
  devTrait: string;
  schoolYear: string;
  redshirt: string;
  homeTown: string;
  homeState: string;
  teamRow: number | null;
  teamName: string | null;
  /** Save enum — "Uninjured" when healthy. */
  injury: string;
  yearsWithTeam: number;
  awards: number;
  ratings: { label: string; value: number }[];
  mental: AbilitySlot[];
  physical: AbilitySlot[];
  /** Career totals, empty for a player who has never taken a snap. */
  career: StatLine[];
  /** Newest season first. */
  seasons: SeasonStatRow[];
  /** Newest game first. */
  games: GameLogRow[];
  /** Schools worn, oldest first — derived from the season rows' own team fields. */
  stops: PlayerStop[];
  /** Set for a prospect still on the recruiting board. */
  recruit: {
    stars: number;
    nationalRank: number;
    positionRank: number;
    stateRank: number;
    stage: string;
    offers: number;
    committedTo: string | null;
    /** Save enum, e.g. PlayingTime; '' when none. */
    dealbreaker: string;
    /** The race: pursuing schools by influence, user school flagged. */
    pursuing: TargetSchool[];
  } | null;
}

/** A coach's career ledger, from the save's CareerCoachStats row. */
export interface CoachCareerStats {
  wins: number;
  losses: number;
  winsAtSchool: number;
  lossesAtSchool: number;
  bowlWins: number;
  bowlLosses: number;
  playoffWins: number;
  playoffLosses: number;
  confChampWins: number;
  confChampLosses: number;
  natlChampWins: number;
  natlChampLosses: number;
  rivalWins: number;
  rivalLosses: number;
  top25Wins: number;
  top25Losses: number;
  draftPicks: number;
  firstRoundPicks: number;
  top5Classes: number;
  timesFired: number;
  prestigeGains: number;
}

/**
 * One stint on a coach's résumé. Head-coach stints are reconstructed from the
 * teams' own year-by-year history rows (which name each season's coach of
 * record), so they carry seasons and a record; other roles come from the
 * coach's current job and the save's previous-job fields, which carry no
 * dates — those render as "Earlier".
 */
export interface CoachStop {
  teamRow: number | null;
  team: string;
  /** Save enum: HeadCoach / OffensiveCoordinator / DefensiveCoordinator. */
  role: string;
  fromYear: number | null;
  /** null = still there. */
  toYear: number | null;
  wins: number | null;
  losses: number | null;
  current: boolean;
}

export interface CoachProfile {
  kind: 'coach';
  row: number;
  name: string;
  /** Save enum: HeadCoach / OffensiveCoordinator / DefensiveCoordinator. */
  role: string;
  teamRow: number | null;
  teamName: string | null;
  age: number;
  yearsCoaching: number;
  seasonsWithTeam: number;
  /** School name resolved from AlmaMater (a PresentationId); null when the id
   * points outside the save's team list. */
  almaMater: string | null;
  almaMaterRow: number | null;
  homeState: string | null;
  prestige: string;
  personality: string;
  backstory: string;
  specialty: string;
  pipeline: string;
  archetype: string;
  wasPlayer: boolean;
  offScheme: string;
  defScheme: string;
  contractYears: number;
  contractLength: number;
  contractStatus: string;
  securityStatus: string;
  securityPct: number;
  seasonWins: number;
  seasonLosses: number;
  career: CoachCareerStats | null;
  stops: CoachStop[];
}

/** One game on a school's schedule. */
export interface ScheduleGame {
  week: number;
  weekType: string;
  opponent: string;
  opponentRow: number | null;
  home: boolean;
  neutral: boolean;
  /** 'W' | 'L' | 'T' | '' when unplayed. */
  outcome: string;
  scoreUs: number;
  scoreThem: number;
  bowlName: string | null;
  network: string;
  attendance: number;
}

/**
 * One season of a school, as deep as the save (plus the app's own banked
 * schedules) can tell it. Three tiers of depth:
 *  - every year: record, conference finish, final rank, coach, postseason
 *    (from the team's year-by-year history rows);
 *  - the save's rolling five-season stat window: a team stat panel;
 *  - the current season, and any season the app banked while it was being
 *    played: full schedule and points for/against.
 */
export interface SchoolSeason {
  year: number;
  current: boolean;
  wins: number;
  losses: number;
  ties: number;
  conference: string;
  confWins: number;
  confLosses: number;
  confStanding: number;
  finalRank: number;
  coachName: string;
  /** Deepest postseason result recorded that year; empty when none. */
  postseason: string;
  /** Summed from the schedule; null when no game-by-game record exists. */
  pointsFor: number | null;
  pointsAgainst: number | null;
  /** Empty when the game-by-game record is gone (save keeps one season). */
  schedule: ScheduleGame[];
  /** Team stat panel; empty outside the save's five-season window. */
  stats: StatLine[];
}

/** The program's all-time ledger, from Team.TeamHistoricalData. */
export interface SchoolAllTime {
  wins: number;
  losses: number;
  ties: number;
  homeWins: number;
  homeLosses: number;
  bowlsMade: number;
  bowlsWon: number;
  cfpMade: number;
  cfpWon: number;
  ny6Made: number;
  ny6Won: number;
  natlChampsMade: number;
  natlChampsWon: number;
  rivalryWins: number;
  rivalryLosses: number;
  heismans: number;
  allAmericans: number;
  playersDrafted: number;
  weeksRankedTop25: number;
  top5Classes: number;
  top10Classes: number;
  top25Classes: number;
  longestHomeWinStreak: number;
  currentHomeWinStreak: number;
}

export interface SchoolProfile {
  kind: 'school';
  row: number;
  name: string;
  nickName: string;
  city: string | null;
  state: string | null;
  founded: number | null;
  colors: TeamColors;
  conference: string;
  stadium: string | null;
  rank: number;
  prestigeRank: number;
  confStanding: number;
  offenseRank: number;
  defenseRank: number;
  staff: { role: string; name: string; row: number }[];
  wins: number;
  losses: number;
  /** Newest first; [0] is the season underway. */
  seasons: SchoolSeason[];
  allTime: SchoolAllTime | null;
}

export type Profile = PlayerProfile | CoachProfile | SchoolProfile;

/** What the UI asks for when a name is clicked. */
export type ProfileRequest =
  | { kind: 'player'; row: number }
  | { kind: 'coach'; row: number }
  | { kind: 'school'; row: number };

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
  | 'hotSeat'
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
  /** 'article' (default) or a short social-style 'post' from the wire's press corps. */
  format?: 'article' | 'post';
  /** Set on posts: the fictional personality who wrote it. */
  byline?: { name: string; handle: string; role: string; outletName: string };
}

export interface Snapshot {
  parsedAt: number;
  fileName: string;
  season: SeasonState | null;
  teams: TeamInfo[];
  games: GameInfo[];
  /** League-wide coach job security, all 3 roles per school. */
  carousel: CarouselEntry[];
  /** Live vacancies from the save's JobOpening table (postseason only). */
  jobOpenings: JobOpeningEntry[];
  school: {
    team: TeamInfo;
    roster: RosterPlayer[];
    depthChart: DepthChartSlot[];
    budget: BudgetInfo | null;
    splits: SeasonSplits | null;
    staff: StaffTendency[];
    board: BoardInfo | null;
    recruiting: RecruitingData | null;
    /** Projected roster needs per position group; empty when roster is absent. */
    teamNeeds: TeamNeed[];
    seasonHistory: SeasonRecord[];
    contract: CoachContract | null;
    history: TeamHistoryData | null;
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
