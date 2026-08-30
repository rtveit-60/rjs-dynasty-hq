/**
 * Generate src/shared/mental-abilities.ts from the game's own data.
 *
 * The save stores each player's mental abilities as MentalAbilities enum
 * values (MentalAbility1..3). The save schema's member identifiers have
 * drifted from what the game shows — RoadFanFavorite displays as "Road Dog",
 * HomeFanFavorite as "Fan Favorite", DBRally as "Legion", HotHead as
 * "Rollercoaster" — so display names must come from the game, mapped by enum
 * value, never prettified from the identifier.
 *
 * Sources in the franchise-common tuning store (Win32/globals):
 *   - MentalAbilitiesEnumTableEntry: Field_3 = enum value, Field_2 = the
 *     game's canonical ability key ("RoadDog", "Legion", ...).
 *   - SignatureAbility: Name/Description display strings (schema injected,
 *     same fix as extract-abilities.ts).
 * Display name resolution per enum member: SignatureAbility.Name whose
 * de-spaced form matches the canonical key; else one matching the save
 * identifier itself (catches WinningTime → "Winning Time", where the
 * canonical key "DynamicPersonality" has no SignatureAbility row); else the
 * canonical key split on case boundaries. Provenance is recorded per entry.
 *
 * Usage: node scripts/extract-mental-abilities.ts [save] [--print]
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
const OUT = 'src/shared/mental-abilities.ts';
const savePath = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : 'samples/DYNASTY-DUKETOND-AUTOSAVE';
const printOnly = process.argv.includes('--print');

const fieldVal = (rec: any, key: string): any => {
  const f = rec?._fields?.[key];
  return f && 'value' in f ? f.value : undefined;
};

/** Same schema injection as extract-abilities.ts — the store carries none. */
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

