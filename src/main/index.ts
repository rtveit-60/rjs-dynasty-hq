import { BrowserWindow, app, dialog, ipcMain, nativeTheme, net, protocol, shell } from 'electron';
import { pathToFileURL } from 'node:url';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AppState,
  BrandPack,
  DetectedSave,
  MediaEvent,
  Snapshot,
  ThemeMode,
  WatchStatus
} from '../shared/types.ts';
import { ESPN_TEAMS_URL, matchTeams, parseEspnDirectory, slugName } from './logos.ts';
import { Pipeline } from './pipeline.ts';
import { getSettings, updateSettings } from './settings.ts';
import { checkForUpdates, installUpdate } from './updater.ts';
import { watchSaveFile } from './watcher.ts';

let win: BrowserWindow | null = null;
let stopWatch: (() => void) | null = null;

let status: WatchStatus = { kind: 'idle' };
let snapshot: Snapshot | null = null;
let media: MediaEvent[] = [];
let updateReady: string | null = null;

function startUpdateCheck(): void {
  checkForUpdates(getSettings().autoUpdate, (version) => {
    updateReady = version;
    win?.webContents.send('update:ready', version);
  });
}

const pipeline = new Pipeline({
  onSnapshot: (s) => {
    snapshot = s;
    win?.webContents.send('snapshot', s);
  },
  onStatus: (s) => {
    status = s;
    win?.webContents.send('status', s);
  },
  onMedia: (events) => {
    media = events;
    win?.webContents.send('media', events);
  }
});

function effectiveTheme(): 'light' | 'dark' {
  const mode = getSettings().theme;
  if (mode === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return mode;
}

const OVERLAY = {
  light: { color: '#f4f2ee', symbolColor: '#22211f', height: 44 },
  dark: { color: '#101214', symbolColor: '#e9e7e2', height: 44 }
};

function applyOverlay(): void {
  win?.setTitleBarOverlay?.(OVERLAY[effectiveTheme()]);
}

function defaultSavesDir(): string {
  return join(app.getPath('documents'), 'EA SPORTS College Football 27', 'saves');
}

function scanSaves(): DetectedSave[] {
  const dir = defaultSavesDir();
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((f) => f.startsWith('DYNASTY-'))
      .map((f) => {
        const full = join(dir, f);
        return {
          path: full,
          name: f.replace(/^DYNASTY-/, ''),
          modified: statSync(full).mtimeMs,
          isAutosave: f.endsWith('-AUTOSAVE')
        };
      })
      .sort((a, b) => b.modified - a.modified);
  } catch {
    return [];
  }
}

function startWatching(savePath: string): void {
  stopWatch?.();
  stopWatch = watchSaveFile(savePath, () => {
    void pipeline.refresh(savePath, getSettings().schoolTeamRow);
  });
}

function useSave(savePath: string): void {
  updateSettings({ savePath });
  pipeline.reset();
  startWatching(savePath);
  void pipeline.refresh(savePath, getSettings().schoolTeamRow);
}

