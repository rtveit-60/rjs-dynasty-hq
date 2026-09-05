export type ThemeMode = 'system' | 'light' | 'dark';

/**
 * The game blank-screens on any save whose file name is longer than this
 * (bisected in-game 2026-09-02 with byte-identical files: 32 loads, 33 does
 * not). Its own names stop at 31.
 */
export const SAVE_NAME_MAX = 32;

export type BrandPack = 'real' | 'parody';

export interface Settings {
  savePath: string | null;
  schoolTeamRow: number | null;
  theme: ThemeMode;
  brandPack: BrandPack;
  portraitsDir: string | null;
  logosDir: string | null;
  /** CFB 27 install folder; null = auto-detect (stock locations + Steam libraries). */
  gameDir: string | null;
  autoUpdate: boolean;
  /** Renderer zoom factor; 1 = 100%. Clamped to 0.7–1.5. */
  uiScale: number;
  /** Scale the UI with window width (uiScale becomes a bias on the fit). */
  uiFit: boolean;
  windowBounds?: { x: number; y: number; width: number; height: number };
}

export interface GameDirStatus {
  /** The Setup-configured folder, or null when auto-detecting. */
  configured: string | null;
  /** The validated install the app is actually using, or null if none found. */
  root: string | null;
  source: 'setting' | 'env' | 'default' | 'steam' | null;
  /** True when a configured folder exists in settings but isn't a CFB 27 install. */
  settingInvalid: boolean;
  /** A folder the user just picked that failed validation (never saved). */
  rejected?: string | null;
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
  /** Normalized ContractStatus: Signed | Expiring | PendingFire | PendingNFL | PendingRenewal | PendingRetire | PendingHire | FreeAgent. */
  contractStatus: string;
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
  /** Calendar date from the save (1-based month/day) and weekday name; null when unset. */
  month?: number | null;
  day?: number | null;
  dayOfWeek?: string | null;
  /** Kickoff as minutes from midnight (720 = noon); null when unset. */
  timeOfDay?: number | null;
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
  /** NFL draft round once drafted (PLYR_DRAFTROUND, 63 = undrafted). */
  draftRound: number | null;
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
  /** The game's 57-man minimum composition count for the group (the seats). */
  floor: number;
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
  /** Stable art key from the save (e.g. "Alabama_Auburn_Game") — joins the
   * extracted rivalry logo / trophy renders in the game-icons store. */
  assetName: string;
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
  /** IdealRecruitingPitch enum key (ItsGameTime…); '' when none. Display data in shared/pitches. */
  idealPitch: string;
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
  /** True overall from the save — the game itself hides it until scouted. */
  overall: number;
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
  /** Net comparative score vs the strongest school in the race (see extract.ts EDGE_SIGNIFICANT). */
  edgeScore: number;
  /** Board arrow: up = significant advantage, down = disadvantage, even = neutral/committed. */
  edgeCall: 'up' | 'even' | 'down';
  /** Hover text explaining the verdict's components. */
  edgeWhy: string;
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
  /** The recruit's own jersey number; −1 when the save has none. */
  jersey: number;
  homeTown: string;
  homeState: string;
  /** IdealRecruitingPitch enum key (ItsGameTime…); '' when none. Display data in shared/pitches. */
  idealPitch: string;
  /** The skills the position lives on, ordered for the At a Glance card. */
  glance: { label: string; value: number }[];
  mental: AbilitySlot[];
  physical: AbilitySlot[];
}

// --- Awards (weekly honors + the annual show) ---

/**
 * One Player of the Week honor for the latest completed week, from the save's
 * PlayerAward ledger. National when confRow is null, otherwise a conference
 * honor. Joined live to the Player table (current season only — see RESEARCH).
 */
export interface WeeklyAward {
  week: number;
  side: 'off' | 'def';
  confRow: number | null;
  playerRow: number;
  name: string;
  position: string;
  teamRow: number;
  teamName: string;
}

/** One winner from the annual awards show, denormalized text — recycling-proof. */
export interface AnnualAwardWinner {
  /** Save enum key; AWARD_NAMES maps it to the game's display name. */
  awardType: string;
  name: string;
  position: string | null;
  teamName: string;
}

export interface AnnualAwards {
  /** Season the show covered, by the same block math Team History uses. */
  year: number;
  winners: AnnualAwardWinner[];
}

// --- League leaders (Media HQ ticker + modules, computed on demand) ---