function recoverStrings(image: Buffer, table: any, field: string): Map<number, string> {
  const out = new Map<number, string>();
  const nameAt = image.indexOf(Buffer.from(table.name + '\x00'));
  if (nameAt < 0) return out;
  const regionEnd = Math.min(image.length, nameAt + 400000);
  const offsets: { row: number; off: number }[] = [];
  (table.records as any[]).forEach((r: any, row: number) => {
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
  if (!best || best.hits < Math.max(2, Math.floor(offsets.length * 0.8))) return out;
  for (const o of offsets) {
    const at = best.base + o.off;
    const end = image.indexOf(0, at);
    const s = image.toString('latin1', at, end < 0 ? at : Math.min(end, at + 120));
    if (/^[\x20-\x7e]+$/.test(s) && s.length) out.set(o.row, s);
  }
  return out;
}

// ---- 1. Tuning store: canonical keys per enum value + SignatureAbility names ----
const layout = loadLayout(GAME_ROOT_DEFAULT);
const toc = parseSuperbundleToc(
  readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32', 'globals.toc'))
);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mental-abilities-'));

/** enum value -> canonical keys (value 18 legitimately carries BellCow AND Instinct). */
let keysByValue: Map<number, string[]> | null = null;
let sigByName: Map<string, { name: string; desc: string }> | null = null;
let storeIdx = 0;

for (const chunk of toc.chunks) {
  if (keysByValue && sigByName) break;
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
  if (!image.includes(Buffer.from('MentalAbilitiesEnumTableEntry'))) continue;
  const tmp = path.join(tmpDir, `s${storeIdx++}.ftc`);
  fs.writeFileSync(tmp, payload);
  let store: any;
  try {
    store = await (mf.create ?? mf.FranchiseFile?.create)(tmp);
  } catch {
    continue;
  }

  if (!keysByValue) {
    const t = (store.tables as any[]).find((x: any) => x.name === 'MentalAbilitiesEnumTableEntry');
    if (t) {
      try {
        await t.readRecords();
        const names = recoverStrings(image, t, 'Field_2');
        const map = new Map<number, string[]>();
        (t.records as any[]).forEach((r: any, row: number) => {
          if (r.isEmpty) return;
          const value = Number(fieldVal(r, 'Field_3'));
          const key = names.get(row);
          if (!Number.isFinite(value) || !key) return;
          map.set(value, [...(map.get(value) ?? []), key]);
        });
        if (map.size >= 15) keysByValue = map;
      } catch {
        // next revision of the store
      }
    }
  }

  if (!sigByName) {
    const sig = (store.tables as any[]).find((x: any) => x.name === 'SignatureAbility');
    if (sig) {
      try {
        if (sig.header?.numMembers === SIG_ATTRS.length) {
          sig.schema = { name: 'SignatureAbility', attributes: SIG_ATTRS.map((a) => ({ ...a })) };
        }
        await sig.readRecords();
        const map = new Map<string, { name: string; desc: string }>();
        for (const r of sig.records as any[]) {
          if (r.isEmpty) continue;
          const name = String(fieldVal(r, 'Name') ?? '').trim();
          if (!name || /^\d+$/.test(name)) continue;
          const despaced = name.replace(/[\s']/g, '').toLowerCase();
          if (!map.has(despaced)) {
            map.set(despaced, { name, desc: String(fieldVal(r, 'Description') ?? '').trim() });
          }
        }
        if (map.size >= 40) sigByName = map;
      } catch {
        // next revision
      }
    }
  }
}
if (!keysByValue) throw new Error('MentalAbilitiesEnumTableEntry not decodable in any tuning store');
if (!sigByName) throw new Error('SignatureAbility names not decodable in any tuning store');

// ---- 2. Save schema: MentalAbilities identifier -> value ----
const save = await (mf.create ?? mf.FranchiseFile?.create)(savePath);
const player = (save.tables as any[])
  .filter((x: any) => x.name === 'Player')
  .sort((a: any, b: any) => (b.header?.recordCapacity ?? 0) - (a.header?.recordCapacity ?? 0))[0];
await player.readRecords(['MentalAbility1']);
const attr = player.schema?.attributes?.find((a: any) => a.name === 'MentalAbility1');
const members: any[] = attr?.enum?._members ?? attr?.enum?.members ?? [];
if (!members.length) throw new Error('MentalAbilities enum not found in save schema');

const splitKey = (key: string): string =>
  key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

interface Def {
  name: string;
  desc: string | null;
  source: 'game-display' | 'game-key';
}
const defs: Record<string, Def> = {};
for (const m of members) {
  const id = String(m._name ?? m.name ?? '');
  const value = Number(m._value ?? m.value);
  if (!id || /^(First|Last|Count)_?$/.test(id) || id === 'None') continue;
  const keys = keysByValue.get(value) ?? [];
  // Aliased values (BellCow/Instinct both 18): prefer the key spelled like this member.
  const key = keys.find((k) => k.toLowerCase() === id.toLowerCase()) ?? keys[0];
  const candidates = [key, id].filter((s): s is string => !!s);
  let hit: { name: string; desc: string } | undefined;
  for (const c of candidates) {
    hit = sigByName.get(c.replace(/[\s']/g, '').toLowerCase());
    if (hit) break;
  }
  if (hit) {
    defs[id] = { name: hit.name, desc: hit.desc || null, source: 'game-display' };
  } else if (key) {
    defs[id] = { name: splitKey(key), desc: null, source: 'game-key' };
  } else {
    console.warn(`no game key for enum member ${id}=${value} — skipping`);
  }
}

// Anchors that must hold; a title update that moves them should fail loudly.
if (defs['RoadFanFavorite']?.name !== 'Road Dog') {
  throw new Error(`anchor RoadFanFavorite → ${JSON.stringify(defs['RoadFanFavorite'])}`);
}
if (defs['DBRally']?.name !== 'Legion') {
  throw new Error(`anchor DBRally → ${JSON.stringify(defs['DBRally'])}`);
}
if (Object.keys(defs).length < 15) {
  throw new Error(`only ${Object.keys(defs).length} mental abilities resolved — not writing`);
}

const keys = Object.keys(defs).sort();
const lines: string[] = [];
lines.push('/**');
lines.push(" * The game's mental abilities: display name (+ description where the game");
lines.push(" * carries one), keyed by the save schema's MentalAbilities enum member —");
lines.push(" * the string madden-franchise reads from and writes to MentalAbility1..3.");
lines.push(' *');
lines.push(' * GENERATED by scripts/extract-mental-abilities.ts — do not edit by hand.');
lines.push(' *');
lines.push(" * Identifier drift is real (RoadFanFavorite shows as \"Road Dog\", DBRally as");
lines.push(" * \"Legion\", HotHead as \"Rollercoaster\"), so names come from the game's");
lines.push(" * tuning store, joined by enum value. source: 'game-display' = the exact");
lines.push(" * SignatureAbility.Name string; 'game-key' = the game's canonical ability");
lines.push(' * key split on case boundaries (no display row exists for it).');
lines.push(' */');
lines.push('export interface MentalAbilityDef {');
lines.push('  /** Name the game shows, e.g. "Road Dog" for RoadFanFavorite. */');
lines.push('  name: string;');
lines.push("  /** The game's own blurb for the ability, when it has one. */");
lines.push('  desc: string | null;');
lines.push("  source: 'game-display' | 'game-key';");
lines.push('}');
lines.push('');
lines.push('export const MENTAL_ABILITIES: Record<string, MentalAbilityDef> = {');
for (const k of keys) {
  const d = defs[k];
  lines.push(`  ${k}: { name: ${JSON.stringify(d.name)}, desc: ${JSON.stringify(d.desc)}, source: ${JSON.stringify(d.source)} },`);
}
lines.push('};');
lines.push('');
lines.push('/** Display name for a save-side mental-ability identifier (echoes unknowns). */');
lines.push('export function mentalAbilityName(id: string): string {');
lines.push('  return MENTAL_ABILITIES[id]?.name ?? id;');
lines.push('}');
lines.push('');

const out = lines.join('\n');
if (printOnly) console.log(out);
else {
  fs.writeFileSync(OUT, out, 'utf8');
  console.log(`${OUT}: ${keys.length} mental abilities written`);
}
for (const k of keys) {
  console.log(`  ${k.padEnd(18)} → "${defs[k].name}"${defs[k].source === 'game-key' ? '  [key]' : ''}`);
}