function registerIpc(): void {
  ipcMain.handle('state:get', (): AppState => ({ settings: getSettings(), status, snapshot, media, updateReady }));

  ipcMain.handle('brand:set', (_e, pack: BrandPack) => {
    return updateSettings({ brandPack: pack === 'parody' ? 'parody' : 'real' });
  });

  ipcMain.handle('logos:import', async () => {
    const result = await importLogos();
    return { ...result, cached: countLogos() };
  });

  ipcMain.handle('logos:status', () => ({ cached: countLogos(), dir: getSettings().logosDir }));

  ipcMain.handle('logos:pickDir', async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: 'Select a logo pack folder',
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths[0]) updateSettings({ logosDir: result.filePaths[0] });
    return getSettings();
  });

  ipcMain.handle('logos:clearDir', () => updateSettings({ logosDir: null }));

  ipcMain.handle('autoupdate:set', (_e, enabled: boolean) => {
    const settings = updateSettings({ autoUpdate: enabled === true });
    if (settings.autoUpdate) startUpdateCheck(); // turning it on checks right away
    return settings;
  });

  ipcMain.handle('update:install', () => installUpdate());

  ipcMain.handle('saves:scan', () => scanSaves());

  ipcMain.handle('save:pick', async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: 'Select a dynasty save',
      defaultPath: defaultSavesDir(),
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) return getSettings();
    useSave(result.filePaths[0]);
    return getSettings();
  });

  ipcMain.handle('save:use', (_e, savePath: string) => {
    if (typeof savePath === 'string' && existsSync(savePath)) useSave(savePath);
    return getSettings();
  });

  ipcMain.handle('school:set', async (_e, row: number | null) => {
    updateSettings({ schoolTeamRow: row });
    const { savePath, schoolTeamRow } = getSettings();
    if (savePath) await pipeline.rescope(savePath, schoolTeamRow);
    return getSettings();
  });

  ipcMain.handle('theme:set', (_e, theme: ThemeMode) => {
    updateSettings({ theme });
    applyOverlay();
    return getSettings();
  });

  ipcMain.handle('save:reveal', () => {
    const { savePath } = getSettings();
    if (savePath) shell.showItemInFolder(savePath);
  });

  ipcMain.handle('portraits:pick', async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: 'Select a portrait pack folder',
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths[0]) {
      updateSettings({ portraitsDir: result.filePaths[0] });
    }
    return { settings: getSettings(), count: countPortraits() };
  });

  ipcMain.handle('portraits:clear', () => {
    updateSettings({ portraitsDir: null });
    return { settings: getSettings(), count: 0 };
  });

  ipcMain.handle('portraits:count', () => countPortraits());
}

const PORTRAIT_FILE = /^(\d+)\.(png|jpe?g|webp)$/i;

function countPortraits(): number {
  const dir = getSettings().portraitsDir;
  if (!dir || !existsSync(dir)) return 0;
  try {
    return readdirSync(dir).filter((f) => PORTRAIT_FILE.test(f)).length;
  } catch {
    return 0;
  }
}

const logoCacheDir = () => join(app.getPath('userData'), 'logos');

function countLogos(): number {
  try {
    return readdirSync(logoCacheDir()).filter((f) => /^\d+\.png$/.test(f)).length;
  } catch {
    return 0;
  }
}

/** logo://<teamRow> — local logo pack first (by school name), then the imported cache. */
function registerLogoProtocol(): void {
  protocol.handle('logo', (request) => {
    try {
      const row = new URL(request.url).hostname;
      if (!/^\d+$/.test(row)) return new Response('', { status: 404 });
      const dir = getSettings().logosDir;
      if (dir) {
        const team = snapshot?.teams.find((t) => t.row === Number(row));
        if (team) {
          for (const ext of ['png', 'svg', 'jpg', 'jpeg', 'webp']) {
            const file = join(dir, `${slugName(team.longName)}.${ext}`);
            if (existsSync(file)) return net.fetch(pathToFileURL(file).toString());
          }
        }
      }
      const cached = join(logoCacheDir(), `${row}.png`);
      if (existsSync(cached)) return net.fetch(pathToFileURL(cached).toString());
    } catch {
      // fall through to 404
    }
    return new Response('', { status: 404 });
  });
}

/** One-time, user-triggered logo import: match school names against ESPN's public
 *  team directory and cache each mark locally. The app never fetches again. */
async function importLogos(): Promise<{ matched: number; total: number; misses: string[] }> {
  if (!snapshot?.teams.length) throw new Error('Load a dynasty save first.');
  const res = await net.fetch(ESPN_TEAMS_URL);
  if (!res.ok) throw new Error(`Team directory request failed (${res.status}).`);
  const espn = parseEspnDirectory(await res.json());
  const ours = snapshot.teams.map((t) => ({ row: t.row, longName: t.longName, nickName: t.nickName }));
  const { matches, misses } = matchTeams(ours, espn);
  mkdirSync(logoCacheDir(), { recursive: true });
  let done = 0;
  const queue = [...matches];
  const workers = Array.from({ length: 6 }, async () => {
    for (;;) {
      const m = queue.shift();
      if (!m) return;
      try {
        const r = await net.fetch(m.url);
        if (!r.ok) continue;
        writeFileSync(join(logoCacheDir(), `${m.row}.png`), Buffer.from(await r.arrayBuffer()));
        done++;
      } catch {
        // skip this school; fallback initials remain
      }
    }
  });
  await Promise.all(workers);
  return { matched: done, total: ours.filter((t) => !t.longName.startsWith('FCS ')).length, misses };
}

