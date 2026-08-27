import * as mfModule from 'madden-franchise';

// The library ships as ESM with both a default export object and named exports.
const mf: any = (mfModule as any).default ?? mfModule;

export interface Ref {
  tableId: number;
  row: number;
}

export async function loadFranchise(filePath: string): Promise<any> {
  const create = mf.create ?? mf.FranchiseFile?.create;
  if (typeof create !== 'function') {
    throw new Error('madden-franchise: create() not found — unexpected library version');
  }
  const franchise = await create(filePath);
  const year = Number(franchise?.settings?.gameYear ?? franchise?.gameYear ?? NaN);
  if (!Number.isNaN(year) && year !== 27) {
    throw new Error(`This file is a game-year ${year} save — RJ's Dynasty HQ supports College Football 27 dynasty saves.`);
  }
  return franchise;
}

export function tablesByName(franchise: any, name: string): any[] {
  return (franchise.tables as any[]).filter((t) => t?.name === name);
}

/** Table names repeat in the save; the "main" instance is the one with the largest capacity. */
export function mainTable(franchise: any, name: string): any {
  const candidates = tablesByName(franchise, name);
  if (!candidates.length) throw new Error(`Table not found in save: ${name}`);
  return candidates.sort(
    (a, b) => (b.header?.recordCapacity ?? 0) - (a.header?.recordCapacity ?? 0)
  )[0];
}

export async function readTable(table: any, fields?: string[]): Promise<any> {
  await table.readRecords(fields && fields.length ? fields : undefined);
  return table;
}

export function recordHasField(rec: any, key: string): boolean {
  return !!rec?._fields && key in rec._fields;
}

/** Among same-named tables, find the instance whose records actually carry the given field. */
export async function tableWithField(franchise: any, name: string, field: string): Promise<any | null> {
  for (const t of tablesByName(franchise, name)) {
    try {
      await t.readRecords();
    } catch {
      continue;
    }
    const rec = t.records?.find((r: any) => !r.isEmpty) ?? t.records?.[0];
    if (rec && recordHasField(rec, field)) return t;
  }
  return null;
}

export function val(rec: any, key: string): any {
  const f = rec?._fields?.[key];
  if (f && 'value' in f) return f.value;
  const direct = rec?.[key];
  return typeof direct === 'object' ? undefined : direct;
}

function refFromBinary(bin: unknown): Ref | null {
  if (typeof bin !== 'string' || !/^[01]{32}$/.test(bin)) return null;
  return { tableId: parseInt(bin.slice(0, 15), 2), row: parseInt(bin.slice(15), 2) };
}

function refFromFieldObject(f: any): Ref | null {
  if (!f) return null;
  const rd = f.referenceData;
  if (rd && typeof rd.tableId === 'number') {
    return { tableId: rd.tableId, row: rd.rowNumber ?? rd.row ?? 0 };
  }
  return refFromBinary(f.value);
}

export function refFromRecord(rec: any, key: string): Ref | null {
  return refFromFieldObject(rec?._fields?.[key]);
}

export function isNullRef(r: Ref | null): r is null {
  return !r || (r.tableId === 0 && r.row === 0);
}

export async function tableById(franchise: any, id: number): Promise<any | null> {
  const t =
    franchise.getTableById?.(id) ??
    (franchise.tables as any[]).find((x) => x?.header?.tableId === id) ??
    null;
  if (t && !t.recordsRead) {
    try {
      await t.readRecords();
    } catch {
      return null;
    }
  }
  return t;
}

/** Ordered non-null refs held by an array-table record. */
export function refsFromArrayRecord(rec: any): Ref[] {
  const fields: any[] = rec?.fieldsArray ?? Object.values(rec?._fields ?? {});
  const size = typeof rec?.arraySize === 'number' ? rec.arraySize : fields.length;
  const out: Ref[] = [];
  for (const f of fields.slice(0, size)) {
    const r = refFromFieldObject(f);
    if (r && !(r.tableId === 0 && r.row === 0)) out.push(r);
  }
  return out;
}
