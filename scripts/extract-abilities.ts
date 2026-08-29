/**
 * Generate src/shared/physical-abilities.ts from the game's own data.
 *
 * The save stores only a tier per physical-ability slot (PhysicalAbility1..5);
 * the ability each slot refers to is archetype data the game keeps in its
 * franchise-common tuning stores:
 *
 *   PhysicalAbilitiesTable (one row per archetype)
 *     └─ Slot1..5Ability → PositionSignatureAbility ── Ability → SignatureAbility.Name
 *
 * So the name shown in game is a pure (archetype, slot index) lookup — this
 * script walks the chain and emits it as a static table.
 *
 * Usage: node scripts/extract-abilities.ts [--print]
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
  decompressCasBlocksUnknownSize,
} from './fb/frostbite.ts';

const mf: any = (mfModule as any).default ?? mfModule;
const OUT = 'src/shared/physical-abilities.ts';
const printOnly = process.argv.includes('--print');

function refOf(field: any): { tableId: number; row: number } | null {
  const rd = field?.referenceData;
  if (rd && typeof rd.tableId === 'number') return { tableId: rd.tableId, row: rd.rowNumber ?? rd.row ?? 0 };
  const v = field?.value;
  if (typeof v === 'string' && /^[01]{32}$/.test(v)) {
    return { tableId: parseInt(v.slice(0, 15), 2), row: parseInt(v.slice(15), 2) };
  }
  return null;
}

const fieldVal = (rec: any, key: string): any => {
  const f = rec?._fields?.[key];
  return f && 'value' in f ? f.value : undefined;
};

/**
 * String recovery for a tuning-store table (same trick as extract-coach-goals):
 * the lib reads string fields as offsets whose pool base needs solving. Find
 * the pool by locating the table name in the image, then pick the base that
 * makes every row's offset land on a printable, NUL-preceded string start.
 */
function recoverStrings(image: Buffer, table: any, field: string): Map<number, string> {
  const out = new Map<number, string>();
  const nameAt = image.indexOf(Buffer.from(table.name + '\x00'));
  if (nameAt < 0) return out;
  const regionEnd = Math.min(image.length, nameAt + 400000);

  const offsets: { row: number; off: number }[] = [];
  (table.records as any[]).forEach((r, row) => {
    if (r.isEmpty) return;
    const v = Number(fieldVal(r, field));
    if (Number.isFinite(v) && v >= 0) offsets.push({ row, off: v });
  });
  if (!offsets.length) return out;

  const starts: number[] = [];
  for (let p = nameAt; p < regionEnd; p++) {
    if (image[p - 1] === 0 && image[p] >= 0x20 && image[p] < 0x7f && image[p + 1] >= 0x20 && image[p + 1] < 0x7f) {
      starts.push(p);
    }
  }
  const startSet = new Set(starts);
  let best: { base: number; hits: number } | null = null;
  for (const s of starts) {
    const base = s - offsets[0].off;
    if (base < nameAt || base > regionEnd) continue;
    let hits = 0;
    for (const o of offsets) if (startSet.has(base + o.off)) hits++;
    if (!best || hits > best.hits) best = { base, hits };
    if (hits === offsets.length) break;
  }
  if (!best || best.hits < Math.max(2, offsets.length * 0.8)) return out;
  for (const o of offsets) {
    const at = best.base + o.off;
    const end = image.indexOf(0, at);
    const s = image.toString('latin1', at, end < 0 ? at : Math.min(end, at + 100));
    if (/^[\x20-\x7e]+$/.test(s) && s.length) out.set(o.row, s);
  }
  return out;
}

/**
 * The SignatureAbility table's store carries no schema, and the lib's generic
 * guess lands on fractional offsets — inject the real one (from the game's
 * own Franchise-Schemas\SignatureAbility.ftx) exactly like the save-side
 * Coach drift fix: the file's offset table pairs to attributes by index.
 */
