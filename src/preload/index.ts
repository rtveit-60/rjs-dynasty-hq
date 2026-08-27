import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppState,
  BrandPack,
  DetectedSave,
  MediaEvent,
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
  setBrandPack: (pack: BrandPack) => Promise<Settings>;
  pickPortraits: () => Promise<{ settings: Settings; count: number }>;
  clearPortraits: () => Promise<{ settings: Settings; count: number }>;
  countPortraits: () => Promise<number>;
  revealSave: () => Promise<void>;
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
  setBrandPack: (pack) => ipcRenderer.invoke('brand:set', pack),
  pickPortraits: () => ipcRenderer.invoke('portraits:pick'),
  clearPortraits: () => ipcRenderer.invoke('portraits:clear'),
  countPortraits: () => ipcRenderer.invoke('portraits:count'),
  revealSave: () => ipcRenderer.invoke('save:reveal'),
  onSnapshot: subscribe<Snapshot>('snapshot'),
  onStatus: subscribe<WatchStatus>('status'),
  onMedia: subscribe<MediaEvent[]>('media'),
  onSystemTheme: subscribe<'light' | 'dark'>('system-theme')
};

contextBridge.exposeInMainWorld('hq', bridge);
