import { useHQ } from '../store.ts';
import { SCOUTS_MAX, veilHides, type Scoutable } from '../../../shared/scouting.ts';

/**
 * The scouting veil (Setup > Immersion). With it on, a high-school recruit's
 * ratings, overall, dev trait, abilities and gem/bust flag stay hidden until
 * your program has run all five scouting passes on them, the way the game
 * shows the board. Portal transfers are open in the game and stay open here.
 *
 * Everything below is presentation only: the snapshot still carries the
 * values, the views just decline to show them.
 */
export type { Scoutable };

/** True when the veil is switched on in Setup. */
export function useVeilOn(): boolean {
  return useHQ((s) => s.settings?.hideUnscouted === true);
}

/** Whether this recruit's sheet is hidden under the current setting (rule in shared/scouting). */
export const veiled = veilHides;

/**
 * Scouting state for a player row, looked up in the class list of the user's
 * own program (so it's always your board's intel, whatever HQ is being
 * browsed). Null for anyone who isn't a recruit.
 */
export function useRecruitScout(playerRow: number): Scoutable | null {
  // The selector hands back the snapshot's own recruit object (a stable
  // reference), never a fresh literal — a new object per call would re-render
  // without end under useSyncExternalStore.
  return useHQ(
    (s) => s.snapshot?.school?.recruiting?.recruits.find((x) => x.playerRow === playerRow) ?? null
  );
}

export function veilTitle(r: Scoutable): string {
  return `Hidden until fully scouted · ${r.scoutsDone} of ${SCOUTS_MAX} scouting passes done`;
}

/**
 * The placeholder that stands in for a hidden value: a short "n/5" plate for
 * table cells (compact) or a spelled-out chip for card and profile headers.
 */
export function Veiled({ r, compact, className }: { r: Scoutable; compact?: boolean; className?: string }) {
  return (
    <span className={`veil ${compact ? 'compact' : ''} ${className ?? ''}`} title={veilTitle(r)}>
      {compact ? `${r.scoutsDone}/${SCOUTS_MAX}` : `Unscouted · ${r.scoutsDone}/${SCOUTS_MAX}`}
    </span>
  );
}