export interface LeaderRow {
  playerRow: number;
  name: string;
  position: string;
  team: string;
  teamRow: number | null;
  /** Category value — yards, tackles, sacks (half-precision), picks. */
  value: number;
  /** Companion figure, pre-formatted: "24 TD", "48 rec". */
  sub: string;
}

export interface LeaderCategory {
  key: 'pass' | 'rush' | 'recv' | 'total' | 'tackles' | 'sacks' | 'ints';
  label: string;
  /** Ticker shorthand: PASS, RUSH, REC, TKL, SACK, INT. */
  short: string;
  rows: LeaderRow[];
}

/** One team's season totals, summed from its players' stat rows. */
export interface TeamSeasonTotals {
  teamRow: number;
  passYds: number;
  rushYds: number;
  /** Offensive touchdowns: passing + rushing (receiving TDs are the same scores). */
  offTds: number;
  fgs: number;
  sacks: number;
  ints: number;
}

export interface LeagueLeaders {
  seasonYear: number;
  categories: LeaderCategory[];
  teams: TeamSeasonTotals[];
}

// --- This Week's Matchup (Team HQ tab; heavy pieces fetched on demand) ---

/** One completed meeting between the two matchup schools, from the schedule bank. */
export interface MatchupMeeting {
  year: number;
  week: number;
  weekType: string;
  homeRow: number;
  awayRow: number;
  homeScore: number;
  awayScore: number;
  bowlName: string | null;
}

/** One row of the game's own FBS record book (League.Player*StatRecords). */
export interface StatRecordEntry {
  scope: 'season' | 'game' | 'career';
  /** The save's stat key, e.g. "RushYards", "PassYards", "ReceiveYards". */
  statType: string;
  value: number;
  firstName: string;
  lastName: string;
  /** Denormalized text, exactly as the record book stores it. */
  teamName: string;
  year: number;
}

/**
 * The matchup pieces only the main process can read: season stat splits for
 * both schools, every banked prior meeting, and the live record book.
 */
export interface MatchupExtras {
  home: SeasonSplits | null;
  away: SeasonSplits | null;
  meetings: MatchupMeeting[];
  records: StatRecordEntry[];
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
  /** PLYR_PORTRAIT id for the portrait:// protocol; null when the save has none. */
  portrait: number | null;
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
    /** IdealRecruitingPitch enum key; '' when none. Display data in shared/pitches. */
    idealPitch: string;
    /** The race: pursuing schools by influence, user school flagged. */
    pursuing: TargetSchool[];
  } | null;
}

// --- Player editor ---

/** One editable rating on the edit form, in the profile sheet's display order. */
export interface EditRating {
  /** Save field name (SpeedRating…) — what the write goes to. */
  field: string;
  /** Short label the sheets already use (SPD…). */
  label: string;
  value: number;
}

/** One mental-ability slot as stored: identity + tier, both save enum member names. */
export interface EditMentalSlot {
  slot: number;
  /** MentalAbilities member ("RoadFanFavorite", "None"…). Display names in shared/mental-abilities. */
  ability: string;
  /** AbilitiesRank member: None | Bronze | Silver | Gold | Platinum. */
  rank: string;
}

/** One physical-ability slot: the archetype-fixed name plus the stored tier. */
export interface EditPhysicalSlot {
  slot: number;
  /** From the archetype's slot table — not editable (changing it means changing archetype). */
  name: string;
  rank: string;
}

/** One of the six skill-group cap slots, named per the player's archetype. */
export interface EditSkillCap {
  /** 1–6, the save's SkillGroupCap{slot}. */
  slot: number;
  name: string;
  /** Current cap: a level on the 0–skillCapMax scale. */
  cap: number;
  rgb: [number, number, number];
  /** The ratings this group levels, in the game's own weighting tiers. */
  skills: { name: string; field: string; tier: 'primary' | 'secondary' | 'tertiary' }[];
}

