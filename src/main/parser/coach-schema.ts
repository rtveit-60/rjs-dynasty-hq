/**
 * The bundled C27 schema's Coach definition has 137 attributes, but the save's
 * Coach table header declares 138 members — a title-update added one field the
 * schema doesn't know about, so madden-franchise silently refuses the schema
 * (its setter requires an exact attribute count) and falls back to generic
 * Field_N names, which also breaks string decoding (coach names).
 *
 * Field layout comes from the file's own offset table, paired to schema
 * attributes BY INDEX — so the fix is inserting one attribute at the right
 * position. The missing member is known: `LeagueJobMotivation` (a 3-bit enum:
 * CFBHigh / CFBLow / Neutral / NFLLow / NFLHigh) sits between `IsNIL` and
 * `Name` in the game's own Core-Schemas — with it there every one of the 138
 * file offsets has the width its attribute type demands, on both save eras.
 * We try that position first and prove it with plausibility oracles on fields
 * from BOTH sides of the insertion (names, ages, team indexes before it; the
 * denormalized display `Name` and `YearsCoaching` after it). Only if the known
 * position fails do we fall back to scanning every insertion point.
 *
 * Getting this wrong is silent: an earlier version stopped its scan at the
 * first index whose pre-pad fields decoded, which parked the pad at the end and
 * misassigned every attribute past index 128 (`Name`, `YearsCoaching`,
 * `SeasonStartJobSecurityStatus`, `SpecialtyType`) while the rest read fine.
 */

export const COACH_DRIFT_FIELD = 'LeagueJobMotivation';
const DRIFT_BEFORE = 'Name';

const ORACLE_FIELDS = ['FirstName', 'LastName', 'Age', 'TeamIndex', 'Position', 'Name', 'YearsCoaching'];
const ORACLE_MAX = 7;

function looksLikeName(s: unknown): boolean {
  return typeof s === 'string' && /^[A-Za-z][A-Za-z.,'\- ]{1,24}$/.test(s.trim()); // "T. Harris, Jr."
}

function fieldVal(rec: any, key: string): any {
  const f = rec?._fields?.[key];
  return f && 'value' in f ? f.value : rec?.[key];
}

function scoreRecords(records: any[]): number {
  let score = 0;
  for (const r of records) {
    if (looksLikeName(fieldVal(r, 'FirstName'))) score++;
    if (looksLikeName(fieldVal(r, 'LastName'))) score++;
    const ti = Number(fieldVal(r, 'TeamIndex'));
    if (Number.isInteger(ti) && ti >= -1 && ti <= 400) score++;
    const age = Number(fieldVal(r, 'Age'));
    if (age >= 22 && age <= 90) score++;
    const pos = String(fieldVal(r, 'Position') ?? '');
    if (/Coach|Coordinator/.test(pos)) score++;
    // Past the insertion: the display name ("R. Tveit") and a career length.
    if (looksLikeName(fieldVal(r, 'Name'))) score++;
    const yrs = Number(fieldVal(r, 'YearsCoaching'));
    if (Number.isInteger(yrs) && yrs >= 0 && yrs <= 60) score++;
  }
  return score;
}

function snapshotHeader(table: any) {
  const { headerSize, record1Size, table1StartIndex, table2StartIndex } = table.header;
  return { headerSize, record1Size, table1StartIndex, table2StartIndex };
}

function applyCandidate(table: any, def: any, k: number): boolean {
  const clone = { ...def, attributes: [...def.attributes] };
  clone.attributes.splice(k, 0, { name: COACH_DRIFT_FIELD, type: 'int', minValue: '0', maxValue: '7' });
  table.schema = clone;
  return !!table.schema && table.schema.attributes.length === table.header.numMembers;
}

/** Score one insertion point; null when the layout can't even be read. */
async function scoreCandidate(table: any, def: any, baseHeader: any, k: number): Promise<{ score: number; max: number } | null> {
  Object.assign(table.header, baseHeader);
  if (!applyCandidate(table, def, k)) return null;
  try {
    await table.readRecords(ORACLE_FIELDS);
  } catch {
    return null;
  }
  const live = table.records.filter((r: any) => !r.isEmpty).slice(0, 12);
  if (!live.length) return null;
  return { score: scoreRecords(live), max: live.length * ORACLE_MAX };
}

/** Returns true when the table ends up with a usable (named) schema. */
export async function ensureCoachSchema(franchise: any, table: any): Promise<boolean> {
  if (table.__driftFixDone) return true;
  if (table.schema?.attributes?.some((a: any) => a.name === 'FirstName')) {
    table.__driftFixDone = true;
    return true; // schema matched normally
  }
  const def = franchise.schemaList?.schemaMap?.[table.name];
  if (!def?.attributes) return false;

  const num = table.header.numMembers;
  const baseHeader = snapshotHeader(table);

  if (def.attributes.length === num) {
    table.schema = def;
    table.__driftFixDone = !!table.schema;
    return table.__driftFixDone;
  }
  if (def.attributes.length !== num - 1) return false; // only single-field drift is handled

  let best: { k: number; score: number } | null = null;

  // The known insertion point first: a perfect oracle on both sides settles it.
  const known = def.attributes.findIndex((a: any) => a.name === DRIFT_BEFORE);
  if (known >= 0) {
    const r = await scoreCandidate(table, def, baseHeader, known);
    if (r) best = { k: known, score: r.score };
    if (r && r.score === r.max) {
      Object.assign(table.header, baseHeader);
      if (applyCandidate(table, def, known)) {
        table.__driftFixDone = true;
        return true;
      }
    }
  }

  // Fallback: scan every insertion point and keep the best-scoring layout.
  for (let k = def.attributes.length; k >= 0; k--) {
    if (k === known) continue;
    const r = await scoreCandidate(table, def, baseHeader, k);
    if (!r) continue;
    if (!best || r.score > best.score) best = { k, score: r.score };
    if (r.score === r.max) break; // perfect — take it
  }

  Object.assign(table.header, baseHeader);
  if (best && applyCandidate(table, def, best.k)) {
    table.__driftFixDone = true;
    return true;
  }
  // Leave the table in the generic state rather than half-applied.
  (table as any)._schema = undefined;
  return false;
}
