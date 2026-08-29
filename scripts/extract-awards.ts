/**
 * Generate src/shared/awards.ts from the game's own data.
 *
 * The save stores award winners as AwardType enum values (HEISMAN, BEST_QB…);
 * the names the game actually shows live in the franchise-common tuning
 * store's AwardTypeEnumTableEntry: Field_9 carries the enum's numeric value,
 * Field_1 the full display name, Field_2 the short name. The save's own
 * schema supplies enum name → numeric value, so the whole mapping is a join —
 * nothing is guessed. Verified anchors: HEISMAN → "Heisman Memorial Trophy",
 * BEST_RB → "Doak Walker Award", ALL_AM_1ST_CONF → "1st Team All-Conference".
 *
 * Usage: node scripts/extract-awards.ts [save] [--print]
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
const OUT = 'src/shared/awards.ts';
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

// ---- 1. Tuning store: enum value → full/short display name ----
const layout = loadLayout(GAME_ROOT_DEFAULT);
const toc = parseSuperbundleToc(
  readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32', 'globals.toc'))
);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'awards-'));

let byValue: Map<number, { full: string; short: string }> | null = null;
let storeIdx = 0;
for (const chunk of toc.chunks) {
  if (byValue) break;
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
  if (!image.includes(Buffer.from('AwardTypeEnumTableEntry'))) continue;
  const tmp = path.join(tmpDir, `s${storeIdx++}.ftc`);
  fs.writeFileSync(tmp, payload);
  let store: any;
  try {
    store = await (mf.create ?? mf.FranchiseFile?.create)(tmp);
  } catch {
    continue;
  }
  const t = (store.tables as any[]).find((x) => x.name === 'AwardTypeEnumTableEntry');
  if (!t) continue;
  try {
    await t.readRecords();
  } catch {
    continue;
  }
  const full = recoverStrings(image, t, 'Field_1');
  const short = recoverStrings(image, t, 'Field_2');
  if (full.size < 30) continue;
  const map = new Map<number, { full: string; short: string }>();
  (t.records as any[]).forEach((r: any, row: number) => {
    if (r.isEmpty) return;
    const value = Number(fieldVal(r, 'Field_9'));
    const f = full.get(row);
    if (!Number.isFinite(value) || !f) return;
    map.set(value, { full: f, short: short.get(row) ?? f });
  });
  if (map.size >= 30) byValue = map;
}
if (!byValue) throw new Error('AwardTypeEnumTableEntry not decodable in any store');

// ---- 2. Save schema: enum name → numeric value ----
const save = await (mf.create ?? mf.FranchiseFile?.create)(savePath);
const lha = (save.tables as any[])
  .filter((x) => x.name === 'LeagueHistoryAward')
  .sort((a, b) => (b.header?.recordCapacity ?? 0) - (a.header?.recordCapacity ?? 0))[0];
await lha.readRecords();
const attr = lha.schema?.attributes?.find((a: any) => a.name === 'AwardType');
const members: any[] = attr?.enum?._members ?? attr?.enum?.members ?? [];
if (!members.length) throw new Error('AwardType enum not found in save schema');

const names: Record<string, string> = {};
const shorts: Record<string, string> = {};
for (const m of members) {
  const name = String(m._name ?? m.name ?? '');
  const value = Number(m._value ?? m.value);
  // Skip range markers and sentinels — they alias real values.
  if (!name || /^(First|Last)[A-Za-z]*_$/.test(name) || name === 'Count' || name === 'INVALID') continue;
  const hit = byValue.get(value);
  if (!hit) continue;
  names[name] = hit.full;
  shorts[name] = hit.short;
}

// Anchors that must hold; a title update that moves them should fail loudly.
if (names['HEISMAN'] !== 'Heisman Memorial Trophy') throw new Error(`anchor HEISMAN → ${names['HEISMAN']}`);
if (names['BEST_RB'] !== 'Doak Walker Award') throw new Error(`anchor BEST_RB → ${names['BEST_RB']}`);

const entries = Object.keys(names).sort();
const lines: string[] = [];
lines.push('/**');
lines.push(" * The game's own award names, keyed by the save's AwardType enum.");
lines.push(' *');
lines.push(' * GENERATED by scripts/extract-awards.ts — do not edit by hand.');
lines.push(' *');
lines.push(" * Names come from AwardTypeEnumTableEntry in the game's franchise-common");
lines.push(' * tuning store (Field_9 = enum value, Field_1 = full name, Field_2 = short),');
lines.push(" * joined through the save schema's own enum values.");
lines.push(' */');
lines.push('export const AWARD_NAMES: Record<string, string> = {');
for (const k of entries) lines.push(`  ${k}: ${JSON.stringify(names[k])},`);
lines.push('};');
lines.push('');
lines.push('export const AWARD_SHORT: Record<string, string> = {');
for (const k of entries) lines.push(`  ${k}: ${JSON.stringify(shorts[k])},`);
lines.push('};');
lines.push('');

const out = lines.join('\n');
if (printOnly) console.log(out);
else {
  fs.writeFileSync(OUT, out, 'utf8');
  console.log(`${OUT}: ${entries.length} awards written`);
}
