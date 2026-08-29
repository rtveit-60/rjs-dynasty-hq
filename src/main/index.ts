import { BrowserWindow, app, dialog, ipcMain, nativeTheme, net, protocol, shell } from 'electron';
import { pathToFileURL } from 'node:url';
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AppState,
  DetectedSave,
  MediaEvent,
  Snapshot,
  ThemeMode,
  WatchStatus
} from '../shared/types.ts';
import { slugName } from './logos.ts';
import { resolvePlaybook } from './playbooks.ts';
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

  // Expanded recruit detail, read on demand from the cached parse — the class is
  // far too large to ship attributes for every prospect in each snapshot.
  ipcMain.handle('recruit:card', (_e, playerRow: number) =>
    Number.isInteger(playerRow) && playerRow >= 0 ? pipeline.recruitCard(playerRow) : null,
  );

  // Attribute search over the recruiting class. Runs against the cached parse,
  // so it is cheap enough to re-run as the user types a threshold.
  ipcMain.handle('recruit:scout', (_e, criteria: unknown) =>
    Array.isArray(criteria) ? pipeline.scout(criteria as never) : [],
  );

  // Pop-up profile for any clicked name (player, coach or school), read on
  // demand from the cached parse — game logs and season splits are far too
  // heavy to ship in the snapshot.
  ipcMain.handle('profile:get', (_e, req: unknown) => {
    const r = req as { kind?: unknown; row?: unknown };
    const kinds = ['player', 'coach', 'school'];
    if (!r || !kinds.includes(String(r.kind)) || !Number.isInteger(r.row) || (r.row as number) < 0) {
      return null;
    }
    return pipeline.profile({ kind: r.kind, row: r.row } as never);
  });

  // Returns the pre-extracted playbook the team runs (formations, plays, alignments,
  // routes): the coach's selected book by its playbook row, falling back to the scheme
  // archetype. null if nothing matches.
  ipcMain.handle(
    'playbook:get',
    (_e, side: 'offense' | 'defense', coachRow: number | null, schemeEnum: string) =>
      side === 'offense' || side === 'defense'
        ? resolvePlaybook(side, typeof coachRow === 'number' ? coachRow : null, String(schemeEnum ?? ''))
        : null,
  );

  // Opens a link in the user's own browser. Allowlisted hosts only.
  ipcMain.handle('open:external', (_e, url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && ['www.civil.gg', 'civil.gg'].includes(parsed.hostname)) {
        void shell.openExternal(parsed.toString());
      }
    } catch {
      // ignore malformed URLs
    }
  });

}

/** Bundled logo set: resources/logos in dev, resources/logos next to the asar when packaged. */
function bundledLogoDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'logos')
    : join(app.getAppPath(), 'resources', 'logos');
}

/** logo://<teamRow> — an optional local override folder first, then the bundled set. */
function registerLogoProtocol(): void {
  protocol.handle('logo', (request) => {
    try {
      const row = new URL(request.url).hostname;
      if (!/^\d+$/.test(row)) return new Response('', { status: 404 });
      const team = snapshot?.teams.find((t) => t.row === Number(row));
      if (!team) return new Response('', { status: 404 });
      const slug = slugName(team.longName);
      const overrideDir = getSettings().logosDir;
      const dirs = overrideDir ? [overrideDir, bundledLogoDir()] : [bundledLogoDir()];
      for (const dir of dirs) {
        for (const ext of ['png', 'svg', 'jpg', 'jpeg', 'webp']) {
          const file = join(dir, `${slug}.${ext}`);
          if (existsSync(file)) return net.fetch(pathToFileURL(file).toString());
        }
      }
    } catch {
      // fall through to 404
    }
    return new Response('', { status: 404 });
  });
}

/** Bundled bowl logos: resources/bowl-logos, alongside the team logo set. */
function bundledBowlLogoDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'bowl-logos')
    : join(app.getAppPath(), 'resources', 'bowl-logos');
}

/**
 * bowl://<assetName> — the bowl's logo from the bundled set. The host is the
 * save's AssetName (e.g. "Rose_Bowl"), so it survives sponsor renames.
 */
