/**
 * Generate src/shared/pitches.ts from the game's own data.
 *
 * The save stores each recruit's ideal pitch as a RecruitingPitchType enum
 * value on Player.IdealRecruitingPitch. What the game shows — the pitch's
 * display name and the three motivations that compose it — lives in the
 * franchise-common tuning store:
 *   - RecruitingPitchTypeEnumTableEntry: Field_3 = enum value, Field_2 = name
 *     string offset ("Gamer", "Hometown Hero", ...).
 *   - RecruitingMotivationEnumTableEntry: Field_3 = motivation value,
 *     Field_2 = name offset ("Playing Time", "Proximity To Home", ...).
 *   - RecruitingPitchInfo: Field_5 = pitch enum value, Field_0/1/2 = the three
 *     component motivation values.
 * The save schema's own IdealRecruitingPitch enum supplies name → value, so
 * the whole mapping is a join — nothing is guessed. Identifier drift is real
 * (ItsGameTime shows as "Gamer", WorkHorse as "Gym Rat", Prestigious as
 * "Standard Bearer"), which is exactly why this maps by enum value.
 * Verified anchors: HometownHero → "Hometown Hero" + Proximity To Home,
 * SundayBound → "Sunday Player" + Pro Potential.
 *
 * Usage: node scripts/extract-pitches.ts [save] [--print]
 * Needs the installed game (reads Win32/globals) and any CFB 27 save for the
 * enum schema. Run after title updates; never hand-edit the output.
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
const OUT = 'src/shared/pitches.ts';
const savePath = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : 'samples/DYNASTY-DUKETOND-AUTOSAVE';
const printOnly = process.argv.includes('--print');

const fieldVal = (rec: any, key: string): any => {
  const f = rec?._fields?.[key];
  return f && 'value' in f ? f.value : undefined;
};

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

// ---- 1. Tuning store: pitch names, motivation names, pitch compositions ----
const layout = loadLayout(GAME_ROOT_DEFAULT);
const toc = parseSuperbundleToc(
  readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32', 'globals.toc'))
);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitches-'));

let pitchNameByValue: Map<number, string> | null = null;
let motivationByValue: Map<number, string> | null = null;
let compByPitchValue: Map<number, [number, number, number]> | null = null;
let storeIdx = 0;

for (const chunk of toc.chunks) {
  if (pitchNameByValue && motivationByValue && compByPitchValue) break;
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
  if (!image.includes(Buffer.from('RecruitingPitchInfo'))) continue;
  const tmp = path.join(tmpDir, `s${storeIdx++}.ftc`);
  fs.writeFileSync(tmp, payload);
  let store: any;
  try {
    store = await (mf.create ?? mf.FranchiseFile?.create)(tmp);
  } catch {
    continue;
  }
  const tableByName = async (name: string): Promise<any | null> => {
    const t = (store.tables as any[]).find((x) => x.name === name);
    if (!t) return null;
    try {
      await t.readRecords();
    } catch {
      return null;
    }
    return t;
  };

  const pitchEnumT = await tableByName('RecruitingPitchTypeEnumTableEntry');
  if (pitchEnumT) {
    const names = recoverStrings(image, pitchEnumT, 'Field_2');
    const map = new Map<number, string>();
    (pitchEnumT.records as any[]).forEach((r: any, row: number) => {
      if (r.isEmpty) return;
      const value = Number(fieldVal(r, 'Field_3'));
      const name = names.get(row);
      if (Number.isFinite(value) && name && name !== 'Invalid') map.set(value, name);
    });
    if (map.size >= 20) pitchNameByValue = map;
  }

  const motivEnumT = await tableByName('RecruitingMotivationEnumTableEntry');
  if (motivEnumT) {
    const names = recoverStrings(image, motivEnumT, 'Field_2');
    const map = new Map<number, string>();
    (motivEnumT.records as any[]).forEach((r: any, row: number) => {
      if (r.isEmpty) return;
      const value = Number(fieldVal(r, 'Field_3'));
      const name = names.get(row);
      if (Number.isFinite(value) && name && name !== 'Invalid') map.set(value, name);
    });
    if (map.size >= 14) motivationByValue = map;
  }

  const infoT = await tableByName('RecruitingPitchInfo');
  if (infoT) {
    const map = new Map<number, [number, number, number]>();
    (infoT.records as any[]).forEach((r: any) => {
      if (r.isEmpty) return;
      const pitch = Number(fieldVal(r, 'Field_5'));
      const m = [Number(fieldVal(r, 'Field_0')), Number(fieldVal(r, 'Field_1')), Number(fieldVal(r, 'Field_2'))];
      if (Number.isFinite(pitch) && m.every((x) => Number.isFinite(x))) {
        map.set(pitch, m as [number, number, number]);
      }
    });
    if (map.size >= 20) compByPitchValue = map;
  }
}
if (!pitchNameByValue || !motivationByValue || !compByPitchValue) {
  throw new Error('pitch tables not decodable in any tuning store');
}

// ---- 2. Save schema: pitch enum name → numeric value ----
const save = await (mf.create ?? mf.FranchiseFile?.create)(savePath);
const player = (save.tables as any[])
  .filter((x) => x.name === 'Player')
  .sort((a, b) => (b.header?.recordCapacity ?? 0) - (a.header?.recordCapacity ?? 0))[0];
await player.readRecords(['IdealRecruitingPitch']);
const attr = player.schema?.attributes?.find((a: any) => a.name === 'IdealRecruitingPitch');
const members: any[] = attr?.enum?._members ?? attr?.enum?.members ?? [];
if (!members.length) throw new Error('IdealRecruitingPitch enum not found in save schema');

interface PitchDef {
  name: string;
  motivations: string[];
}
const defs: Record<string, PitchDef> = {};
for (const m of members) {
  const name = String(m._name ?? m.name ?? '');
  const value = Number(m._value ?? m.value);
  if (!name || /^(First|Last|Count)_?$/.test(name) || name === 'Invalid') continue;
  const display = pitchNameByValue.get(value);
  const comp = compByPitchValue.get(value);
  if (!display || !comp) continue;
  const motivations = comp.map((v) => motivationByValue!.get(v)).filter((s): s is string => !!s);
  if (motivations.length !== 3) continue;
  defs[name] = { name: display, motivations };
}

// Anchors that must hold; a title update that moves them should fail loudly.
if (defs['HometownHero']?.name !== 'Hometown Hero' || !defs['HometownHero'].motivations.includes('Proximity To Home')) {
  throw new Error(`anchor HometownHero → ${JSON.stringify(defs['HometownHero'])}`);
}
if (defs['SundayBound']?.name !== 'Sunday Player' || !defs['SundayBound'].motivations.includes('Pro Potential')) {
  throw new Error(`anchor SundayBound → ${JSON.stringify(defs['SundayBound'])}`);
}

const keys = Object.keys(defs).sort();
const lines: string[] = [];
lines.push('/**');
lines.push(" * The game's recruiting pitches: display name + the three motivations each");
lines.push(" * pitch is composed of, keyed by the save's IdealRecruitingPitch enum.");
lines.push(' *');
lines.push(' * GENERATED by scripts/extract-pitches.ts — do not edit by hand.');
lines.push(' *');
lines.push(" * Sourced from RecruitingPitchInfo / RecruitingPitchTypeEnumTableEntry /");
lines.push(" * RecruitingMotivationEnumTableEntry in the game's franchise-common tuning");
lines.push(" * store, joined through the save schema's own enum values. The motivation");
lines.push(' * order is the data order of RecruitingPitchInfo (Field_0/1/2); the on-screen');
lines.push(' * importance order has not been verified against the game UI.');
lines.push(' */');
lines.push('export interface PitchDef {');
lines.push('  /** Display name the game shows, e.g. "Gamer" for ItsGameTime. */');
lines.push('  name: string;');
lines.push('  /** The three motivations composing the pitch, in data order. */');
lines.push('  motivations: string[];');
lines.push('}');
lines.push('');
lines.push('export const PITCHES: Record<string, PitchDef> = {');
for (const k of keys) {
  lines.push(`  ${k}: { name: ${JSON.stringify(defs[k].name)}, motivations: ${JSON.stringify(defs[k].motivations)} },`);
}
lines.push('};');
lines.push('');

const out = lines.join('\n');
if (printOnly) console.log(out);
else {
  fs.writeFileSync(OUT, out, 'utf8');
  console.log(`${OUT}: ${keys.length} pitches written`);
}