const SIG_ATTRS = [
  { name: 'Activator', type: 'int', minValue: '0', maxValue: '2147483647' },
  { name: 'Advanced', type: 'bool' },
  { name: 'Deactivator', type: 'int', minValue: '0', maxValue: '2147483647' },
  { name: 'Description', type: 'string', maxLength: '64' },
  { name: 'GUID', type: 'string', maxLength: '38' },
  { name: 'IconId', type: 'int', minValue: '0', maxValue: '10000' },
  { name: 'MentalAbilityGroup', type: 'int', minValue: '0', maxValue: '255' },
  { name: 'Name', type: 'string', maxLength: '20' },
  { name: 'Passive', type: 'bool' },
  { name: 'UnlockedExternally', type: 'bool' }
];

const layout = loadLayout(GAME_ROOT_DEFAULT);
const toc = parseSuperbundleToc(
  readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32', 'globals.toc'))
);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'abilities-'));

// ---- 1. Tuning store: PositionSignatureAbility (row -> SignatureAbility) + names ----
// ---- 2. League store: PhysicalAbilitiesTable (archetype -> 5 slot refs) ----
interface TuningSide {
  psaTableId: number;
  psaAbilityRow: Map<number, number>; // PSA row -> SignatureAbility row
  names: Map<number, string>; // SignatureAbility row -> Name
  guid: string;
}
interface LeagueSide {
  rows: { archetypeValue: number; slotRefs: number[] }[];
  guid: string;
}

let tuning: TuningSide | null = null;
let league: LeagueSide | null = null;
let storeIdx = 0;

for (const chunk of toc.chunks) {
  if (tuning && league) break;
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
  const tmp = path.join(tmpDir, `s${storeIdx++}.ftc`);
  fs.writeFileSync(tmp, payload);
  let franchise: any;
  try {
    franchise = await (mf.create ?? mf.FranchiseFile?.create)(tmp);
  } catch {
    continue;
  }

  if (!tuning) {
    const psa = (franchise.tables as any[]).find((t: any) => t.name === 'PositionSignatureAbility');
    const sig = (franchise.tables as any[]).find((t: any) => t.name === 'SignatureAbility');
    if (psa && sig) {
      try {
        await psa.readRecords();
        if (sig.header?.numMembers === SIG_ATTRS.length) {
          sig.schema = { name: 'SignatureAbility', attributes: SIG_ATTRS.map((a) => ({ ...a })) };
        }
        await sig.readRecords();
        // With the schema injected the lib decodes strings directly; the
        // pool-recovery path stays as a fallback for numeric offsets.
        const names = new Map<number, string>();
        (sig.records as any[]).forEach((r, row) => {
          if (r.isEmpty) return;
          const v = fieldVal(r, 'Name');
          if (typeof v === 'string' && v.trim() && !/^\d+$/.test(v)) names.set(row, v.trim());
        });
        if (!names.size) for (const [k, v] of recoverStrings(image, sig, 'Name')) names.set(k, v);
        if (names.size >= 40) {
          const sigId = sig.header?.tableId;
          const psaAbilityRow = new Map<number, number>();
          (psa.records as any[]).forEach((r, row) => {
            if (r.isEmpty) return;
            // idx 0 = Ability; the generic schema names it Field_0. The value
            // is a direct (tableId << 17 | row) ref into SignatureAbility.
            const raw = Number(fieldVal(r, 'Field_0') ?? fieldVal(r, 'Ability'));
            if (!Number.isFinite(raw) || raw <= 0) return;
            if (raw >>> 17 !== sigId) return;
            psaAbilityRow.set(row, raw & 0x1ffff);
          });
          if (psaAbilityRow.size >= 100) {
            tuning = { psaTableId: psa.header?.tableId, psaAbilityRow, names, guid: chunk.guid };
          }
        }
      } catch {
        // try the next revision of this store
      }
    }
  }

  if (!league) {
    const pat = (franchise.tables as any[]).find((t: any) => t.name === 'PhysicalAbilitiesTable');
    if (pat) {
      try {
        await pat.readRecords();
        // Generic schema: Field_0 = Archetype (idx 0), Field_6..10 = Slot1..5.
        const rows: LeagueSide['rows'] = [];
        for (const r of pat.records as any[]) {
          if (r.isEmpty) continue;
          const archetypeValue = Number(fieldVal(r, 'Field_0'));
          if (!Number.isFinite(archetypeValue)) continue;
          const slotRefs: number[] = [];
          for (let i = 6; i <= 10; i++) slotRefs.push(Number(fieldVal(r, `Field_${i}`) ?? 0));
          rows.push({ archetypeValue, slotRefs });
        }
        if (rows.length >= 40) league = { rows, guid: chunk.guid };
      } catch {
        // next revision
      }
    }
  }
}

