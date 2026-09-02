import { BrowserWindow, app, dialog, ipcMain, nativeTheme, net, protocol, shell } from 'electron';
import { pathToFileURL } from 'node:url';
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type {
  AppState,
  DetectedSave,
  GameDirStatus,
  MediaEvent,
  Snapshot,
  ThemeMode,
  WatchStatus
} from '../shared/types.ts';
import { locateGameRoot, validateGameRoot } from './game-locate.ts';
import { initLog, log, logPath, reportError, tailLog } from './log.ts';
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
/** File name of a freshly selected save whose first parse should re-scope to the user's program. */
let pendingAutoDefault: string | null = null;

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
  },
  onParsed: (s) => {
    if (!pendingAutoDefault || s.fileName !== pendingAutoDefault) return;
    pendingAutoDefault = null;
    // Deferred so the rescope starts after the refresh that fired this fully settles.
    setImmediate(() => applyUserSchoolDefault(s));
  }
});

/** Settings changed outside a renderer request (auto-scope) — push, don't wait to be asked. */
function pushSettings(): void {
  win?.webContents.send('settings', getSettings());
}

/**
 * First parse of a newly selected save: scope the dashboard to the user's own
 * program instead of whatever school the previous save left behind. One
 * user-controlled team selects silently. Several drop the scope to null so the
 * school picker asks, with the user's teams listed first — unless the current
 * scope already is one of them. None (spectator save) changes nothing.
 */
function applyUserSchoolDefault(s: Snapshot): void {
  const userRows = s.teams.filter((t) => t.isUserTeam).map((t) => t.row);
  const { savePath, schoolTeamRow } = getSettings();
  if (!savePath || userRows.length === 0) return;
  if (userRows.length === 1) {
    if (userRows[0] === schoolTeamRow) return;
    updateSettings({ schoolTeamRow: userRows[0] });
  } else if (schoolTeamRow != null && userRows.includes(schoolTeamRow)) {
    return;
  } else {
    updateSettings({ schoolTeamRow: null });
  }
  pushSettings();
  void pipeline.rescope(savePath, getSettings().schoolTeamRow);
}

