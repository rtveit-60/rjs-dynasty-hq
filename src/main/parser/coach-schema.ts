/**
 * The bundled C27 schema's Coach definition has 137 attributes, but the save's
 * Coach table header declares 138 members — a title-update added one field the
 * schema doesn't know about, so madden-franchise silently refuses the schema
 * (its setter requires an exact attribute count) and falls back to generic
 * Field_N names, which also breaks string decoding (coach names).
 *
 * Field layout comes from the file's own offset table, paired to schema
 * attributes BY INDEX — so the fix is inserting one pad attribute at the right
 * position. We find that position by scanning candidate insertion points and
 * scoring the decoded records against plausibility oracles (readable names,
 * sane ages, valid team indexes).
 */

const ORACLE_FIELDS = ['FirstName', 'LastName', 'Age', 'TeamIndex', 'Position'];

function looksLikeName(s: unknown): boolean {
  return typeof s === 'string' && /^[A-Za-z][A-Za-z.'\- ]{1,24}$/.test(s.trim());
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
  }
  return score;
}

function snapshotHeader(table: any) {
  const { headerSize, record1Size, table1StartIndex, table2StartIndex } = table.header;
  return { headerSize, record1Size, table1StartIndex, table2StartIndex };
}

function applyCandidate(table: any, def: any, k: number): boolean {
  const clone = { ...def, attributes: [...def.attributes] };
  clone.attributes.splice(k, 0, { name: '__DriftPad', type: 'int', minValue: '0', maxValue: '1' });
  table.schema = clone;
  return !!table.schema && table.schema.attributes.length === table.header.numMembers;
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
  for (let k = def.attributes.length; k >= 0; k--) {
    Object.assign(table.header, baseHeader);
    if (!applyCandidate(table, def, k)) continue;
    try {
      await table.readRecords(ORACLE_FIELDS);
    } catch {
      continue;
    }
    const live = table.records.filter((r: any) => !r.isEmpty).slice(0, 12);
    if (!live.length) continue;
    const score = scoreRecords(live);
    const max = live.length * 5;
    if (!best || score > best.score) best = { k, score };
    if (score === max) break; // perfect — take it
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
