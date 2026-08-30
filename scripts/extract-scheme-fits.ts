/**
 * Generate src/shared/scheme-fits.ts from the game's own data.
 *
 * The game defines, per scheme, which archetypes each position wants — the
 * data behind its depth-chart auto-fill and scheme-fit displays. Chain, in
 * the franchise-common tuning store (Win32/globals):
 *
 *   Scheme (19 rows; Field_6 = BaseScheme enum value)
 *     offense (values 1..10): Field_2 → DepthChartOffensivePhilosophy
 *     defense (values 11..19): Field_0 → DepthChartDefensivePhilosophy
 *       └─ per-position ref (QB/WR/…/SS/CB) → DepthChartPositionPhilosophy[]
 *            └─ one row per depth slot: { Importance, PlayerType }
 *
 * The BaseScheme value → identifier join comes from the save schema's own
 * enum (Team.CurrentOffensiveScheme), so nothing is guessed. The per-scheme
 * slot counts double as the game's depth-chart window sizes and are emitted
 * alongside the fits. BaseScheme value 0 (OFF_WEST_COAST_ZONE_RUN) has no
 * Scheme row in the store — teams running it get no fit data, and the app
 * shows a hyphen.
 *
 * Usage: node scripts/extract-scheme-fits.ts [save] [--print]
 * Needs the installed game and any CFB 27 save. Run after title updates;
 * never hand-edit the output.
 */
import * as mfModule from 'madden-franchise';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  GAME_ROOT_DEFAULT,
  loadLayout,
  readTocPayload,
  parseSuperbundleToc,
  readRawCasBytes,
  decompressCasBlocksUnknownSize
} from './fb/frostbite.ts';

const mf: any = (mfModule as any).default ?? mfModule;
const OUT = 'src/shared/scheme-fits.ts';
const savePath = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : 'samples/DYNASTY-DUKETOND-AUTOSAVE';
const printOnly = process.argv.includes('--print');

const V = (rec: any, key: string): any => {
  const f = rec?._fields?.[key];
  return f && 'value' in f ? f.value : undefined;
};
const binRef = (v: unknown): { tid: number; row: number } | null =>
  typeof v === 'string' && /^[01]{32}$/.test(v)
    ? { tid: parseInt(v.slice(0, 15), 2), row: parseInt(v.slice(15), 2) }
    : typeof v === 'number' && v > (1 << 17)
      ? { tid: v >>> 17, row: v & 0x1ffff }
      : null;

// ---- 1. save schema: BaseScheme value -> identifier ----
const save = await (mf.create ?? mf.FranchiseFile?.create)(savePath);
const teamT = (save.tables as any[])
  .filter((t: any) => t?.name === 'Team')
  .sort((a: any, b: any) => (b.header?.recordCapacity ?? 0) - (a.header?.recordCapacity ?? 0))[0];
await teamT.readRecords(['CurrentOffensiveScheme']);
const attr: any = (teamT.schema?.attributes ?? []).find((a: any) => a.name === 'CurrentOffensiveScheme');
const members: any[] = attr?.enum?._members ?? attr?.enum?.members ?? [];
const schemeIdByValue = new Map<number, string>();
for (const m of members) {
  const id = String(m?._name ?? m?.name ?? '');
  const value = Number(m?._value ?? m?.value ?? NaN);
  if (!id || !Number.isFinite(value)) continue;
  // The real identifiers are the OFF_/DEF_ ones; skip range markers/aliases.
  if (!/^(OFF|DEF)_/.test(id)) continue;
  if (!schemeIdByValue.has(value)) schemeIdByValue.set(value, id);
}
if (schemeIdByValue.size < 15) throw new Error('BaseScheme enum not found in save schema');

// ---- 2. tuning store: Scheme -> philosophy -> position slots ----
const layout = loadLayout(GAME_ROOT_DEFAULT);
const toc = parseSuperbundleToc(
  readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32', 'globals.toc'))
);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scheme-fits-'));
let storeIdx = 0;

