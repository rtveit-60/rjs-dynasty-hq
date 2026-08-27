export type ThemeMode = 'system' | 'light' | 'dark';

export type BrandPack = 'real' | 'parody';

export interface Settings {
  savePath: string | null;
  schoolTeamRow: number | null;
  theme: ThemeMode;
  brandPack: BrandPack;
  portraitsDir: string | null;
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
  homeState: string;
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
  spending: { label: string; points: number }[];
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
  offRunPass: number | null;
  defRunPass: number | null;
  offAggression: number | null;
  defAggression: number | null;
}

export interface TargetSchool {
  name: string;
  influence: number;
  isUser: boolean;
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
  hasVisit: boolean;
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
  row: number;
  name: string;
  position: string;
  stars: number;
  quality: string;
  stage: string;
  classType: string;
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
  } | null;
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
