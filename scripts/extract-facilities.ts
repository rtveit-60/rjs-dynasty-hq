/**
 * Generate src/shared/facilities.ts from the game's own tuning store: the five
 * athletic-facility levels (BuildingTeamUpgrade) and the equipment catalog
 * (Equipment), keyed the way the save references them.
 *
 *   BuildingTeamUpgrade (5 rows, Level 0..4): Name, Description, Cost,
 *     RenewCost (= the save's FacilitiesRenewalCostReserved), EquipmentSlotCap,
 *     the LetterGrade band the level pins AthleticFacilitiesGrade to, and the
 *     spend thresholds inside the band.
 *   Equipment (20 rows): Name, Description, Cost, tier, and the effect list;
 *     the save's EquipmentTeamUpgradeStatus.TeamUpgrade refs are FranTk asset
 *     ids that the store's asset table maps back to these rows.
 *
 * The store carries no schema for either table, so fields arrive as Field_N
 * and strings as pool offsets; the pool base is solved by aligning every
 * row's offsets against string starts (anchored on "Basic Facility" /
 * "Antigravity Treadmill"). Anchors fail loudly on drift.
 *
 * Usage: node scripts/extract-facilities.ts [--print]
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
const OUT = 'src/shared/facilities.ts';
const printOnly = process.argv.includes('--print');

const LETTERS = ['Aplus', 'A', 'Aminus', 'Bplus', 'B', 'Bminus', 'Cplus', 'C', 'Cminus', 'Dplus', 'D', 'Dminus', 'F'];
const EFFECT_TYPES: Record<number, string> = {
  0: 'None',
  1: 'Recruiting Hours Increase',
  2: 'Reduce NIL Expectations',
  3: 'Dynasty Points Increase',
  4: 'Support Staff Discounts',
  5: 'Offseason Progression Increase',
  6: 'Reduce Season Health Usage',
  7: 'Reduce Injury Chance',
  8: 'Facilities Discount',
  9: 'Increased Facility Longevity',
  10: 'Increase Athletic Facility Grade',
  11: 'Reduce Wear and Tear'
};

const fv = (r: any, k: string): any => {
  const f = r?._fields?.[k];
  return f && 'value' in f ? f.value : undefined;
};
const num = (v: any): number => (typeof v === 'string' && /^[01]{32}$/.test(v) ? parseInt(v, 2) >>> 0 : Number(v) >>> 0);

function cstr(img: Buffer, at: number): string {
  const e = img.indexOf(0, at);
  return img.toString('latin1', at, Math.min(e < 0 ? at : e, at + 300));
}

/** Pool base for a table: the base that puts the most row offsets on string starts near the anchor. */
function solveBase(img: Buffer, anchor: number, offs: number[]): { base: number; hits: number } {
  const starts = new Set<number>();
  for (let p = Math.max(1, anchor - 400); p < Math.min(img.length, anchor + 8000); p++) {
    if (img[p - 1] === 0 && img[p] >= 0x20 && img[p] < 0x7f) starts.add(p);
  }
  let best = { base: -1, hits: 0 };
  for (const s of starts) {
    for (const o of offs) {
      const base = s - o;
      if (base < 0) continue;
      let hits = 0;
      for (const q of offs) if (starts.has(base + q)) hits++;
      if (hits > best.hits) best = { base, hits };
    }
  }
  return best;
}

interface Level {
  level: number;
  name: string;
  desc: string;
  cost: number;
  renewCost: number;
  slotCap: number;
  bestGrade: string;
  worstGrade: string;
  normalThreshold: number;
  plusThreshold: number;
}
interface Item {
  assetId: string;
  name: string;
  desc: string;
  cost: number;
  tier: number;
  effect: string;
  value: number;
}