interface SlotPref {
  archetype: string;
  importance: number;
}
/** scheme id -> position -> per-depth-slot preferred archetype. */
let fits: Map<string, Map<string, SlotPref[]>> | null = null;
let storeGuid = '';

for (const chunk of toc.chunks) {
  if (fits) break;
  let payload: Buffer;
  try {
    payload = await decompressCasBlocksUnknownSize(layout, readRawCasBytes(layout, chunk.location));
  } catch {
    continue;
  }
  if (payload.length < 4 || payload[0] !== 0x78) continue;
  let image: Buffer;
  try {
    image = zlib.inflateSync(payload);
  } catch {
    continue;
  }
  if (image.subarray(0, 4).toString('latin1') !== 'FrTk') continue;
  if (!image.includes(Buffer.from('DepthChartPositionPhilosophy'))) continue;
  const tmp = path.join(tmpDir, `s${storeIdx++}.ftc`);
  fs.writeFileSync(tmp, payload);
  let store: any;
  try {
    store = await (mf.create ?? mf.FranchiseFile?.create)(tmp);
  } catch {
    continue;
  }

  const byId = new Map<number, any>();
  for (const t of store.tables as any[]) if (t?.header?.tableId !== undefined) byId.set(t.header.tableId, t);
  const read = async (tid: number): Promise<any | null> => {
    const t = byId.get(tid);
    if (!t) return null;
    try {
      if (!t.recordsRead) await t.readRecords();
    } catch {
      return null;
    }
    return t;
  };

  const scheme = (store.tables as any[]).find(
    (t: any) => t.name === 'Scheme' && (t.header?.recordCapacity ?? 0) >= 19
  );
  if (!scheme) continue;
  try {
    await scheme.readRecords();
  } catch {
    continue;
  }

  const result = new Map<string, Map<string, SlotPref[]>>();
  for (const row of (scheme.records as any[]).filter((r: any) => !r.isEmpty)) {
    const value = Number(V(row, 'Field_6'));
    const id = schemeIdByValue.get(value);
    if (!id) continue;
    // Offense rows carry their philosophy in Field_2, defense in Field_0.
    const philRef = binRef(Number(V(row, id.startsWith('OFF_') ? 'Field_2' : 'Field_0')));
    if (!philRef) continue;
    const philT = await read(philRef.tid);
    const phil = philT?.records?.[philRef.row];
    if (!phil || !/Philosophy/.test(philT.name)) continue;

    const positions = new Map<string, SlotPref[]>();
    for (const posKey of Object.keys(phil._fields ?? {})) {
      if (/Threshold/.test(posKey)) continue;
      const arrRef = binRef(V(phil, posKey));
      if (!arrRef) continue;
      const arrT = await read(arrRef.tid);
      const arr = arrT?.records?.[arrRef.row];
      if (!arr) continue;
      const slots: SlotPref[] = [];
      for (const slotKey of Object.keys(arr._fields ?? {})) {
        const slotRef = binRef(V(arr, slotKey));
        if (!slotRef) continue;
        const slotT = await read(slotRef.tid);
        const slot = slotT?.records?.[slotRef.row];
        if (!slot) continue;
        const archetype = String(V(slot, 'PlayerType') ?? '');
        const importance = Number(V(slot, 'Importance') ?? 0);
        if (archetype && archetype !== 'Invalid_') slots.push({ archetype, importance });
      }
      if (slots.length) positions.set(posKey, slots);
    }
    if (positions.size) result.set(id, positions);
  }
  if (result.size >= 17) {
    fits = result;
    storeGuid = chunk.guid;
  }
}
if (!fits) throw new Error('scheme philosophy chain not decodable in any tuning store');

