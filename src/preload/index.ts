import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppState,
  BrandPack,
  DetectedSave,
  MediaEvent,
  PlaybookBook,
  RecruitCard,
  Settings,
  Snapshot,
  ThemeMode,
  WatchStatus
} from '../shared/types.ts';

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
  setAutoUpdate: (enabled: boolean) => Promise<Settings>;
  installUpdate: () => Promise<void>;
  onUpdateReady: (cb: (version: string) => void) => () => void;
  revealSave: () => Promise<void>;
  getRecruitCard: (playerRow: number) => Promise<RecruitCard | null>;
  openExternal: (url: string) => Promise<void>;
  getPlaybook: (
    side: 'offense' | 'defense',
    coachRow: number | null,
    schemeEnum: string
  ) => Promise<PlaybookBook | null>;
  onSnapshot: (cb: (s: Snapshot) => void) => () => void;
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
  setAutoUpdate: (enabled) => ipcRenderer.invoke('autoupdate:set', enabled),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateReady: subscribe<string>('update:ready'),
  revealSave: () => ipcRenderer.invoke('save:reveal'),
  getRecruitCard: (playerRow) => ipcRenderer.invoke('recruit:card', playerRow),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  getPlaybook: (side, coachRow, schemeEnum) =>
    ipcRenderer.invoke('playbook:get', side, coachRow, schemeEnum),
  onSnapshot: subscribe<Snapshot>('snapshot'),
  onStatus: subscribe<WatchStatus>('status'),
  onMedia: subscribe<MediaEvent[]>('media'),
  onSystemTheme: subscribe<'light' | 'dark'>('system-theme')
};

contextBridge.exposeInMainWorld('hq', bridge);
