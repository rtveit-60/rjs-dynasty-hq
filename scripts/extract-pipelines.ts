/**
 * Generate src/shared/pipelines.ts from the game's own data.
 *
 * The save names recruiting pipelines by enum member (BigApple, Tidewater,
 * International…) and influence tiers by PipelineInfluenceLevel member. The
 * names the game shows live in the franchise-common tuning store:
 *   PipelineEnumTableEntry               Field_3 = enum value, Field_1 = display
 *                                        name, Field_0 = region blurb (empty for
 *                                        pipelines named after their region)
 *   PipelineInfluenceLevelEnumTableEntry Field_3 = enum value, Field_1 = display
 * The save's own schema supplies member name → numeric value, so the mapping is
 * a join — nothing is guessed. Drift is real: the `International` member shows
 * as "National"; Big Sky's blurb is the five states it covers.
 *
 * Usage: node scripts/extract-pipelines.ts [save] [--print]
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
const OUT = 'src/shared/pipelines.ts';
const savePath = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : 'samples/DYNASTY-VIRGINIA-MIDSEASON';
const printOnly = process.argv.includes('--print');

const fieldVal = (rec: any, key: string): any => {
  const f = rec?._fields?.[key];
  return f && 'value' in f ? f.value : undefined;
};

/**
 * String-pool base for one offset field of a store table: the base that puts
 * the most row offsets on string starts near the table's name. Field_1 (every
 * row a real name) solves it; Field_0 reuses that base because the blurbs sit
 * in the same pool and most of them are empty strings (a lone NUL).
 */
function solvePool(image: Buffer, table: any, field: string): number {
  const nameAt = image.indexOf(Buffer.from(table.name + '\x00'));
  if (nameAt < 0) return -1;
  const regionEnd = Math.min(image.length, nameAt + 400000);
  const offsets: number[] = [];
  for (const r of table.records as any[]) {
    if (r.isEmpty) continue;
    const v = Number(fieldVal(r, field));
    if (Number.isFinite(v) && v >= 0) offsets.push(v);
  }
  if (!offsets.length) return -1;
  const starts: number[] = [];
  for (let p = nameAt; p < regionEnd; p++) {
    if (image[p - 1] === 0 && image[p] >= 0x20 && image[p] < 0x7f && image[p + 1] >= 0x20 && image[p + 1] < 0x7f) {
      starts.push(p);
    }
  }
  const startSet = new Set(starts);
  let best = { base: -1, hits: 0 };
  for (const s of starts) {
    const base = s - offsets[0];
    if (base < nameAt || base > regionEnd) continue;
    let hits = 0;
    for (const o of offsets) if (startSet.has(base + o)) hits++;
    if (hits > best.hits) best = { base, hits };
    if (hits === offsets.length) break;
  }
  return best.hits >= Math.max(2, Math.floor(offsets.length * 0.8)) ? best.base : -1;
}

function readAt(image: Buffer, base: number, off: number): string | null {
  if (base < 0 || !Number.isFinite(off) || off < 0) return null;
  const at = base + off;
  const end = image.indexOf(0, at);
  const s = image.toString('latin1', at, end < 0 ? at : Math.min(end, at + 200));
  return /^[\x20-\x7e]*$/.test(s) ? s : null;
}

// ---- 1. Tuning store: enum value → display name (+ region blurb) ----
const layout = loadLayout(GAME_ROOT_DEFAULT);
const toc = parseSuperbundleToc(readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32', 'globals.toc')));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipelines-'));

let pipelinesByValue: Map<number, { name: string; region: string }> | null = null;
let levelsByValue: Map<number, string> | null = null;
let storeIdx = 0;
for (const chunk of toc.chunks) {
  if (pipelinesByValue && levelsByValue) break;
  if (chunk.location.size > 40_000_000) continue;
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
  if (!image.includes(Buffer.from('PipelineEnumTableEntry\x00'))) continue;
  if (!image.includes(Buffer.from('PipelineInfluenceLevelEnumTableEntry\x00'))) continue;
  const tmp = path.join(tmpDir, `s${storeIdx++}.ftc`);
  fs.writeFileSync(tmp, payload);
  let store: any;
  try {
    store = await (mf.create ?? mf.FranchiseFile?.create)(tmp);
  } catch {
    continue;
  }
  const pt = (store.tables as any[]).find((x) => x.name === 'PipelineEnumTableEntry');
  const lt = (store.tables as any[]).find((x) => x.name === 'PipelineInfluenceLevelEnumTableEntry');
  if (!pt || !lt) continue;
  try {
    await pt.readRecords();
    await lt.readRecords();
  } catch {
    continue;
  }
  const pBase = solvePool(image, pt, 'Field_1');
  const lBase = solvePool(image, lt, 'Field_1');
  if (pBase < 0 || lBase < 0) continue;
  const pmap = new Map<number, { name: string; region: string }>();
  for (const r of pt.records as any[]) {
    if (r.isEmpty) continue;
    const value = Number(fieldVal(r, 'Field_3'));
    const name = readAt(image, pBase, Number(fieldVal(r, 'Field_1')));
    const region = readAt(image, pBase, Number(fieldVal(r, 'Field_0'))) ?? '';
    if (!Number.isFinite(value) || !name) continue;
    pmap.set(value, { name, region });
  }
  const lmap = new Map<number, string>();
  for (const r of lt.records as any[]) {
    if (r.isEmpty) continue;
    const value = Number(fieldVal(r, 'Field_3'));
    const name = readAt(image, lBase, Number(fieldVal(r, 'Field_1')));
    if (!Number.isFinite(value) || !name) continue;
    lmap.set(value, name);
  }
  if (pmap.size >= 40 && lmap.size >= 6) {
    pipelinesByValue = pmap;
    levelsByValue = lmap;
  }
}
if (!pipelinesByValue || !levelsByValue) throw new Error('Pipeline enum tables not decodable in any store');