function effectiveTheme(): 'light' | 'dark' {
  const mode = getSettings().theme;
  if (mode === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return mode;
}

const OVERLAY = {
  light: { color: '#fafbfc', symbolColor: '#16181d', height: 44 },
  dark: { color: '#11141a', symbolColor: '#e9ecf2', height: 44 }
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
  // Selecting a different file arms the auto-scope; re-picking the current one must not
  // yank the user off a school they chose to browse. Watcher refreshes never arm it.
  if (getSettings().savePath !== savePath) pendingAutoDefault = basename(savePath);
  updateSettings({ savePath });
  pipeline.reset();
  startWatching(savePath);
  void pipeline.refresh(savePath, getSettings().schoolTeamRow);
}

/**
 * After an edit lands in its _RJsEdited sibling, the dashboard follows that
 * file. Same dynasty, same scope — no auto-scope, no pipeline reset (the
 * cached parse already matches the written content, so the refresh is just a
 * re-extract).
 */
function followEditedSave(editedPath: string): void {
  updateSettings({ savePath: editedPath });
  startWatching(editedPath);
  pushSettings();
  void pipeline.refresh(editedPath, getSettings().schoolTeamRow);
}

/**
 * Every IPC handler goes through this wrapper: a failure is logged with its
 * stack under a stable short code, and the error the renderer sees carries
 * that code so whatever surface shows it gives the user something reportable.
 */
function handle(channel: string, fn: (...args: never[]) => unknown): void {
  ipcMain.handle(channel, async (...args) => {
    try {
      return await (fn as (...a: unknown[]) => unknown)(...args);
    } catch (err) {
      const code = reportError(`ipc:${channel}`, err);
      throw new Error(`[${code}] ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}

/** Where the game lives, as Setup shows it. */
function gameDirStatus(rejected?: string): GameDirStatus {
  const configured = getSettings().gameDir;
  const loc = locateGameRoot(configured);
  return {
    configured,
    root: loc.root,
    source: loc.source,
    settingInvalid: loc.settingInvalid,
    rejected: rejected ?? null
  };
}

/** The copyable report behind Setup's diagnostics: environment + recent log. */
function diagnosticsText(): string {
  const s = getSettings();
  const g = locateGameRoot(s.gameDir);
  return [
    `RJ's Dynasty HQ ${app.getVersion()} (${app.isPackaged ? 'installed' : 'dev'})`,
    `Windows ${process.getSystemVersion()} ${process.arch} · Electron ${process.versions.electron}`,
    `Save: ${s.savePath ? basename(s.savePath) : 'none selected'} · school row ${s.schoolTeamRow ?? '—'}`,
    `Game folder: ${g.root ?? 'not found'}${g.source ? ` (${g.source})` : ''}${
      g.settingInvalid ? ' — configured folder is not a CFB 27 install' : ''
    }`,
    `Watcher: ${status.kind}${status.kind === 'error' ? ` — ${status.message}` : ''}`,
    '',
    '--- recent log ---',
    tailLog(3000).trimEnd()
  ].join('\n');
}

function registerIpc(): void {
  handle('state:get', (): AppState => ({ settings: getSettings(), status, snapshot, media, updateReady }));

  handle('autoupdate:set', (_e, enabled: boolean) => {
    const settings = updateSettings({ autoUpdate: enabled === true });
    if (settings.autoUpdate) startUpdateCheck(); // turning it on checks right away
    return settings;
  });

  handle('update:install', () => installUpdate());

  handle('saves:scan', () => scanSaves());

  handle('save:pick', async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: 'Select a dynasty save',
      defaultPath: defaultSavesDir(),
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0]) return getSettings();
    useSave(result.filePaths[0]);
    return getSettings();
  });

  handle('save:use', (_e, savePath: string) => {
    if (typeof savePath === 'string' && existsSync(savePath)) useSave(savePath);
    return getSettings();
  });

  handle('school:set', async (_e, row: number | null) => {
    updateSettings({ schoolTeamRow: row });
    const { savePath, schoolTeamRow } = getSettings();
    if (savePath) await pipeline.rescope(savePath, schoolTeamRow);
    return getSettings();
  });

  handle('theme:set', (_e, theme: ThemeMode) => {
    updateSettings({ theme });
    applyOverlay();
    return getSettings();
  });

  handle('zoom:set', (_e, scale: number) => {
    const clamped = Math.min(1.5, Math.max(0.7, Number(scale)));
    const settings = updateSettings({ uiScale: Number.isFinite(clamped) ? clamped : 1 });
    applyZoom();
    return settings;
  });

  handle('zoomfit:set', (_e, on: boolean) => {
    const settings = updateSettings({ uiFit: on === true });
    applyZoom();
    return settings;
  });

  handle('save:reveal', () => {
    const { savePath } = getSettings();
    if (savePath) shell.showItemInFolder(savePath);
  });

  // Expanded recruit detail, read on demand from the cached parse — the class is
  // far too large to ship attributes for every prospect in each snapshot.
  handle('recruit:card', (_e, playerRow: number) =>
    Number.isInteger(playerRow) && playerRow >= 0 ? pipeline.recruitCard(playerRow) : null,
  );

  // League stat leaders for Media HQ — one sweep per parse, cached in the pipeline.
  handle('league:leaders', () => pipeline.leagueLeaders());

  // Matchup-tab extras: both schools' season splits, banked prior meetings,
  // and the record book — read on demand from the cached parse.
  handle('matchup:extras', (_e, homeRow: number, awayRow: number) =>
    Number.isInteger(homeRow) && homeRow >= 0 && Number.isInteger(awayRow) && awayRow >= 0
      ? pipeline.matchupExtras(homeRow, awayRow)
      : null,
  );

  // The latest banked season's CFP bracket — the Media HQ bracket tab's
  // fallback before the current season reaches the playoff.
  handle('cfp:banked', () => pipeline.bankedCfpBracket());

  // Attribute search over the recruiting class. Runs against the cached parse,
  // so it is cheap enough to re-run as the user types a threshold.
  handle('recruit:scout', (_e, criteria: unknown) =>
    Array.isArray(criteria) ? pipeline.scout(criteria as never) : [],
  );

  // Pop-up profile for any clicked name (player, coach or school), read on
  // demand from the cached parse — game logs and season splits are far too
  // heavy to ship in the snapshot.
  handle('profile:get', (_e, req: unknown) => {
    const r = req as { kind?: unknown; row?: unknown };
    const kinds = ['player', 'coach', 'school'];
    if (!r || !kinds.includes(String(r.kind)) || !Number.isInteger(r.row) || (r.row as number) < 0) {
      return null;
    }
    return pipeline.profile({ kind: r.kind, row: r.row } as never);
  });

  // Current values + options for the player edit dialog, from the cached parse.
  handle('player:editform', (_e, playerRow: number) => {
    const { savePath } = getSettings();
    if (!Number.isInteger(playerRow) || playerRow < 0 || !savePath) return null;
    return pipeline.editForm(playerRow, savePath, getSettings().portraitsDir);
  });

  // The app's only write path: lands in <save>_RJsEdited (never the original),
  // then the dashboard switches to follow the edited file.
  handle('player:edit', async (_e, changes: unknown) => {
    const c = changes as { playerRow?: unknown };
    const { savePath } = getSettings();
    if (!c || !Number.isInteger(c.playerRow) || (c.playerRow as number) < 0 || !savePath) {
      return { ok: false, message: 'Nothing to edit.' };
    }
    const result = await pipeline.editPlayer(c as never, savePath);
    if (result.ok && result.editedPath) {
      if (result.editedPath !== savePath) followEditedSave(result.editedPath);
      else void pipeline.refresh(savePath, getSettings().schoolTeamRow);
    }
    return result;
  });

  // Current budget/hours for the Fundraising and Hire Recruiters dialogs.
  handle('resource:form', () => {
    const { savePath } = getSettings();
    return savePath ? pipeline.resourceForm(savePath) : null;
  });

  // Fundraising / recruiter hours — the same _RJsEdited write path as player
  // edits, then the dashboard follows the edited file.
  handle('resource:edit', async (_e, req: unknown) => {
    const r = req as { kind?: unknown; amount?: unknown };
    const { savePath } = getSettings();
    if (!savePath || (r?.kind !== 'nil' && r?.kind !== 'hours') || !Number.isInteger(r?.amount)) {
      return { ok: false, message: 'Nothing to apply.' };
    }
    const result = await pipeline.editResource({ kind: r.kind, amount: r.amount as number }, savePath);
    if (result.ok && result.editedPath) {
      if (result.editedPath !== savePath) followEditedSave(result.editedPath);
      else void pipeline.refresh(savePath, getSettings().schoolTeamRow);
    }
    return result;
  });

  // Create-a-recruit: dialog options + the creation write.
  handle('create:form', () => {
    const { savePath } = getSettings();
    return savePath ? pipeline.createForm(savePath, getSettings().portraitsDir) : null;
  });
  handle('create:recruit', async (_e, req: unknown) => {
    const r = req as { firstName?: unknown };
    const { savePath } = getSettings();
    if (!savePath || typeof r?.firstName !== 'string') {
      return { ok: false, message: 'Nothing to create.' };
    }
    const result = await pipeline.createRecruit(r as never, savePath);
    if (result.ok && result.editedPath) {
      if (result.editedPath !== savePath) followEditedSave(result.editedPath);
      else void pipeline.refresh(savePath, getSettings().schoolTeamRow);
    }
    return result;
  });

  // Weekly recruiting plan for one board target: current state + the write.
  handle('target:form', (_e, recruitRow: number) => {
    const { savePath } = getSettings();
    if (!Number.isInteger(recruitRow) || recruitRow < 0 || !savePath) return null;
    return pipeline.targetForm(recruitRow, savePath);
  });
  handle('target:edit', async (_e, req: unknown) => {
    const r = req as { recruitRow?: unknown };
    const { savePath } = getSettings();
    if (!savePath || !Number.isInteger(r?.recruitRow) || (r.recruitRow as number) < 0) {
      return { ok: false, message: 'Nothing to save.' };
    }
    const result = await pipeline.editTarget(r as never, savePath);
    if (result.ok && result.editedPath) {
      if (result.editedPath !== savePath) followEditedSave(result.editedPath);
      else void pipeline.refresh(savePath, getSettings().schoolTeamRow);
    }
    return result;
  });

  // Stage recruits onto or off the user's target board — the _RJsEdited path.
  handle('board:edit', async (_e, req: unknown) => {
    const r = req as { changes?: unknown };
    const { savePath } = getSettings();
    if (!savePath || !Array.isArray(r?.changes) || !r.changes.length) {
      return { ok: false, message: 'Nothing to save.' };
    }
    const result = await pipeline.editBoard({ changes: r.changes as never }, savePath);
    if (result.ok && result.editedPath) {
      if (result.editedPath !== savePath) followEditedSave(result.editedPath);
      else void pipeline.refresh(savePath, getSettings().schoolTeamRow);
    }
    return result;
  });

  // Mark a CPU coach to be fired at season's end (the game's own PendingFire state).
  handle('coach:fire', async (_e, req: unknown) => {
    const r = req as { coachRow?: unknown; undo?: unknown };
    const { savePath } = getSettings();
    if (!savePath || !Number.isInteger(r?.coachRow) || (r.coachRow as number) < 0) {
      return { ok: false, message: 'Nothing to apply.' };
    }
    const result = await pipeline.fireCoach(
      { coachRow: r.coachRow as number, undo: r.undo === true },
      savePath
    );
    if (result.ok && result.editedPath) {
      if (result.editedPath !== savePath) followEditedSave(result.editedPath);
      else void pipeline.refresh(savePath, getSettings().schoolTeamRow);
    }
    return result;
  });

  // View-only browse of another school's full Team HQ, from the cached parse.
  handle('hq:browse', (_e, teamRow: number) => {
    const { savePath } = getSettings();
    if (!Number.isInteger(teamRow) || teamRow < 0 || !savePath) return null;
    return pipeline.browseSchool(teamRow, savePath);
  });

  // Depth-chart reorders/swaps — the same _RJsEdited write path.
  handle('depth:edit', async (_e, req: unknown) => {
    const r = req as { changes?: unknown };
    const { savePath } = getSettings();
    if (!savePath || !Array.isArray(r?.changes) || !r.changes.length) {
      return { ok: false, message: 'Nothing to save.' };
    }
    const result = await pipeline.editDepthChart({ changes: r.changes as never }, savePath);
    if (result.ok && result.editedPath) {
      if (result.editedPath !== savePath) followEditedSave(result.editedPath);
      else void pipeline.refresh(savePath, getSettings().schoolTeamRow);
    }
    return result;
  });

  // Returns the pre-extracted playbook the team runs (formations, plays, alignments,
  // routes): the coach's selected book by its playbook row, falling back to the scheme
  // archetype. null if nothing matches.
  handle(
    'playbook:get',
    (_e, side: 'offense' | 'defense', coachRow: number | null, schemeEnum: string) =>
      side === 'offense' || side === 'defense'
        ? resolvePlaybook(side, typeof coachRow === 'number' ? coachRow : null, String(schemeEnum ?? ''))
        : null,
  );

  // Opens a link in the user's own browser. Allowlisted hosts only.
  handle('open:external', (_e, url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && ['www.civil.gg', 'civil.gg'].includes(parsed.hostname)) {
        void shell.openExternal(parsed.toString());
      }
    } catch {
      // ignore malformed URLs
    }
  });

  // ——— Game install location (Setup) ———

  handle('game:status', () => gameDirStatus());

  handle('game:choose', async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: 'Choose the College Football 27 install folder',
      defaultPath: gameDirStatus().root ?? undefined,
      properties: ['openDirectory']
    });
    const picked = result.filePaths[0];
    if (!picked) return gameDirStatus();
    if (!validateGameRoot(picked)) {
      log.warn('game', 'chosen folder is not a CFB 27 install', { picked });
      return gameDirStatus(picked);
    }
    updateSettings({ gameDir: picked });
    pushSettings();
    log.info('game', 'game folder set', { picked });
    return gameDirStatus();
  });

  handle('game:clear', () => {
    updateSettings({ gameDir: null });
    pushSettings();
    return gameDirStatus();
  });

  // ——— Diagnostics ———

  // Renderer-side failures land in the same log under the same code scheme.
  handle('log:renderer', (_e, p: { message?: unknown; stack?: unknown; area?: unknown }) => {
    const err = new Error(typeof p?.message === 'string' ? p.message : 'unknown renderer error');
    if (typeof p?.stack === 'string') err.stack = p.stack;
    return reportError(`renderer:${typeof p?.area === 'string' ? p.area : 'unknown'}`, err);
  });

  handle('diag:report', () => diagnosticsText());

  handle('diag:logs', () => {
    const p = logPath();
    if (p && existsSync(p)) shell.showItemInFolder(p);
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

/** portrait://<id> serves <portraitsDir>/<id>.(png|jpg|jpeg|webp), read-only.
 *  Player ids are bare numbers; coach ids are c<id> — their own namespace,
 *  since the save's coach portrait ids overlap the player ids. */
function registerPortraitProtocol(): void {
  protocol.handle('portrait', (request) => {
    try {
      const id = new URL(request.url).hostname;
      const dir = getSettings().portraitsDir;
      if (!dir || !/^c?\d+$/.test(id)) return new Response('', { status: 404 });
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

/**
 * The width the interface is designed at. With fit on, the zoom factor tracks
 * window width against this, so a maximized second monitor fills edge to edge
 * and a tucked-away half window shrinks to match; uiScale biases the result.
 */
const ZOOM_BASE_WIDTH = 1380;

function applyZoom(): void {
  if (!win) return;
  const s = getSettings();
  const bias = Number.isFinite(s.uiScale) ? s.uiScale : 1;
  const fit = s.uiFit ? win.getContentBounds().width / ZOOM_BASE_WIDTH : 1;
  const effective = Math.min(1.6, Math.max(0.6, bias * fit));
  win.webContents.setZoomFactor(effective);
  win.webContents.send('ui:zoom', effective);
}

function createWindow(): void {
  const bounds = getSettings().windowBounds;
  win = new BrowserWindow({
    width: bounds?.width ?? 1380,
    height: bounds?.height ?? 880,
    x: bounds?.x,
    y: bounds?.y,
    // Companion-app posture: allow a narrow footprint beside the game or on a
    // second monitor. Layout collapses gracefully well below the old floor.
    minWidth: 720,
    minHeight: 560,
    icon: existsSync(join(app.getAppPath(), 'build/icon.png'))
      ? join(app.getAppPath(), 'build/icon.png')
      : undefined,
    show: false,
    backgroundColor: effectiveTheme() === 'dark' ? '#0b0d11' : '#eef0f3',
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
  // Crash forensics: a dead or hung renderer leaves a trace in the log.
  win.webContents.on('render-process-gone', (_e, details) => {
    log.error('renderer', 'render process gone', details);
  });
  win.on('unresponsive', () => log.warn('window', 'window unresponsive'));
  win.webContents.on('did-finish-load', applyZoom);
  // Zoom tracks the drag frame by frame — a trailing one-frame throttle keeps
  // IPC sane while the window is in motion and still lands on the final size.
  let zoomPending = false;
  win.on('resize', () => {
    if (zoomPending) return;
    zoomPending = true;
    setTimeout(() => {
      zoomPending = false;
      if (win && !win.isMinimized()) applyZoom();
    }, 16);
  });
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
            // HQ_CAPTURE_USESAVE=<path> selects a save mid-run, as the Setup picker
            // would — exercises the new-save auto-scope before the shot.
            const useSaveEnv = process.env['HQ_CAPTURE_USESAVE'];
            if (useSaveEnv) {
              useSave(useSaveEnv);
              await new Promise((r) => setTimeout(r, 12000));
            }
            // Optional scripted steps so a specific UI state can be captured:
            //   HQ_CAPTURE_NAV=RECRUITING  HQ_CAPTURE_CLICK="QB,4★+"
            const navLabel = process.env['HQ_CAPTURE_NAV'];
            if (navLabel) {
              await win!.webContents.executeJavaScript(
                `[...document.querySelectorAll('.nav-item')].find((b) => b.textContent.includes(${JSON.stringify(navLabel)}))?.click()`
              );
              await new Promise((r) => setTimeout(r, 1200));
            }
            // HQ_CAPTURE_BROWSE=<teamRow> browses another school's HQ via the switcher.
            const browseRowEnv = process.env['HQ_CAPTURE_BROWSE'];
            if (browseRowEnv) {
              await win!.webContents.executeJavaScript(
                `(() => {
                  const sel = document.querySelector('select.hq-browse-select');
                  if (!sel) return;
                  const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
                  set.call(sel, ${JSON.stringify(browseRowEnv)});
                  sel.dispatchEvent(new Event('change', { bubbles: true }));
                })()`
              );
              await new Promise((r) => setTimeout(r, 2600));
            }
            for (const label of (process.env['HQ_CAPTURE_CLICK'] ?? '').split(',').filter(Boolean)) {
              // "~8000" between labels sleeps instead of clicking (form loads).
              if (label.trim().startsWith('~')) {
                await new Promise((r) => setTimeout(r, Number(label.trim().slice(1)) || 1000));
                continue;
              }
              // Prefix match tolerates count badges inside the control ("THE WIRE 133").
              await win!.webContents.executeJavaScript(
                `[...document.querySelectorAll('.filter,.tab,.btn,.tk-cap,.tk-menu button,.bd-btn,.fp-choose,.seg,.pb-form,.pb-play')].find((b) => { const t = b.textContent.trim(); return t === ${JSON.stringify(label.trim())} || t.startsWith(${JSON.stringify(label.trim())}); })?.click()`
              );
              await new Promise((r) => setTimeout(r, 700));
            }
            // HQ_CAPTURE_STORY=<n> opens the nth article card's reader.
            const storyN = Number(process.env['HQ_CAPTURE_STORY'] ?? NaN);
            if (Number.isFinite(storyN)) {
              await win!.webContents.executeJavaScript(
                `document.querySelectorAll('.story.openable')[${storyN}]?.click()`
              );
              await new Promise((r) => setTimeout(r, 700));
            }
            // HQ_CAPTURE_POS=<key> picks a position in a board's dropdown (e.g. EDGE).
            const posKey = process.env['HQ_CAPTURE_POS'];
            if (posKey) {
              await win!.webContents.executeJavaScript(
                `(() => {
                  const sel = document.querySelector('select.pos-select');
                  if (!sel) return;
                  const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
                  set.call(sel, ${JSON.stringify(posKey)});
                  sel.dispatchEvent(new Event('change', { bubbles: true }));
                })()`
              );
              await new Promise((r) => setTimeout(r, 700));
            }
            // HQ_CAPTURE_INFO=<n> opens the nth info dot on the page.
            const infoIndex = process.env['HQ_CAPTURE_INFO'];
            if (infoIndex) {
              await win!.webContents.executeJavaScript(
                `document.querySelectorAll('.info-dot')[${Number(infoIndex)}]?.click()`
              );
              await new Promise((r) => setTimeout(r, 500));
            }
            // HQ_CAPTURE_SCROLL=<px> scrolls the content pane before the shot.
            const scrollPx = process.env['HQ_CAPTURE_SCROLL'];
            if (scrollPx) {
              await win!.webContents.executeJavaScript(
                `document.querySelector('.content')?.scrollTo({ top: ${Number(scrollPx) || 0} })`
              );
              await new Promise((r) => setTimeout(r, 400));
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
              // "~8000" between labels sleeps instead of clicking (form loads).
              if (label.trim().startsWith('~')) {
                await new Promise((r) => setTimeout(r, Number(label.trim().slice(1)) || 1000));
                continue;
              }
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
    initLog();
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
