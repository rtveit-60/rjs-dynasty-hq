import { RECRUITING_TUNABLES } from './recruiting-tunables.ts';

/**
 * Scouting state, the way the save meters it: `RecruitTarget.UnlockedIntelBitfield`
 * is a 14-bit int, one bit per piece of intel, all 14 set when the prospect is
 * fully scouted. Five passes get there (RecruitingTunables.MaxTimesScouted).
 * Which bit uncovers which attribute is the game's own random roll and is not
 * mapped, so the only honest partial read is "n of 5 passes done".
 */
export const INTEL_BITS = 14;
export const INTEL_FULL = (1 << INTEL_BITS) - 1; // 16383
export const SCOUTS_MAX: number = RECRUITING_TUNABLES.maxTimesScouted;

export function popcount(n: number): number {
  let c = 0;
  n >>>= 0;
  while (n) {
    c += n & 1;
    n >>>= 1;
  }
  return c;
}

/** How many of the game's scouting passes this intel level represents. */
export function scoutsDoneFor(intel: number): number {
  const unlocked = popcount(intel & INTEL_FULL);
  if (unlocked >= INTEL_BITS) return SCOUTS_MAX;
  return Math.min(SCOUTS_MAX - 1, Math.floor((unlocked * SCOUTS_MAX) / INTEL_BITS));
}

/** True when every intel bit is set — the game shows the whole sheet. */
export function isFullyScouted(intel: number): boolean {
  return (intel & INTEL_FULL) === INTEL_FULL;
}

/** What the veil needs to know about a recruit (ClassRecruit and RecruitTargetEntry both fit). */
export interface Scoutable {
  scouted: boolean;
  scoutsDone: number;
  isTransfer?: boolean;
}

/**
 * The scouting veil rule (Settings.hideUnscouted): with the veil on, a
 * high-school recruit's sheet is hidden until fully scouted. Portal transfers
 * are open in the game and stay open here; anyone who isn't a recruit (null)
 * is never hidden.
 */
export function veilHides(on: boolean, r: Scoutable | null | undefined): boolean {
  if (!on || !r) return false;
  if (r.isTransfer) return false;
  return !r.scouted;
}
