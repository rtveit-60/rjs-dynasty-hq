import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Locating the CFB 27 install. Used by the app (Setup's game-folder setting)
 * and by the dev extraction scripts, so this module must stay free of
 * electron imports — everything here runs under plain node too.
 */

/** The stock Steam location, kept as the last-resort fallback. */
export const GAME_ROOT_FALLBACK =
  'C:/Program Files (x86)/Steam/steamapps/common/College Football 27';

/** Non-Steam storefront locations worth probing before giving up. */
const EXTRA_CANDIDATES = [
  'C:/Program Files/EA Games/College Football 27',
  'C:/Program Files/Electronic Arts/College Football 27'
];

export interface GameLocation {
  /** A validated install root, or null when none was found anywhere. */
  root: string | null;
  source: 'setting' | 'env' | 'default' | 'steam' | null;
  /** True when a configured folder exists in settings but fails validation. */
  settingInvalid: boolean;
}

/** A real install always carries the Frostbite layout at Data/layout.toc. */
export function validateGameRoot(dir: string): boolean {
  try {
    return existsSync(join(dir, 'Data', 'layout.toc'));
  } catch {
    return false;
  }
}

/**
 * Every Steam library the client knows about, from libraryfolders.vdf in the
 * stock client location. Registry-free on purpose: wrong answers here only
 * mean the user browses to the folder by hand.
 */
function steamLibraries(): string[] {
  const vdf = 'C:/Program Files (x86)/Steam/steamapps/libraryfolders.vdf';
  try {
    const raw = readFileSync(vdf, 'utf8');
    const libs: string[] = [];
    for (const m of raw.matchAll(/"path"\s+"([^"]+)"/g)) {
      libs.push(m[1].replace(/\\\\/g, '/'));
    }
    return libs;
  } catch {
    return [];
  }
}

/**
 * Resolve the game root: the user's setting first, then the CFB_GAME_ROOT
 * env override (script convenience), then the stock locations, then every
 * Steam library on the machine. An invalid setting is reported, not obeyed —
 * resolution falls through so a stale folder never blacks out detection.
 */
export function locateGameRoot(preferred?: string | null): GameLocation {
  let settingInvalid = false;
  if (preferred) {
    if (validateGameRoot(preferred)) return { root: preferred, source: 'setting', settingInvalid };
    settingInvalid = true;
  }
  const env = process.env['CFB_GAME_ROOT'];
  if (env && validateGameRoot(env)) return { root: env, source: 'env', settingInvalid };
  for (const dir of [GAME_ROOT_FALLBACK, ...EXTRA_CANDIDATES]) {
    if (validateGameRoot(dir)) return { root: dir, source: 'default', settingInvalid };
  }
  for (const lib of steamLibraries()) {
    const dir = join(lib, 'steamapps', 'common', 'College Football 27').replace(/\\/g, '/');
    if (validateGameRoot(dir)) return { root: dir, source: 'steam', settingInvalid };
  }
  return { root: null, source: null, settingInvalid };
}

/**
 * The app's configured game folder, read straight off the settings file so
 * scripts running under plain node (no electron) honor the Setup choice.
 * The folder name is the electron-builder productName.
 */
export function settingsGameDir(): string | null {
  try {
    const file = join(process.env['APPDATA'] ?? '', "RJ's Dynasty HQ", 'settings.json');
    const raw = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    return typeof raw.gameDir === 'string' && raw.gameDir ? raw.gameDir : null;
  } catch {
    return null;
  }
}