function registerBowlProtocol(): void {
  protocol.handle('bowl', (request) => {
    try {
      const raw = decodeURIComponent(new URL(request.url).hostname);
      // Host only, no separators — never let a URL walk out of the bundle.
      if (!/^[A-Za-z0-9_.-]+$/.test(raw) || raw.includes('..')) {
        return new Response('', { status: 404 });
      }
      for (const ext of ['png', 'svg', 'webp']) {
        const file = join(bundledBowlLogoDir(), `${raw}.${ext}`);
        if (existsSync(file)) return net.fetch(pathToFileURL(file).toString());
      }
    } catch {
      // fall through to 404
    }
    return new Response('', { status: 404 });
  });
}

/**
 * gameicon://<name> — UI icon textures extracted from the user's own game
 * install by `node scripts/extract-game-icons.ts`. The folder is gitignored
 * (EA's art stays out of the repo); the renderer falls back to drawn marks
 * when an icon is missing.
 */
function bundledGameIconDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'game-icons')
    : join(app.getAppPath(), 'resources', 'game-icons');
}

function registerGameIconProtocol(): void {
  protocol.handle('gameicon', (request) => {
    try {
      const name = decodeURIComponent(new URL(request.url).hostname);
      if (!/^[a-z0-9-]+$/.test(name)) return new Response('', { status: 404 });
      const file = join(bundledGameIconDir(), `${name}.png`);
      if (existsSync(file)) return net.fetch(pathToFileURL(file).toString());
    } catch {
      // fall through to 404
    }
    return new Response('', { status: 404 });
  });
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
            // Optional scripted steps so a specific UI state can be captured:
            //   HQ_CAPTURE_NAV=RECRUITING  HQ_CAPTURE_CLICK="QB,4★+"
            const navLabel = process.env['HQ_CAPTURE_NAV'];
            if (navLabel) {
              await win!.webContents.executeJavaScript(
                `[...document.querySelectorAll('.nav-item')].find((b) => b.textContent.includes(${JSON.stringify(navLabel)}))?.click()`
              );
              await new Promise((r) => setTimeout(r, 1200));
            }
            for (const label of (process.env['HQ_CAPTURE_CLICK'] ?? '').split(',').filter(Boolean)) {
              await win!.webContents.executeJavaScript(
                `[...document.querySelectorAll('.filter,.tab,.btn')].find((b) => b.textContent.trim() === ${JSON.stringify(label.trim())})?.click()`
              );
              await new Promise((r) => setTimeout(r, 700));
            }
            // HQ_CAPTURE_ROW=<n> expands the nth table row (for detail cards).
            const rowIndex = process.env['HQ_CAPTURE_ROW'];
            if (rowIndex) {
              await win!.webContents.executeJavaScript(
                `document.querySelectorAll('.tbl tbody tr')[${Number(rowIndex)}]?.click()`
              );
              await new Promise((r) => setTimeout(r, 900));
            }
            // HQ_CAPTURE_NAME=<n> clicks the nth clickable name (opens its profile).
            const nameIndex = process.env['HQ_CAPTURE_NAME'];
            if (nameIndex) {
              await win!.webContents.executeJavaScript(
                `document.querySelectorAll('.name-link')[${Number(nameIndex)}]?.click()`
              );
              await new Promise((r) => setTimeout(r, 1800));
            }
            // HQ_CAPTURE_NAME2=<n> clicks a name inside the open pop-up (stacks a second profile).
            const nameIndex2 = process.env['HQ_CAPTURE_NAME2'];
            if (nameIndex2) {
              await win!.webContents.executeJavaScript(
                `document.querySelectorAll('.pf-panel .name-link')[${Number(nameIndex2)}]?.click()`
              );
              await new Promise((r) => setTimeout(r, 1800));
            }
            // HQ_CAPTURE_PFCLICK="‹,‹" clicks pop-up buttons by text, in order.
            for (const label of (process.env['HQ_CAPTURE_PFCLICK'] ?? '').split(',').filter(Boolean)) {
              await win!.webContents.executeJavaScript(
                `[...document.querySelectorAll('.pf-panel button')].find((b) => b.textContent.trim() === ${JSON.stringify(label.trim())})?.click()`
              );
              await new Promise((r) => setTimeout(r, 400));
            }
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
    registerBowlProtocol();
    registerGameIconProtocol();
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