/** Everything the edit dialog needs, read straight from the record and its schema. */
export interface PlayerEditForm {
  playerRow: number;
  name: string;
  position: string;
  firstName: string;
  lastName: string;
  /** Schema string caps — writes beyond them would silently truncate. */
  maxFirstLen: number;
  maxLastLen: number;
  /** null for recruits, whose jersey the game never shows. */
  jersey: number | null;
  isRecruit: boolean;
  ratings: EditRating[];
  mental: EditMentalSlot[];
  /** Assignable mental abilities: save member id + the game's display name/blurb. */
  mentalOptions: { id: string; name: string; desc: string | null }[];
  /** Tier member names, None first. */
  rankOptions: string[];
  physical: EditPhysicalSlot[];
  /** Height in inches and weight in pounds, with the dialog's limits. */
  heightIn: number;
  weightLb: number;
  heightMin: number;
  heightMax: number;
  weightMin: number;
  weightMax: number;
  /** The six cap slots in archetype order; null when the game defines no groups for it. */
  skillCaps: EditSkillCap[] | null;
  skillCapMax: number;
  /** Unspent skill points and the save's ceiling for the field. */
  skillPoints: number;
  skillPointsMax: number;
  /** Development trait (save member id) and the tiers the schema accepts. */
  devTrait: string;
  devTraitOptions: { id: string; name: string }[];
  homeState: string;
  homeTown: string;
  /** state -> the game's own hometowns there, each with its pipeline. */
  cities: Record<string, { town: string; pipeline: string }[]>;
  /** slot -> the item the player's own visuals blob wears; null = undressed. */
  look: Record<string, string> | null;
  /** The blob's skin tone, when it carries one. */
  lookTone: number | null;
  /** The blob's body type (0 = Standard when absent); null = undressed. */
  lookBody: number | null;
  gearSlots: GearSlotOptions[];
  skinTones: number[];
  helmetMasks: Record<string, string[]>;
  faces: FaceOption[];
  /** The player's current head: portrait id + whether it is a unique scan. */
  currentFace: { portraitId: number; unique: boolean };
  /** File name an edit would write ("…_RJ") and whether it already exists. */
  targetFileName: string;
  targetExists: boolean;
}

/** The changed values only — untouched fields stay untouched in the save. */
export interface PlayerEditChanges {
  playerRow: number;
  firstName?: string;
  lastName?: string;
  jersey?: number;
  /** field name -> new value, 0–99. */
  ratings?: Record<string, number>;
  mental?: EditMentalSlot[];
  physical?: { slot: number; rank: string }[];
  /** Inches / pounds; the save stores weight as pounds − 160. */
  heightIn?: number;
  weightLb?: number;
  /** slot (1–6) -> new cap level, 0–SKILL_GROUP_CAP_MAX. */
  skillCaps?: Record<number, number>;
  skillPoints?: number;
  /** Development trait member id (Normal / College_Impact / College_Star / College_Elite). */
  devTrait?: string;
  /** A catalog face to put on the player (replaces a unique scan if present). */
  face?: FaceOption;
  /** Hometown moves as a pair; the pipeline follows the town. */
  homeState?: string;
  homeTown?: string;
  skinTone?: number;
  bodyType?: number;
  /** slot -> item; '' removes the slot from the player's blob. */
  gear?: Record<string, string>;
}

/** One subtree of a coach's talent tree as the save stores it. */
export interface CoachTalentSlotState {
  /** Index into the role's tree (TalentSubTreeStatus[slot]); null row = the save has no row for it. */
  slot: number;
  /** TalentStatus per node index: 0 NotOwned, 1 Purchasable, 2 Owned, 3 Locked. */
  status: number[];
  /** The save's paid-points ledger for the subtree. */
  spent: number;
}

/** Everything the coach editor needs, read from the Coach record and its schema. */
export interface CoachEditForm {
  coachRow: number;
  name: string;
  firstName: string;
  lastName: string;
  maxFirstLen: number;
  maxLastLen: number;
  /** Save Position member. */
  position: string;
  positionOptions: string[];
  teamName: string | null;
  isUser: boolean;
  /** Who holds each other role on the same staff (a role change swaps with them). */
  staff: { position: string; row: number; name: string }[];
  // Base values
  coachPoints: number;
  coachPointsMax: number;
  level: number;
  levelMax: number;
  prestigeScore: number;
  prestigeScoreMax: number;
  /** The save's letter (the game re-derives it from the score). */
  prestigeLetter: string;
  xp: number;
  xpMax: number;
  securityPct: number;
  securityStatus: string;
  /** Percentage ceilings for HotSeat / Low / SafeForNow, from this save's own coaches. */
  securityBands: { hotSeat: number; low: number; safeForNow: number };
  // Profile
  age: number;
  ageMax: number;
  heightIn: number;
  weightLb: number;
  weightMin: number;
  weightMax: number;
  homeState: string;
  homeStateOptions: string[];
  demeanor: string;
  demeanorOptions: string[];
  stance: string;
  stanceOptions: string[];
  hat: string;
  hatOptions: string[];
  bodyType: string;
  bodyTypeOptions: string[];
  // Progression
  /** CoachTalentArcheType value. */
  archetype: number;
  archetypeOptions: { value: number; member: string; name: string }[];
  /** CoachBackstory value; only the three the game names are offered. */
  backstory: number;
  backstoryOptions: { value: number; member: string; name: string }[];
  expertScout: boolean;
  /** Per-slot statuses for the role's tree; null when the coach has no tree in the save. */
  tree: CoachTalentSlotState[] | null;
  targetFileName: string;
  targetExists: boolean;
}