// ---- 2. Save schema: member name → numeric value ----
const save = await (mf.create ?? mf.FranchiseFile?.create)(savePath);
const spi = (save.tables as any[])
  .filter((x) => x.name === 'SchoolPipelineInfluence')
  .sort((a, b) => (b.header?.recordCapacity ?? 0) - (a.header?.recordCapacity ?? 0))[0];
if (!spi) throw new Error('SchoolPipelineInfluence table not found in the save');
await spi.readRecords();
function schemaMembers(attrName: string): { name: string; value: number }[] {
  const attr = spi.schema?.attributes?.find((a: any) => a.name === attrName);
  const members: any[] = attr?.enum?._members ?? attr?.enum?.members ?? [];
  const out: { name: string; value: number }[] = [];
  for (const m of members) {
    const name = String(m._name ?? m.name ?? '');
    const value = Number(m._value ?? m.value);
    if (!name || !Number.isFinite(value)) continue;
    if (/^(First|Last|Count)[A-Za-z]*_$/.test(name) || /_$/.test(name)) continue;
    if (name === 'Invalid' || name === 'COUNT' || name === 'Count') continue;
    out.push({ name, value });
  }
  return out;
}
const pipelineMembers = schemaMembers('Pipeline');
const levelMembers = schemaMembers('InfluenceLevel');
if (pipelineMembers.length < 40) throw new Error(`Pipeline enum too small in save schema: ${pipelineMembers.length}`);
if (levelMembers.length < 6) throw new Error(`PipelineInfluenceLevel enum too small in save schema: ${levelMembers.length}`);

const names: Record<string, string> = {};
const regions: Record<string, string> = {};
for (const m of pipelineMembers) {
  const hit = pipelinesByValue.get(m.value);
  if (!hit) continue;
  names[m.name] = hit.name;
  if (hit.region && hit.region !== hit.name) regions[m.name] = hit.region;
}
const levels: Record<string, string> = {};
for (const m of levelMembers) {
  const hit = levelsByValue.get(m.value);
  if (hit && hit !== 'Count' && hit !== 'Invalid') levels[m.name] = hit;
}

// Anchors that must hold; a title update that moves them should fail loudly.
if (names['International'] !== 'National') throw new Error(`anchor International → ${names['International']}`);
if (names['BigApple'] !== 'Big Apple') throw new Error(`anchor BigApple → ${names['BigApple']}`);
if (!/Dakota/.test(regions['BigSky'] ?? '')) throw new Error(`anchor BigSky region → ${regions['BigSky']}`);
if (levels['HouseholdName'] !== 'Household Name') throw new Error(`anchor HouseholdName → ${levels['HouseholdName']}`);
if (levels['CulturalPillar'] !== 'Cultural Pillar') throw new Error(`anchor CulturalPillar → ${levels['CulturalPillar']}`);

const lines: string[] = [];
lines.push('/**');
lines.push(" * The game's own recruiting-pipeline and influence-tier names, keyed by the");
lines.push(" * save's Pipeline and PipelineInfluenceLevel enum members.");
lines.push(' *');
lines.push(' * GENERATED by scripts/extract-pipelines.ts — do not edit by hand.');
lines.push(' *');
lines.push(' * Names come from PipelineEnumTableEntry / PipelineInfluenceLevelEnumTableEntry');
lines.push(" * in the game's franchise-common tuning store (Field_3 = enum value, Field_1 =");
lines.push(' * display name, Field_0 = region blurb), joined through the save schema.');
lines.push(' */');
lines.push('export const PIPELINE_NAMES: Record<string, string> = {');
for (const k of Object.keys(names).sort()) lines.push(`  ${k}: ${JSON.stringify(names[k])},`);
lines.push('};');
lines.push('');
lines.push('/** Region blurb for pipelines whose name is not a place; absent means the name says it. */');
lines.push('export const PIPELINE_REGIONS: Record<string, string> = {');
for (const k of Object.keys(regions).sort()) lines.push(`  ${k}: ${JSON.stringify(regions[k])},`);
lines.push('};');
lines.push('');
lines.push('/** Influence tier names, lowest to highest by enum value. */');
lines.push('export const PIPELINE_LEVEL_NAMES: Record<string, string> = {');
for (const m of [...levelMembers].sort((a, b) => a.value - b.value)) {
  if (levels[m.name]) lines.push(`  ${m.name}: ${JSON.stringify(levels[m.name])},`);
}
lines.push('};');
lines.push('');

const out = lines.join('\n');
if (printOnly) console.log(out);
else {
  fs.writeFileSync(OUT, out, 'utf8');
  console.log(
    `${OUT}: ${Object.keys(names).length} pipelines, ${Object.keys(regions).length} regions, ${Object.keys(levels).length} tiers written`
  );
}
