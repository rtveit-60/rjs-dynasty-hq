import { app } from 'electron';
import { existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Per-dynasty namespaces for the userData stores that outlive a single parse
 * (media state, banked season history, the schedule bank). These were
 * originally keyed by team row alone — or, for schedules, by nothing — so two
 * dynasties sharing a school cross-contaminated each other's feeds and
 * history. Each store now keeps a `d<dynastyId>` subfolder per dynasty, where
 * the id is the save's own FranchiseUser.TrophyProfileId (minted once at
 * dynasty creation; see docs/RESEARCH.md "Dynasty identity"). A save with no
 * readable identity keeps the legacy flat layout, which is the old behavior.
 */
export function stateDir(store: string, dynastyId: string | null): string {
  const base = join(app.getPath('userData'), store);
  const dir = dynastyId ? join(base, `d${dynastyId}`) : base;
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Move one pre-namespacing flat file into the dynasty's folder the first time
 * that dynasty asks for it. Row-keyed files migrate one by one, so leftovers
 * from another dynasty stay in place until their own save claims them.
 * Returns true when a file was adopted just now — callers use that to prune
 * rows the flat file may carry from another dynasty's parses.
 */
export function adoptLegacyFile(store: string, dynastyId: string | null, name: string): boolean {
  if (!dynastyId) return false;
  try {
    const flat = join(app.getPath('userData'), store, name);
    const namespaced = join(stateDir(store, dynastyId), name);
    if (!existsSync(namespaced) && existsSync(flat)) {
      renameSync(flat, namespaced);
      return true;
    }
  } catch {
    // adoption is best-effort — worst case the dynasty starts a fresh file
  }
  return false;
}

/**
 * Move every flat file matching `re` the first time a dynasty claims this
 * store. For files with no dynasty-discriminating key at all (the schedule
 * bank's year files) the first dynasty parsed after the upgrade inherits the
 * lot: the flat bank was written by whichever dynasty parsed last, which on a
 * real install is overwhelmingly the active one. Files for which `drop`
 * returns true are provably another dynasty's — those are deleted instead of
 * moved (their own dynasty rewrites the season live on its next parse).
 * Never re-adopts once the dynasty's folder exists.
 */
export function adoptLegacyDir(
  store: string,
  dynastyId: string | null,
  re: RegExp,
  drop?: (name: string) => boolean
): void {
  if (!dynastyId) return;
  try {
    const base = join(app.getPath('userData'), store);
    const dir = join(base, `d${dynastyId}`);
    if (existsSync(dir)) return;
    mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(base)) {
      if (!re.test(f)) continue;
      try {
        if (drop?.(f)) unlinkSync(join(base, f));
        else renameSync(join(base, f), join(dir, f));
      } catch {
        // per-file best effort
      }
    }
  } catch {
    // adoption is best-effort
  }
}