/** Changed values only. */
export interface CoachEditChanges {
  coachRow: number;
  firstName?: string;
  lastName?: string;
  /** New role; the same staff's holder of that role takes this coach's current one. */
  position?: string;
  coachPoints?: number;
  level?: number;
  prestigeScore?: number;
  xp?: number;
  /** 0–100; the status band follows from the save's own bands. */
  securityPct?: number;
  age?: number;
  heightIn?: number;
  weightLb?: number;
  homeState?: string;
  demeanor?: string;
  stance?: string;
  hat?: string;
  bodyType?: string;
  archetype?: number;
  backstory?: number;
  expertScout?: boolean;
  /** Per changed subtree: the node indices that should end up owned. */
  talents?: { slot: number; owned: number[] }[];
}

/** One rostered player changing schools; rows are Team/Player table rows. */
export interface TransferMove {
  playerRow: number;
  fromTeamRow: number;
  toTeamRow: number;
}

export interface TransferRequest {
  moves: TransferMove[];
}

export interface PlayerEditResult {
  ok: boolean;
  message: string;
  /** Full path + file name of the edited save that was written. */
  editedPath?: string;
  editedFileName?: string;
  /** Reportable error code, present when a write failed unexpectedly (logged). */
  code?: string;
}

/**
 * Current values for the program-resource editors (Fundraising / Hire
 * Additional Recruiters), read from the user school's Team row and its
 * recruiting board. Headrooms come from the save schema's field caps.
 */
export interface ResourceForm {
  teamRow: number;
  school: string;
  budget: {
    /** ProgramPointBudget — the season pool NIL offers spend from. */
    total: number;
    remaining: number;
    /** The rollover income line, which a raise rides so pillars keep summing to the total. */
    rollover: number;
    nilSpent: number;
    /** Largest raise the field caps allow right now. */
    headroom: number;
  };
  /** null when the save carries no recruiting board for the school yet. */
  hours: { total: number; assigned: number; headroom: number } | null;
  targetFileName: string;
  targetExists: boolean;
}

export interface ResourceEditRequest {
  kind: 'nil' | 'hours';
  /** Whole points/hours to add; clamped to the form's headroom. */
  amount: number;
}

/** Options + caps for the Create Recruit dialog, all from the save itself. */
export interface CreateRecruitForm {
  maxFirstLen: number;
  maxLastLen: number;
  maxTownLen: number;
  /** position -> archetype ids that exist in this class (template availability). */
  archetypesByPosition: Record<string, string[]>;
  /** PLYR_HOME_STATE enum member ids. */
  states: string[];
  /** state -> the game's own hometowns there, each with its pipeline. */
  cities: Record<string, { town: string; pipeline: string }[]>;
  /** TraitDevelopment enum member ids. */
  devTraits: string[];
  /** Raw Height field range (inches). */
  heightMin: number;
  heightMax: number;
  /** Displayed pounds range (raw field + 160). */
  weightMin: number;
  weightMax: number;
  playerRowsFree: number;
  recruitRowsFree: number;
  /** Gear pickers: the game's loadout vocabulary plus this save's extras. */
  gearSlots: GearSlotOptions[];
  /** Observed skin tones (1–8 in practice). */
  skinTones: number[];
  /** helmet itemAssetName -> facemasks real loadouts wear with it. */
  helmetMasks: Record<string, string[]>;
  /** position -> slot -> the item an unset choice actually keeps. */
  baseLook: Record<string, Record<string, string>>;
  /** position -> the base look's skin tone. */
  baseTones: Record<string, number>;
  /** position -> the base look's body type (0 = Standard when absent). */
  baseBodies: Record<string, number>;
  /** The face catalog: every observed head, each with a portrait and a tone. */
  faces: FaceOption[];
  targetFileName: string;
  targetExists: boolean;
}