if (!tuning) throw new Error('no tuning store yielded PositionSignatureAbility + SignatureAbility names');
if (!league) throw new Error('no league store yielded a filled PhysicalAbilitiesTable');

// ---- 3. Archetype numeric value -> enum id, from the save's own schema ----
import { loadFranchise, mainTable } from '../src/main/parser/franchise.ts';
const savePath = process.argv.find((a) => !a.startsWith('--') && a.includes('DYNASTY')) ?? 'samples/DYNASTY-DUKETOND-AUTOSAVE';
const save = await loadFranchise(savePath);
const playerT = mainTable(save, 'Player');
await playerT.readRecords(['PlayerType']);
const ptAttr: any = (playerT.schema?.attributes ?? []).find((a: any) => a.name === 'PlayerType');
const members: any[] = ptAttr?.enum?.members ?? ptAttr?.enum?._members ?? [];
const enumById = new Map<number, string>();
for (const m of members) {
  const id = String(m?.name ?? m?._name ?? '');
  const value = Number(m?.value ?? m?._value ?? NaN);
  if (!id || !Number.isFinite(value)) continue;
  if (/(_First_|_Last_|^First_|^Last_|^Count_|^Invalid_$)/.test(id)) continue;
  if (!enumById.has(value)) enumById.set(value, id);
}

const byArchetype = new Map<string, (string | null)[]>();
for (const row of league.rows) {
  const arch = enumById.get(row.archetypeValue);
  if (!arch) continue;
  const slots = row.slotRefs.map((ref) => {
    if (!ref || ref >>> 17 !== tuning!.psaTableId) return null;
    const sigRow = tuning!.psaAbilityRow.get(ref & 0x1ffff);
    return sigRow !== undefined ? (tuning!.names.get(sigRow) ?? null) : null;
  });
  byArchetype.set(arch, slots);
}
if (byArchetype.size < 40) {
  throw new Error(`only ${byArchetype.size} archetypes resolved — mapping incomplete, not writing`);
}
const result = { byArchetype, abilityCount: tuning.names.size, storeGuid: `${league.guid} + ${tuning.guid}` };

console.log(
  `mapped ${result.byArchetype.size} archetypes (store ${result.storeGuid}, ${result.abilityCount} named abilities)`
);
if (printOnly) {
  for (const [arch, slots] of [...result.byArchetype.entries()].sort()) {
    console.log(`  ${arch.padEnd(26)} ${slots.map((s) => s ?? '—').join(' | ')}`);
  }
  process.exit(0);
}

const body = [...result.byArchetype.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([arch, slots]) => `  ${arch}: ${JSON.stringify(slots)},`)
  .join('\n');

fs.writeFileSync(
  OUT,
  `/**
 * CFB 27 physical-ability names per archetype slot, keyed by the save's
 * PlayerType enum.
 *
 * GENERATED by scripts/extract-abilities.ts — do not edit by hand.
 *
 * The save stores only a tier for PhysicalAbility1..5; which ability each
 * slot IS comes from the game's PhysicalAbilitiesTable (one row per
 * archetype, Slot1..5 → PositionSignatureAbility → SignatureAbility.Name).
 * Index i names the save's PhysicalAbility{i+1} slot; null = the game leaves
 * that slot unassigned for the archetype.
 */
export const PHYSICAL_ABILITY_SLOTS: Record<string, (string | null)[]> = {
${body}
};
`,
  'utf8'
);
console.log(`wrote ${OUT}`);
