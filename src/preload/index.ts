import { contextBridge, ipcRenderer, webFrame } from 'electron';
import type {
  AppState,
  BrandPack,
  BoardEditRequest,
  CoachEditChanges,
  CoachEditForm,
  CoachFireRequest,
  TransferRequest,
  CreateRecruitForm,
  CreateRecruitRequest,
  DepthChartEditRequest,
  DetectedSave,
  GameDirStatus,
  LeagueLeaders,
  MatchupExtras,
  MediaEvent,
  PlaybookBook,
  PlayerEditChanges,
  PlayerEditForm,
  PlayerEditResult,
  Profile,
  ProfileRequest,
  RecruitCard,
  ResourceEditRequest,
  ResourceForm,
  Settings,
  Snapshot,
  TargetActionChanges,
  GradesEditForm,
  GradesEditChanges,
  InstantCommitRequest,
  DynastySettingsForm,
  DynastySettingsChanges,
  FacilitiesForm,
  FacilitiesChanges,
  TargetActionForm,
  ThemeMode,
  WatchStatus
} from '../shared/types.ts';
import type { ScoutCriterion, ScoutHit } from '../shared/ratings.ts';
import type { CfpBracket } from '../shared/cfp-bracket.ts';

const subscribe = <T>(channel: string) => {
  return (cb: (data: T) => void): (() => void) => {
    const listener = (_e: unknown, data: T) => cb(data);
    ipcRenderer.on(channel, listener as never);
    return () => ipcRenderer.removeListener(channel, listener as never);
  };
};

export interface HQBridge {
  getState: () => Promise<AppState>;
  scanSaves: () => Promise<DetectedSave[]>;
  pickSave: () => Promise<Settings>;
  useSave: (path: string) => Promise<Settings>;
  setSchool: (row: number | null) => Promise<Settings>;
  setTheme: (theme: ThemeMode) => Promise<Settings>;
  setUiScale: (scale: number) => Promise<Settings>;
  setUiFit: (on: boolean) => Promise<Settings>;
  onZoom: (cb: (effective: number) => void) => () => void;
  getZoom: () => number;
  setAutoUpdate: (enabled: boolean) => Promise<Settings>;
  installUpdate: () => Promise<void>;
  onUpdateReady: (cb: (version: string) => void) => () => void;
  revealSave: () => Promise<void>;
  getRecruitCard: (playerRow: number) => Promise<RecruitCard | null>;
  getLeagueLeaders: () => Promise<LeagueLeaders | null>;
  getMatchupExtras: (homeRow: number, awayRow: number) => Promise<MatchupExtras | null>;
  getBankedCfpBracket: () => Promise<CfpBracket | null>;
  getProfile: (req: ProfileRequest) => Promise<Profile | null>;
  getEditForm: (playerRow: number) => Promise<PlayerEditForm | null>;
  editPlayer: (changes: PlayerEditChanges) => Promise<PlayerEditResult>;
  getResourceForm: () => Promise<ResourceForm | null>;
  editResource: (req: ResourceEditRequest) => Promise<PlayerEditResult>;
  editDepthChart: (req: DepthChartEditRequest) => Promise<PlayerEditResult>;
  browseHQ: (teamRow: number) => Promise<Snapshot['school'] | null>;
  fireCoach: (req: CoachFireRequest) => Promise<PlayerEditResult>;
  getCoachEditForm: (coachRow: number) => Promise<CoachEditForm | null>;
  editCoach: (changes: CoachEditChanges) => Promise<PlayerEditResult>;
  transferPlayers: (req: TransferRequest) => Promise<PlayerEditResult>;
  editBoard: (req: BoardEditRequest) => Promise<PlayerEditResult>;
  getCreateForm: () => Promise<CreateRecruitForm | null>;
  createRecruit: (req: CreateRecruitRequest) => Promise<PlayerEditResult>;
  getTargetForm: (recruitRow: number) => Promise<TargetActionForm | null>;
  editTarget: (req: TargetActionChanges) => Promise<PlayerEditResult>;
  getGradesForm: () => Promise<GradesEditForm | null>;
  editGrades: (req: GradesEditChanges) => Promise<PlayerEditResult>;
  instantCommit: (req: InstantCommitRequest) => Promise<PlayerEditResult>;
  getSettingsForm: () => Promise<DynastySettingsForm | null>;
  editSettings: (req: DynastySettingsChanges) => Promise<PlayerEditResult>;
  getFacilitiesForm: () => Promise<FacilitiesForm | null>;
  editFacilities: (req: FacilitiesChanges) => Promise<PlayerEditResult>;
  scoutRecruits: (criteria: ScoutCriterion[]) => Promise<ScoutHit[]>;
  openExternal: (url: string) => Promise<void>;
  gameStatus: () => Promise<GameDirStatus>;
  chooseGameDir: () => Promise<GameDirStatus>;
  clearGameDir: () => Promise<GameDirStatus>;
  reportError: (p: { message: string; stack?: string; area: string }) => Promise<string>;
  getDiagnostics: () => Promise<string>;
  openLogs: () => Promise<void>;
  backupVanillaSaves: () => Promise<{ copied: string[]; skipped: string[]; dir: string }>;
  openVanillaBackups: () => Promise<boolean>;
  getPlaybook: (
    side: 'offense' | 'defense',
    coachRow: number | null,
    schemeEnum: string
  ) => Promise<PlaybookBook | null>;
  onSnapshot: (cb: (s: Snapshot) => void) => () => void;
  onSettings: (cb: (s: Settings) => void) => () => void;
  onStatus: (cb: (s: WatchStatus) => void) => () => void;
  onMedia: (cb: (events: MediaEvent[]) => void) => () => void;
  onSystemTheme: (cb: (t: 'light' | 'dark') => void) => () => void;
}