const layout = loadLayout(GAME_ROOT_DEFAULT);
const toc = parseSuperbundleToc(readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32', 'globals.toc')));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'facilities-'));

let levels: Level[] | null = null;
let items: Item[] | null = null;
let guid = '';
let n = 0;
for (const chunk of toc.chunks) {
  if (levels && items) break;
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
  if (!image.includes(Buffer.from('Basic Facility\x00')) || !image.includes(Buffer.from('Antigravity Treadmill\x00'))) continue;
  const tmp = path.join(tmpDir, `s${n++}.ftc`);
  fs.writeFileSync(tmp, payload);
  let franchise: any;
  try {
    franchise = await (mf.create ?? mf.FranchiseFile?.create)(tmp);
  } catch {
    continue;
  }
  const byId = (id: number) => (franchise.tables as any[]).find((t) => t.header?.tableId === id);
  const bt = (franchise.tables as any[]).find((t) => t.name === 'BuildingTeamUpgrade');
  const eq = (franchise.tables as any[]).find((t) => t.name === 'Equipment');
  if (!bt || !eq) continue;
  try {
    await bt.readRecords();
    await eq.readRecords();
  } catch {
    continue;
  }

  // ---- levels ----
  const bRows = (bt.records as any[]).filter((r) => !r.isEmpty);
  const bOffs = bRows.flatMap((r) => [Number(fv(r, 'Field_6')), Number(fv(r, 'Field_1'))]);
  const bBase = solveBase(image, image.indexOf(Buffer.from('Basic Facility\x00')), bOffs);
  const lv: Level[] = bRows
    .map((r) => ({
      level: Number(fv(r, 'Field_4')),
      name: cstr(image, bBase.base + Number(fv(r, 'Field_6'))),
      desc: cstr(image, bBase.base + Number(fv(r, 'Field_1'))),
      cost: Number(fv(r, 'Field_0')),
      renewCost: Number(fv(r, 'Field_12')),
      slotCap: Number(fv(r, 'Field_7')),
      bestGrade: LETTERS[Number(fv(r, 'Field_8'))] ?? '',
      worstGrade: LETTERS[Number(fv(r, 'Field_9'))] ?? '',
      normalThreshold: Number(fv(r, 'Field_10')),
      plusThreshold: Number(fv(r, 'Field_11'))
    }))
    .sort((a, b) => a.level - b.level);
  // Anchors: five levels 0..4, the game's own names, slot caps 1..5, renew costs rising.
  const levelOk =
    lv.length === 5 &&
    lv.every((l, i) => l.level === i && l.slotCap === i + 1) &&
    lv[0].name === 'Basic Facility' &&
    lv[4].name === 'National Powerhouse' &&
    lv[4].renewCost > lv[1].renewCost;
  if (!levelOk) {
    console.log(`store ${chunk.guid}: level anchors failed (${lv.map((l) => `${l.level}:${l.name}/${l.slotCap}/${l.renewCost}`).join(' ')})`);
    continue;
  }
  // Level 0 has no description of its own (offset 0 lands outside the pool).
  if (Number(fv(bRows.find((r) => Number(fv(r, 'Field_4')) === 0), 'Field_1')) === 0) lv[0].desc = '';

  // ---- equipment ----
  const eRows = (eq.records as any[]).map((r, row) => ({ r, row })).filter((x) => !x.r.isEmpty && Number(fv(x.r, 'Field_3')) > 0);
  const eOffs = eRows.flatMap(({ r }) => [Number(fv(r, 'Field_6')), Number(fv(r, 'Field_1'))]);
  const eBase = solveBase(image, image.indexOf(Buffer.from('Antigravity Treadmill\x00')), eOffs);
  // asset id per row: the store's asset table maps ids -> (table, row).
  const assetOf = new Map<number, number>();
  for (const entry of franchise.assetTable as { assetId: unknown; reference: unknown }[]) {
    const ref = Number(entry.reference) >>> 0;
    if (ref >>> 17 !== eq.header?.tableId) continue;
    assetOf.set(ref & 0x1ffff, Number(entry.assetId) >>> 0);
  }
  const effT = (franchise.tables as any[]).find((t) => t.name === 'TeamUpgradeEffect');
  if (effT && !effT.recordsRead) await effT.readRecords();
  for (const t of (franchise.tables as any[]).filter((t) => t.name === 'TeamUpgradeEffect[]')) if (!t.recordsRead) await t.readRecords();
  const it: Item[] = [];
  for (const { r, row } of eRows) {
    const assetId = assetOf.get(row);
    if (assetId === undefined) continue;
    const arrRef = num(fv(r, 'Field_2'));
    const arr = byId(arrRef >>> 17)?.records?.[arrRef & 0x1ffff];
    let effect = 'None';
    let value = 0;
    for (const k of Object.keys(arr?._fields ?? {})) {
      const v = num(fv(arr, k));
      if (!v) continue;
      const er = byId(v >>> 17)?.records?.[v & 0x1ffff];
      if (!er) continue;
      effect = EFFECT_TYPES[Number(fv(er, 'Field_0'))] ?? String(fv(er, 'Field_0'));
      value = Number(fv(er, 'Field_1'));
      break;
    }
    it.push({
      assetId: assetId.toString(2).padStart(32, '0'),
      name: cstr(image, eBase.base + Number(fv(r, 'Field_6'))),
      desc: cstr(image, eBase.base + Number(fv(r, 'Field_1'))),
      cost: Number(fv(r, 'Field_0')),
      tier: Number(fv(r, 'Field_4')),
      effect,
      value
    });
  }
  it.sort((a, b) => a.effect.localeCompare(b.effect) || a.tier - b.tier);
  const itemOk = it.length >= 20 && it.some((x) => x.name === 'Sports Science Lab' && x.effect === 'Increase Athletic Facility Grade');
  if (!itemOk) {
    console.log(`store ${chunk.guid}: equipment anchors failed (${it.length} items)`);
    continue;
  }
  levels = lv;
  items = it;
  guid = chunk.guid;
}

if (!levels || !items) throw new Error('no tuning store yielded BuildingTeamUpgrade + Equipment with the expected anchors');

console.log(`facilities: ${levels.length} levels, ${items.length} equipment items (store ${guid})`);
if (printOnly) {
  for (const l of levels) console.log(`  L${l.level} ${l.name.padEnd(20)} cost ${l.cost} renew ${l.renewCost} slots ${l.slotCap} band ${l.bestGrade}..${l.worstGrade} thresholds ${l.normalThreshold}/${l.plusThreshold}`);
  for (const i of items) console.log(`  ${i.name.padEnd(26)} T${i.tier} ${String(i.cost).padStart(4)} ${i.effect} ${i.value}  ${i.assetId}`);
  process.exit(0);
}

fs.writeFileSync(
  OUT,
  `/**
 * CFB 27 athletic facilities: the five building levels and the equipment
 * catalog, from the game's own tuning store (BuildingTeamUpgrade + Equipment).
 *
 * GENERATED by scripts/extract-facilities.ts — do not edit by hand.
 *
 * The save keeps the level in Team.FacilitiesLevel (0–4) and reserves the
 * level's renewal fee in FacilitiesRenewalCostReserved; owned equipment rows
 * (EquipmentTeamUpgradeStatus) reference items by the 32-bit asset id below.
 */
export interface FacilityLevel {
  level: number;
  name: string;
  desc: string;
  cost: number;
  renewCost: number;
  /** Equipment slots the level allows. */
  slotCap: number;
  /** The AthleticFacilitiesGrade band the level pins (best..worst, save member ids). */
  bestGrade: string;
  worstGrade: string;
  normalThreshold: number;
  plusThreshold: number;
}

export interface FacilityEquipment {
  /** 32-bit asset id as the save stores the TeamUpgrade ref (binary string). */
  assetId: string;
  name: string;
  desc: string;
  cost: number;
  tier: number;
  effect: string;
  value: number;
}

export const FACILITY_LEVELS: FacilityLevel[] = ${JSON.stringify(levels, null, 2)};

export const FACILITY_EQUIPMENT: FacilityEquipment[] = ${JSON.stringify(items, null, 2)};

export function equipmentByAsset(assetId: string): FacilityEquipment | null {
  return FACILITY_EQUIPMENT.find((e) => e.assetId === assetId) ?? null;
}
`,
  'utf8'
);
console.log(`wrote ${OUT}`);
