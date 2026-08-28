/**
 * Attribute search across the recruiting class, run in the main process against
 * the already-parsed save. Measured at a few milliseconds per query, so the UI
 * can re-run it on every keystroke without shipping ratings to the renderer.
 */
import { RATING_BY_FIELD, type ScoutCriterion, type ScoutHit } from '../../shared/ratings.ts';
import { isNullRef, mainTable, refFromRecord, val } from './franchise.ts';

/** Never return more than this; a loose threshold can match the whole class. */
const MAX_HITS = 4000;

export async function scoutRecruits(
  franchise: any,
  criteria: ScoutCriterion[]
): Promise<ScoutHit[]> {
  const valid = criteria.filter(
    (c) => RATING_BY_FIELD.has(c.field) && Number.isFinite(c.value)
  );
  if (!valid.length) return [];

  try {
    const playerTable = mainTable(franchise, 'Player');
    const playerTableId = playerTable.header?.tableId ?? -1;

    // Only the fields actually being queried — keeps the read narrow.
    const fields = [...new Set(valid.map((c) => c.field))];
    await playerTable.readRecords(fields);

    // Recruits are Player rows referenced from the Recruit table.
    const recruitTable = mainTable(franchise, 'Recruit');
    await recruitTable.readRecords(['Player']);

    const hits: ScoutHit[] = [];
    for (const rec of recruitTable.records ?? []) {
      if (rec.isEmpty) continue;
      const ref = refFromRecord(rec, 'Player');
      if (isNullRef(ref) || ref.tableId !== playerTableId) continue;
      const p = playerTable.records?.[ref.row];
      if (!p || p.isEmpty) continue;

      const values: Record<string, number> = {};
      let ok = true;
      for (const c of valid) {
        const v = Number(val(p, c.field));
        if (!Number.isFinite(v) || (c.op === 'gte' ? v < c.value : v > c.value)) {
          ok = false;
          break;
        }
        values[c.field] = v;
      }
      if (!ok) continue;

      // Fill in any remaining queried fields so every column has a value.
      for (const f of fields) if (values[f] === undefined) values[f] = Number(val(p, f)) || 0;

      hits.push({ playerRow: ref.row, values });
      if (hits.length >= MAX_HITS) break;
    }
    return hits;
  } catch {
    return [];
  }
}