const bridge: HQBridge = {
  getState: () => ipcRenderer.invoke('state:get'),
  scanSaves: () => ipcRenderer.invoke('saves:scan'),
  pickSave: () => ipcRenderer.invoke('save:pick'),
  useSave: (path) => ipcRenderer.invoke('save:use', path),
  setSchool: (row) => ipcRenderer.invoke('school:set', row),
  setTheme: (theme) => ipcRenderer.invoke('theme:set', theme),
  setUiScale: (scale) => ipcRenderer.invoke('zoom:set', scale),
  setUiFit: (on) => ipcRenderer.invoke('zoomfit:set', on),
  onZoom: subscribe<number>('ui:zoom'),
  getZoom: () => webFrame.getZoomFactor(),
  setAutoUpdate: (enabled) => ipcRenderer.invoke('autoupdate:set', enabled),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateReady: subscribe<string>('update:ready'),
  revealSave: () => ipcRenderer.invoke('save:reveal'),
  getRecruitCard: (playerRow) => ipcRenderer.invoke('recruit:card', playerRow),
  getLeagueLeaders: () => ipcRenderer.invoke('league:leaders'),
  getMatchupExtras: (homeRow, awayRow) => ipcRenderer.invoke('matchup:extras', homeRow, awayRow),
  getBankedCfpBracket: () => ipcRenderer.invoke('cfp:banked'),
  getProfile: (req) => ipcRenderer.invoke('profile:get', req),
  getEditForm: (playerRow) => ipcRenderer.invoke('player:editform', playerRow),
  editPlayer: (changes) => ipcRenderer.invoke('player:edit', changes),
  getResourceForm: () => ipcRenderer.invoke('resource:form'),
  editResource: (req) => ipcRenderer.invoke('resource:edit', req),
  editDepthChart: (req) => ipcRenderer.invoke('depth:edit', req),
  browseHQ: (teamRow) => ipcRenderer.invoke('hq:browse', teamRow),
  fireCoach: (req) => ipcRenderer.invoke('coach:fire', req),
  getCoachEditForm: (coachRow) => ipcRenderer.invoke('coach:editform', coachRow),
  editCoach: (changes) => ipcRenderer.invoke('coach:edit', changes),
  transferPlayers: (req) => ipcRenderer.invoke('roster:transfer', req),
  editBoard: (req) => ipcRenderer.invoke('board:edit', req),
  getCreateForm: () => ipcRenderer.invoke('create:form'),
  createRecruit: (req) => ipcRenderer.invoke('create:recruit', req),
  getTargetForm: (recruitRow) => ipcRenderer.invoke('target:form', recruitRow),
  editTarget: (req) => ipcRenderer.invoke('target:edit', req),
  getGradesForm: () => ipcRenderer.invoke('grades:form'),
  editGrades: (req) => ipcRenderer.invoke('grades:edit', req),
  instantCommit: (req) => ipcRenderer.invoke('recruit:commit', req),
  getSettingsForm: () => ipcRenderer.invoke('settings:form'),
  editSettings: (req) => ipcRenderer.invoke('settings:edit', req),
  getFacilitiesForm: () => ipcRenderer.invoke('facilities:form'),
  editFacilities: (req) => ipcRenderer.invoke('facilities:edit', req),
  scoutRecruits: (criteria) => ipcRenderer.invoke('recruit:scout', criteria),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  gameStatus: () => ipcRenderer.invoke('game:status'),
  chooseGameDir: () => ipcRenderer.invoke('game:choose'),
  clearGameDir: () => ipcRenderer.invoke('game:clear'),
  reportError: (p) => ipcRenderer.invoke('log:renderer', p),
  getDiagnostics: () => ipcRenderer.invoke('diag:report'),
  openLogs: () => ipcRenderer.invoke('diag:logs'),
  backupVanillaSaves: () => ipcRenderer.invoke('vanilla:backup'),
  openVanillaBackups: () => ipcRenderer.invoke('vanilla:open'),
  getPlaybook: (side, coachRow, schemeEnum) =>
    ipcRenderer.invoke('playbook:get', side, coachRow, schemeEnum),
  onSnapshot: subscribe<Snapshot>('snapshot'),
  onSettings: subscribe<Settings>('settings'),
  onStatus: subscribe<WatchStatus>('status'),
  onMedia: subscribe<MediaEvent[]>('media'),
  onSystemTheme: subscribe<'light' | 'dark'>('system-theme')
};

contextBridge.exposeInMainWorld('hq', bridge);
