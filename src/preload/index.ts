import { contextBridge, ipcRenderer, webFrame } from 'electron';
import type {
  AppState,
  BrandPack,
  BoardEditRequest,
  CoachFireRequest,
  DepthChartEditRequest,
  DetectedSave,
  LeagueLeaders,
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
  ThemeMode,
  WatchStatus
} from '../shared/types.ts';
import type { ScoutCriterion, ScoutHit } from '../shared/ratings.ts';

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
  getProfile: (req: ProfileRequest) => Promise<Profile | null>;
  getEditForm: (playerRow: number) => Promise<PlayerEditForm | null>;
  editPlayer: (changes: PlayerEditChanges) => Promise<PlayerEditResult>;
  getResourceForm: () => Promise<ResourceForm | null>;
  editResource: (req: ResourceEditRequest) => Promise<PlayerEditResult>;
  editDepthChart: (req: DepthChartEditRequest) => Promise<PlayerEditResult>;
  browseHQ: (teamRow: number) => Promise<Snapshot['school'] | null>;
  fireCoach: (req: CoachFireRequest) => Promise<PlayerEditResult>;
  editBoard: (req: BoardEditRequest) => Promise<PlayerEditResult>;
  scoutRecruits: (criteria: ScoutCriterion[]) => Promise<ScoutHit[]>;
  openExternal: (url: string) => Promise<void>;
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
  getProfile: (req) => ipcRenderer.invoke('profile:get', req),
  getEditForm: (playerRow) => ipcRenderer.invoke('player:editform', playerRow),
  editPlayer: (changes) => ipcRenderer.invoke('player:edit', changes),
  getResourceForm: () => ipcRenderer.invoke('resource:form'),
  editResource: (req) => ipcRenderer.invoke('resource:edit', req),
  editDepthChart: (req) => ipcRenderer.invoke('depth:edit', req),
  browseHQ: (teamRow) => ipcRenderer.invoke('hq:browse', teamRow),
  fireCoach: (req) => ipcRenderer.invoke('coach:fire', req),
  editBoard: (req) => ipcRenderer.invoke('board:edit', req),
  scoutRecruits: (criteria) => ipcRenderer.invoke('recruit:scout', criteria),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  getPlaybook: (side, coachRow, schemeEnum) =>
    ipcRenderer.invoke('playbook:get', side, coachRow, schemeEnum),
  onSnapshot: subscribe<Snapshot>('snapshot'),
  onSettings: subscribe<Settings>('settings'),
  onStatus: subscribe<WatchStatus>('status'),
  onMedia: subscribe<MediaEvent[]>('media'),
  onSystemTheme: subscribe<'light' | 'dark'>('system-theme')
};

contextBridge.exposeInMainWorld('hq', bridge);
