/**
 * Per-prospect weekly hour budget bounds.
 *
 * The budget a prospect's action total is compared against in-game is
 * runtime-computed (a base plus coach recruiter-tree effects) and is stored
 * nowhere in the save or reachable tuning tables. The bounds here are
 * user-verified in-game (2026-08-31): every prospect allows at least 50
 * hours, and none allows more than 65 — the spread between them is the
 * coach's perks. Totals at or under the floor are always legal; between
 * floor and ceiling depends on perks (the dialog flags it); above the
 * ceiling is invalid for everyone and the write path refuses it.
 *
 * Replace with extracted values if the coach talent-tree data ever yields
 * the exact per-prospect computation.
 */
export const PROSPECT_HOURS_FLOOR = 50;
export const PROSPECT_HOURS_CEILING = 65;