/** One selectable face: an observed (head id, asset, portrait) triple + its tone. */
export interface FaceOption {
  /** PLYR_GENERICHEAD enum member. */
  headId: string;
  /** GenericHeadAssetName string, paired as seen on a real player. */
  assetName: string;
  /** PLYR_PORTRAIT id — the headshot the portrait pack serves. */
  portraitId: number;
  /** Skin tone this head is modeled for (1–8), encoded in its asset name. */
  tone: number;
  /** A headshot for portraitId exists in the user's portrait pack. */
  hasShot?: boolean;
}

/** One gear slot's choices, learned from every dressed player in the save. */
export interface GearSlotOptions {
  slot: string;
  label: string;
  options: string[];
}

export interface CreateRecruitRequest {
  firstName: string;
  lastName: string;
  position: string;
  /** PlayerType id — must exist in the class at this position (the template). */
  archetype: string;
  stars: number;
  devTrait: string;
  heightIn: number;
  /** Pounds (the save stores lbs − 160). */
  weightLb: number;
  homeState: string;
  homeTown: string;
  /** 1–7, or 0 to keep the base look's tone. */
  skinTone?: number;
  bodyType?: number;
  /** slot -> itemAssetName overrides; unset slots keep the base loadout. */
  gear?: Record<string, string>;
  /** A face from the catalog; unset keeps the template's head and the generated avatar. */
  face?: FaceOption;
}

/** Stage recruits onto or off the user's target board. */
export interface BoardEditRequest {
  changes: { recruitRow: number; action: 'add' | 'remove' }[];
}

/** The five weekly contact/visit actions the game offers per target. */
export interface TargetActionFlags {
  contactFamily: boolean;
  contactCoaches: boolean;
  socialMedia: boolean;
  sendHouse: boolean;
  visitSchool: boolean;
}

/** Current weekly-action state for one board target, plus caps and options. */
export interface TargetActionForm {
  recruitRow: number;
  name: string;
  position: string;
  stars: number;
  /** Hours assigned to this recruit this week. */
  hours: number;
  /** Per-recruit field cap (7-bit). */
  hoursCap: number;
  poolTotal: number;
  poolAssigned: number;
  actions: TargetActionFlags;
  /** Normalized: None | Revoked | New | Offered | Committed. */
  scholarship: string;
  /** Offers already out on the board (Offered + New + Revoked — pulled offers stay spent). */
  scholarshipsUsed: number;
  /** The game's season cap on team scholarship offers (tuning: 35). */
  scholarshipsCap: number;
  nilOffer: number;
  /** Field cap (10-bit). */
  nilCap: number;
  /** The game's flat per-prospect weekly hour base (tuning). */
  budgetBase: number;
  /** This staff's recruiter-perk bonus total (condition-gated upper bound). */
  budgetBonus: number;
  nilExpectation: number;
  /** RecruitingPitchType member id; 'Invalid' = none selected. */
  swayPitch: string;
  swayOptions: { id: string; name: string }[];
  intel: number;
  intelMax: number;
  /** How many of the game's five scouting passes this intel represents. */
  scoutsDone: number;
  scoutsMax: number;
  /** This staff's scouting-perk bonus total (condition-gated, from the save). */
  scoutBoost: number;
  targetFileName: string;
  targetExists: boolean;
}

/** Changed values only; absent fields stay untouched in the save. */
export interface TargetActionChanges {
  recruitRow: number;
  actions?: Partial<TargetActionFlags>;
  scholarship?: 'Offered' | 'Revoked' | 'None';
  nilOffer?: number;
  swayPitch?: string;
  /** Scouting passes to run this week (each at the game's per-pass price;
   *  multiple passes in one week are legal, up to full intel). */
  scoutPasses?: number;
}

/** Fire (or un-fire) a CPU coach: flips the game's own PendingFire contract state. */
export interface CoachFireRequest {
  coachRow: number;
  /** true restores the Signed state instead. */
  undo: boolean;
}

/**
 * Depth-chart edit: the full new player order for each touched window.
 * Size-preserving — every window keeps its game-defined slot count, so
 * edits are reorders and swaps, never adds or removes.
 */
