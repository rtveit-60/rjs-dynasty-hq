/**
 * CFB 27 archetype names, keyed by the save's internal enum.
 *
 * The save carries Madden-lineage identifiers (`QB_FieldGeneral`) while the
 * game shows its own labels (`Pocket Passer`). Anything absent here falls back
 * to a prettified version of the enum, so an unmapped archetype still reads
 * sensibly — it just won't match the game's wording.
 *
 * QB mapping was derived from the rating profiles in the save and confirmed
 * against the game's four names:
 *   FieldGeneral   speed 66.5, break tackle 37.5  → the pure pocket guy
 *   Improviser     best short accuracy, mid speed → creates, throws first
 *   Scrambler      fastest, best deep ball        → the true dual threat
 *   PureScrambler  worst accuracy, best carrying  → a runner who throws
 */
export const ARCHETYPE_LABELS: Record<string, string> = {
  QB_FieldGeneral: 'Pocket Passer',
  QB_Improviser: 'Backfield Creator',
  QB_Scrambler: 'Dual Threat',
  QB_PureScrambler: 'Pure Runner'
};
