/**
 * Vanilla save backups: copies of the game's own save files, kept under the
 * app's data folder (never inside the game's saves folder, which the game
 * scans). Two entry points:
 *   - backupVanillaSave(): one file, taken automatically before the app
 *     writes its first `_RJ` copy of it, so the untouched original is
 *     always recoverable even if the game later overwrites the source.
 *   - backupAllVanillaSaves(): every game-written save in the saves folder,
 *     on demand from Setup.
 * Both are content-addressed: a file whose bytes are already backed up is
 * skipped, so repeated runs cost nothing. Reads only; the game's files are
 * never written, moved or locked.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { isEditedSavePath } from './editor.ts';

export const VANILLA_DIR = 'vanilla-saves';

function sha1(path: string): string {
  return createHash('sha1').update(readFileSync(path)).digest('hex');
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/** Hashes of every backup already taken for this save name (recorded in the file name). */
function backedUpHashes(dir: string, name: string): Set<string> {
  const out = new Set<string>();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const m = f.match(/\.([0-9a-f]{8})\.\d{4}-\d{2}-\d{2}T[\d-]+$/);
    if (m && f.startsWith(`${name}.`)) out.add(m[1]);
  }
  return out;
}

export interface VanillaBackupResult {
  /** Backups written this run. */
  copied: string[];
  /** Files skipped because identical bytes were already backed up. */
  skipped: string[];
  dir: string;
}

/** Back up one game-written save; returns the backup path, or null when its bytes are already kept. */
export function backupVanillaSave(savePath: string, userData: string): string | null {
  if (!existsSync(savePath) || isEditedSavePath(savePath)) return null;
  const dir = join(userData, VANILLA_DIR);
  mkdirSync(dir, { recursive: true });
  const name = basename(savePath);
  const hash = sha1(savePath).slice(0, 8);
  if (backedUpHashes(dir, name).has(hash)) return null;
  const target = join(dir, `${name}.${hash}.${stamp()}`);
  copyFileSync(savePath, target);
  return target;
}

/** Back up every game-written save in the folder (the app's own `_RJ` copies are not vanilla). */
export function backupAllVanillaSaves(savesDir: string, userData: string): VanillaBackupResult {
  const dir = join(userData, VANILLA_DIR);
  const result: VanillaBackupResult = { copied: [], skipped: [], dir };
  if (!existsSync(savesDir)) return result;
  for (const f of readdirSync(savesDir)) {
    if (!f.startsWith('DYNASTY-') || isEditedSavePath(f)) continue;
    const full = join(savesDir, f);
    try {
      if (!statSync(full).isFile()) continue;
      const written = backupVanillaSave(full, userData);
      (written ? result.copied : result.skipped).push(f);
    } catch {
      // a file the game is mid-write on is skipped this run; the next run gets it
    }
  }
  return result;
}