/** portrait://<id> serves <portraitsDir>/<id>.(png|jpg|jpeg|webp), read-only. */
function registerPortraitProtocol(): void {
  protocol.handle('portrait', (request) => {
    try {
      const id = new URL(request.url).hostname;
      const dir = getSettings().portraitsDir;
      if (!dir || !/^\d+$/.test(id)) return new Response('', { status: 404 });
      for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
        const file = join(dir, `${id}.${ext}`);
        if (existsSync(file)) return net.fetch(pathToFileURL(file).toString());
      }
    } catch {
      // fall through to 404
    }
    return new Response('', { status: 404 });
  });
}

function createWindow(): void {
  const bounds = getSettings().windowBounds;
  win = new BrowserWindow({
    width: bounds?.width ?? 1380,
    height: bounds?.height ?? 880,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 1080,
    minHeight: 700,
    icon: existsSync(join(app.getAppPath(), 'build/icon.png'))
      ? join(app.getAppPath(), 'build/icon.png')
      : undefined,
    show: false,
    backgroundColor: effectiveTheme() === 'dark' ? '#101214' : '#f4f2ee',
    titleBarStyle: 'hidden',
    titleBarOverlay: OVERLAY[effectiveTheme()],
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.once('ready-to-show', () => win?.show());
  win.on('close', () => {
    if (win && !win.isMaximized()) updateSettings({ windowBounds: win.getBounds() });
  });
  win.on('closed', () => {
    win = null;
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }

  // Dev-only self-screenshot hooks for automated UI verification.
  const capturePath = process.env['HQ_CAPTURE'];
  const captureAllDir = process.env['HQ_CAPTURE_ALL'];
  if (capturePath || captureAllDir) {
    const depthPath = process.env['HQ_CAPTURE_DEPTH'];
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          if (captureAllDir) {
            const tabCount = await win!.webContents.executeJavaScript(
              `document.querySelectorAll('.tab').length`
            );
            for (let i = 0; i < Number(tabCount ?? 0); i++) {
              await win!.webContents.executeJavaScript(
                `document.querySelectorAll('.tab')[${i}]?.click()`
              );
              await new Promise((r) => setTimeout(r, 800));
              const image = await win!.webContents.capturePage();
              writeFileSync(join(captureAllDir, `tab-${i}.png`), image.toPNG());
            }
            for (const navLabel of ['RECRUITING', 'DYNASTY MEDIA']) {
              await win!.webContents.executeJavaScript(
                `[...document.querySelectorAll('.nav-item')].find((b) => b.textContent.includes('${navLabel}'))?.click()`
              );
              await new Promise((r) => setTimeout(r, 1400));
              const image = await win!.webContents.capturePage();
              writeFileSync(
                join(captureAllDir, `nav-${navLabel.toLowerCase().replace(/\s+/g, '-')}.png`),
                image.toPNG()
              );
            }
          } else if (capturePath) {
            const image = await win!.webContents.capturePage();
            writeFileSync(capturePath, image.toPNG());
            if (depthPath) {
              await win!.webContents.executeJavaScript(
                `document.querySelectorAll('.tab')[1]?.click()`
              );
              await new Promise((r) => setTimeout(r, 900));
              const depthImage = await win!.webContents.capturePage();
              writeFileSync(depthPath, depthImage.toPNG());
            }
          }
        } finally {
          app.quit();
        }
      }, 4500);
    });
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  nativeTheme.on('updated', () => {
    if (getSettings().theme === 'system') {
      applyOverlay();
      win?.webContents.send('system-theme', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
    }
  });

  void app.whenReady().then(() => {
    registerPortraitProtocol();
    registerLogoProtocol();
    registerIpc();
    createWindow();
    startUpdateCheck();
    const { savePath, schoolTeamRow } = getSettings();
    if (savePath && existsSync(savePath)) {
      startWatching(savePath);
      void pipeline.refresh(savePath, schoolTeamRow);
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