// Anchors that must hold; a title update that moves them should fail loudly.
const anchor34 = fits.get('DEF_BASE3_4')?.get('SS');
if (!anchor34?.some((s) => s.archetype === 'S_RunSupport' && s.importance === 70)) {
  throw new Error(`anchor DEF_BASE3_4.SS → ${JSON.stringify(anchor34)}`);
}
if (!(fits.get('OFF_AIR_RAID')?.get('WR')?.length)) {
  throw new Error('anchor OFF_AIR_RAID.WR is empty');
}

// Every extracted archetype must exist in the app's archetype space — a miss
// means the two generated modules drifted apart across a title update.
const { ARCHETYPE_LABELS } = await import('../src/shared/archetypes.ts');
const unknown = new Set<string>();
for (const positions of fits.values()) {
  for (const slots of positions.values()) {
    for (const s of slots) if (!(s.archetype in ARCHETYPE_LABELS)) unknown.add(s.archetype);
  }
}
if (unknown.size) {
  throw new Error(`archetypes missing from shared/archetypes.ts: ${[...unknown].join(', ')}`);
}

const schemeKeys = [...fits.keys()].sort();
const lines: string[] = [];
lines.push('/**');
lines.push(" * The game's scheme→archetype preferences: for every scheme, each position's");
lines.push(' * per-depth-slot preferred archetype and its importance weight — the data');
lines.push(" * behind the game's own depth-chart auto-fill and scheme fit.");
lines.push(' *');
lines.push(' * GENERATED by scripts/extract-scheme-fits.ts — do not edit by hand.');
lines.push(' *');
lines.push(" * Keyed by the save schema's BaseScheme identifiers (Team.Current*Scheme).");
lines.push(' * Slot order is the depth order (slot 0 = the starter), so the array length');
lines.push(" * is also the scheme's depth-chart window for that position. BaseScheme");
lines.push(' * value 0 (OFF_WEST_COAST_ZONE_RUN) has no data in the game store.');
lines.push(' */');
lines.push('export interface SchemeSlotPref {');
lines.push('  /** PlayerType enum member, same space as Player.PlayerType. */');
lines.push('  archetype: string;');
lines.push('  importance: number;');
lines.push('}');
lines.push('');
lines.push('export const SCHEME_FITS: Record<string, Record<string, SchemeSlotPref[]>> = {');
for (const k of schemeKeys) {
  const positions = fits.get(k)!;
  const posKeys = [...positions.keys()].sort();
  lines.push(`  ${k}: {`);
  for (const p of posKeys) {
    const slots = positions
      .get(p)!
      .map((s) => `{ archetype: ${JSON.stringify(s.archetype)}, importance: ${s.importance} }`)
      .join(', ');
    lines.push(`    ${p}: [${slots}],`);
  }
  lines.push('  },');
}
lines.push('};');
lines.push('');
lines.push('/**');
lines.push(" * How strongly a scheme wants this archetype at this position: the highest");
lines.push(' * importance across the depth slots naming it, 0 when the scheme never asks');
lines.push(' * for it (or the scheme/position is unknown).');
lines.push(' */');
lines.push('export function schemeFitImportance(scheme: string, position: string, archetype: string): number {');
lines.push('  const slots = SCHEME_FITS[scheme]?.[position];');
lines.push('  if (!slots) return 0;');
lines.push('  let best = 0;');
lines.push('  for (const s of slots) if (s.archetype === archetype && s.importance > best) best = s.importance;');
lines.push('  return best;');
lines.push('}');
lines.push('');

const out = lines.join('\n');
if (printOnly) console.log(out);
else {
  fs.writeFileSync(OUT, out, 'utf8');
  console.log(`${OUT}: ${schemeKeys.length} schemes written (store ${storeGuid})`);
}
for (const k of schemeKeys) {
  const positions = fits.get(k)!;
  const summary = [...positions.entries()].map(([p, slots]) => `${p}×${slots.length}`).join(' ');
  console.log(`  ${k.padEnd(24)} ${summary}`);
}