export interface DepthChartEditRequest {
  changes: { position: string; playerRows: number[] }[];
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
  /** Coach.Portrait id, served as portrait://c<id>; null when the save has none. */
  portrait: number | null;
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
  | 'weeklyAward'
  | 'awardShow'
  | 'awardWin'
  | 'statLine'
  | 'streak'
  | 'draftPick'
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
  /** Template tone the piece was written in (the reporter's voice). */
  tone?: string;
}

export interface Snapshot {
  parsedAt: number;
  fileName: string;
  /**
   * Stable per-dynasty identity (FranchiseUser.TrophyProfileId, minted once at
   * dynasty creation). Keys the media/history/schedule stores so two dynasties
   * sharing a school never cross-contaminate; null when the save lacks one.
   */
  dynastyId: string | null;
  /** Latest completed week's Players of the Week (national + conference). */
  weeklyAwards: WeeklyAward[];
  /** The most recent annual awards show on record; null before the first one. */
  annualAwards: AnnualAwards | null;
  /** Every rivalry series in the save, as team-row pairs — the wire flags rivalry games. */
  rivalries: { a: number; b: number; name: string }[];
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

// --- Program grades editor ---------------------------------------------------

/** How long a written letter survives before the game recomputes it. */
export type GradeLifetime = 'Permanent' | 'Until next week' | 'Until offseason';

export interface GradeEditEntry {
  /** MySchoolTrackingTable field, e.g. AcademicPrestigeGrade. */
  field: string;
  label: string;
  /** Save member id (Aplus … F). */
  grade: string;
  lifetime: GradeLifetime;
}

export interface GradesEditForm {
  school: string;
  grades: GradeEditEntry[];
  /** Letter member ids the schema accepts, best first (Incomplete excluded). */
  gradeOptions: string[];
  /** Team.TeamPrestige: half-star steps, 0–10 = 0–5 stars; re-derived each offseason. */
  prestige: number;
  prestigeMax: number;
  prestigeRank: number;
  targetFileName: string;
  targetExists: boolean;
}

export interface GradesEditChanges {
  /** field -> new letter member id. */
  grades?: Record<string, string>;
  prestige?: number;
}

// --- Instant commit ----------------------------------------------------------

export interface InstantCommitRequest {
  recruitRow: number;
  /** Display name for the result message only. */
  label?: string;
}

// --- Swap commitment ---------------------------------------------------------

export interface CommitSwapRequest {
  recruitRow: number;
  /** Team row (Snapshot.teams[].row) the commitment moves to. */
  toTeamRow: number;
  /** Display name for the result message only. */
  label?: string;
}

// --- Dynasty settings --------------------------------------------------------

export type SettingKind = 'int' | 'bool' | 'enum';

export interface SettingField {
  /** Stable id the write path resolves: `<table>:<row>:<field>`. */
  id: string;
  label: string;
  kind: SettingKind;
  value: number | boolean | string;
  min?: number;
  max?: number;
  /** Enum choices (member id + display label). */
  options?: { id: string; name: string }[];
  /** Read-only: the game fixes it after creation, or the app holds it back. */
  locked?: boolean;
  note?: string;
}

export interface SettingsSection {
  title: string;
  note?: string;
  fields: SettingField[];
}

export interface SettingsGroup {
  key: 'gameplay' | 'xp' | 'league';
  title: string;
  sections: SettingsSection[];
}

export interface DynastySettingsForm {
  groups: SettingsGroup[];
  targetFileName: string;
  targetExists: boolean;
}

export interface DynastySettingsChanges {
  /** field id -> new value. */
  values: Record<string, number | boolean | string>;
}

// --- Facilities editor -------------------------------------------------------

export interface FacilitiesForm {
  school: string;
  /** Team.FacilitiesLevel, 0–4. */
  level: number;
  levelMax: number;
  /** The save's reserved renewal fee for the current level. */
  renewReserved: number;
  /** The five levels as the game defines them (names, costs, slot caps, grade bands). */
  levels: { level: number; name: string; desc: string; cost: number; renewCost: number; slotCap: number; bestGrade: string; worstGrade: string }[];
  /** Equipment the school owns right now (read-only here). */
  equipment: { name: string; effect: string; value: number; cost: number; weeksOwned: number }[];
  /** Current Athletic Facilities letter (member id), for context. */
  grade: string;
  targetFileName: string;
  targetExists: boolean;
}

export interface FacilitiesChanges {
  level: number;
}
