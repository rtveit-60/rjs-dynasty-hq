/**
 * Wording for the AD's seasonal goals, keyed by the save's goal reference.
 *
 * The goals themselves (`Team.HCContractGoal1..3`) are references into the
 * game's asset files, not the save — the same wall `Team.City` hits. The refs
 * ARE stable identifiers though: the same goal draws the same id for every team
 * and every season, so a goal only has to be identified once, by eye, and it
 * then renders correctly forever after.
 *
 * Key format: `<assetTable>:<row>`, with the 0x4000 asset flag stripped from the
 * table id — exactly what `goalRefId()` in extract.ts produces. Roughly 76
 * distinct goals appear league-wide, so this table fills in over time.
 *
 * To add one: read the goal text off the in-game coach contract screen, run
 * `npm run parse:check` to print your team's three goal ids in order, and add
 * the pairs here. Unmapped goals still show their status — just not the wording.
 */
export const COACH_GOAL_LABELS: Record<string, string> = {
  // '99:118472': 'Win 9 games',
};
