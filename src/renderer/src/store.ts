import { create } from 'zustand';
import type {
  DetectedSave,
  MediaEvent,
  ProfileRequest,
  Settings,
  Snapshot,
  ThemeMode,
  WatchStatus
} from '../../shared/types.ts';

export type NavKey = 'team' | 'recruiting' | 'media' | 'carousel' | 'setup';

interface HQStore {
  ready: boolean;
  settings: Settings | null;
  status: WatchStatus;
  snapshot: Snapshot | null;
  media: MediaEvent[];
  updateReady: string | null;
  systemDark: boolean;
  nav: NavKey;
  detectedSaves: DetectedSave[];
  /** The zoom factor actually applied (fit x bias), for the rail readout. */
  effectiveZoom: number;
  /** Open profile pop-ups, oldest first — click a name inside one and it stacks. */
  profileStack: ProfileRequest[];

  init: () => Promise<void>;
  setNav: (nav: NavKey) => void;
  openProfile: (req: ProfileRequest) => void;
  backProfile: () => void;
  closeProfiles: () => void;
  pickSave: () => Promise<void>;
  useSave: (path: string) => Promise<void>;
  refreshDetected: () => Promise<void>;
  setSchool: (row: number | null) => Promise<void>;
  setTheme: (theme: ThemeMode) => Promise<void>;
  setUiScale: (scale: number) => Promise<void>;
  setUiFit: (on: boolean) => Promise<void>;
  setAutoUpdate: (enabled: boolean) => Promise<void>;
}

let initialized = false;

export const useHQ = create<HQStore>((set, get) => ({
  ready: false,
  settings: null,
  status: { kind: 'idle' },
  snapshot: null,
  media: [],
  updateReady: null,
  systemDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
  nav: 'team',
  detectedSaves: [],
  effectiveZoom: 1,
  profileStack: [],

  init: async () => {
    if (initialized) return;
    initialized = true;
    window.hq.onSnapshot((snapshot) => set({ snapshot }));
    // Main can change settings on its own (new-save auto-scope) — mirror those too.
    window.hq.onSettings((settings) => set({ settings }));
    window.hq.onStatus((status) => set({ status }));
    window.hq.onMedia((media) => set({ media }));
    window.hq.onUpdateReady((updateReady) => set({ updateReady }));
    window.hq.onSystemTheme((t) => set({ systemDark: t === 'dark' }));
    window.hq.onZoom((effectiveZoom) => set({ effectiveZoom }));
    const state = await window.hq.getState();
    set({ ...state, ready: true, effectiveZoom: window.hq.getZoom() });
    if (!state.settings.savePath) void get().refreshDetected();
  },

  setNav: (nav) => set({ nav }),

  openProfile: (req) =>
    set((s) => {
      const top = s.profileStack[s.profileStack.length - 1];
      if (top && top.kind === req.kind && top.row === req.row) return s;
      return { profileStack: [...s.profileStack, req] };
    }),
  backProfile: () => set((s) => ({ profileStack: s.profileStack.slice(0, -1) })),
  closeProfiles: () => set({ profileStack: [] }),

  pickSave: async () => {
    const settings = await window.hq.pickSave();
    set({ settings });
  },

  useSave: async (path) => {
    const settings = await window.hq.useSave(path);
    set({ settings });
  },

  refreshDetected: async () => {
    set({ detectedSaves: await window.hq.scanSaves() });
  },

  setSchool: async (row) => {
    const settings = await window.hq.setSchool(row);
    set({ settings });
  },

  setTheme: async (theme) => {
    const settings = await window.hq.setTheme(theme);
    set({ settings });
  },

  setUiScale: async (scale) => {
    const settings = await window.hq.setUiScale(scale);
    set({ settings });
  },

  setUiFit: async (on) => {
    const settings = await window.hq.setUiFit(on);
    set({ settings });
  },

  setAutoUpdate: async (enabled) => {
    const settings = await window.hq.setAutoUpdate(enabled);
    set({ settings });
  }
}));

export function useEffectiveTheme(): 'light' | 'dark' {
  const mode = useHQ((s) => s.settings?.theme ?? 'system');
  const systemDark = useHQ((s) => s.systemDark);
  if (mode === 'system') return systemDark ? 'dark' : 'light';
  return mode;
}
