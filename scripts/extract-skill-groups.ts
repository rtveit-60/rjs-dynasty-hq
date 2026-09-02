/**
 * Generate src/shared/skill-groups.ts from the game's own data.
 *
 * Every player carries six skill-group caps (Player.SkillGroupCap1..6, 0–20
 * levels; the game's Upgrade Player screen) plus unspent SkillPoints. Which
 * group each cap slot IS depends on the player's ARCHETYPE, not position
 * (C / G / OT differ; S_Zone differs from the other safeties; the two kicker
 * archetypes swap pairs). That order comes from the franchise-common tuning
 * store's PlayerSkillGroup rows: archetype (PlayerType value) → an ordered
 * PlayerSkillGroupBucket[] whose slot k names SkillGroupCap{k+1}. Each bucket
 * lists the PlayerSkills it levels (primary / secondary / tertiary), and a
 * skill's PlayerAbility enum member names the save rating (`<member>Rating`).
 *
 * Sources:
 *   - Core-Schemas XML chunk (9b964b0c… in Win32/globals): PlayerType and
 *     PlayerAbility enum value → member name.
 *   - The tuning store carrying PlayerSkillGroupBucket: the group, bucket,
 *     skill and spline tables (generic Field_N schema; string pools recovered
 *     the same way as extract-mental-abilities.ts, anchored on known names).
 *   - Any CFB 27 save: the Player schema, to prove every skill's rating field
 *     really exists.
 *
 * Usage: node scripts/extract-skill-groups.ts [save] [--print]
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
import { ARCHETYPE_LABELS } from '../src/shared/archetypes.ts';

const mf: any = (mfModule as any).default ?? mfModule;
const OUT = 'src/shared/skill-groups.ts';
const savePath = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : 'samples/DYNASTY-DUKETOND-AUTOSAVE';
const printOnly = process.argv.includes('--print');

const fieldVal = (rec: any, key: string): any => {
  const f = rec?._fields?.[key];
  return f && 'value' in f ? f.value : undefined;
};
const refOf = (v: any): { t: number; row: number } | null => {
  if (typeof v === 'string' && /^[01]{32}$/.test(v)) {
    const t = parseInt(v.slice(0, 15), 2);
    const row = parseInt(v.slice(15), 2);
    return t || row ? { t, row } : null;
  }
  if (typeof v === 'number' && v > 0) return { t: v >>> 17, row: v & 0x1ffff };
  return null;
};

const layout = loadLayout(GAME_ROOT_DEFAULT);
const toc = parseSuperbundleToc(readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32', 'globals.toc')));

// ---- 1. Enum maps from the game's Core-Schemas ----
let xml = '';
for (const chunk of toc.chunks) {
  if (!chunk.guid.startsWith('9b964b0c')) continue;
  xml = (await decompressCasBlocksUnknownSize(layout, readRawCasBytes(layout, chunk.location))).toString('latin1');
  break;
}
if (!xml.includes('<FranTkData')) throw new Error('Core-Schemas chunk not found');
function enumMap(name: string): Map<number, string> {
  const at = xml.indexOf(`<enum name="${name}"`);
  if (at < 0) throw new Error(`enum ${name} not in Core-Schemas`);
  const block = xml.slice(at, xml.indexOf('</enum>', at));
  const m = new Map<number, string>();
  for (const x of block.matchAll(/<attribute name="([^"]+)" idx="\d+" value="(\d+)"/g)) {
    if (/_$/.test(x[1]) || /^(First_|Last_|Count|Max|Invalid|None)/.test(x[1])) continue;
    if (!m.has(Number(x[2]))) m.set(Number(x[2]), x[1]);
  }
  return m;
}
const PLAYER_TYPE = enumMap('PlayerType');
const PLAYER_ABILITY = enumMap('PlayerAbility');
if (PLAYER_TYPE.size < 60 || PLAYER_ABILITY.size < 40) {
  throw new Error(`enum sizes off: PlayerType ${PLAYER_TYPE.size}, PlayerAbility ${PLAYER_ABILITY.size}`);
}

// ---- 2. The tuning store carrying the skill-group tables ----
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-groups-'));
let store: any = null;
let image: Buffer | null = null;
for (const chunk of toc.chunks) {
  let payload: Buffer;
  try {
    payload = await decompressCasBlocksUnknownSize(layout, readRawCasBytes(layout, chunk.location));
  } catch {
    continue;
  }
  if (payload.length < 4 || payload[0] !== 0x78) continue;
  let img: Buffer;
  try {
    img = zlib.inflateSync(payload);
  } catch {
    continue;
  }
  if (img.subarray(0, 4).toString('latin1') !== 'FrTk') continue;
  if (!img.includes(Buffer.from('PlayerSkillGroupBucket'))) continue;
  const tmp = path.join(tmpDir, 'store.ftc');
  fs.writeFileSync(tmp, payload);
  try {
    store = await (mf.create ?? mf.FranchiseFile?.create)(tmp);
    image = img;
    break;
  } catch {
    continue;
  }
}
if (!store || !image) throw new Error('no tuning store with PlayerSkillGroupBucket opened');
const img: Buffer = image;

const tableByName = (name: string): any => (store.tables as any[]).find((t) => t.name === name);
const tableById = (id: number): any => (store.tables as any[]).find((t) => t.header?.tableId === id);
async function ready(t: any): Promise<any> {
  if (t && !t.recordsRead) await t.readRecords();
  return t;
}

/**
 * String pool recovery: the pool follows the table name in the image; each
 * row's string field is an offset into it. Candidate bases are ranked by how
 * many row offsets land on string starts, then the FIRST base whose recovered
 * strings include every anchor wins (the top-hit base is wrong for some pools).
 */
function recoverStrings(table: any, field: string, anchors: string[]): Map<number, string> {
  const out = new Map<number, string>();
  const nameAt = img.indexOf(Buffer.from(table.name + '\x00'));
  if (nameAt < 0) return out;
  const regionEnd = Math.min(img.length, nameAt + 400000);
  const offsets: { row: number; off: number }[] = [];
  (table.records as any[]).forEach((r: any, row: number) => {
    if (r.isEmpty) return;
    const v = Number(fieldVal(r, field));
    if (Number.isFinite(v) && v >= 0) offsets.push({ row, off: v });
  });
  if (!offsets.length) return out;
  const starts: number[] = [];
  for (let p = nameAt; p < regionEnd; p++) {
    if (img[p - 1] === 0 && img[p] >= 0x20 && img[p] < 0x7f && img[p + 1] >= 0x20 && img[p + 1] < 0x7f) starts.push(p);
  }
  const startSet = new Set(starts);
  const ranked: { base: number; hits: number }[] = [];
  // Candidate bases: every string start minus one of the first rows' offsets
  // (the first row's own string may be empty, i.e. the base sits on a NUL).
  const seeds = new Set<number>();
  for (const s of starts) for (const o of offsets.slice(0, 8)) seeds.add(s - o.off);
  for (const base of seeds) {
    if (base < nameAt || base > regionEnd) continue;
    let hits = 0;
    // A row's offset lands on a string start — or on a NUL, i.e. an empty
    // string (the group pool has many unnamed fallback rows).
    for (const o of offsets) if (startSet.has(base + o.off) || img[base + o.off] === 0) hits++;
    if (hits >= Math.max(2, Math.floor(offsets.length * 0.8))) ranked.push({ base, hits });
  }
  ranked.sort((a, b) => b.hits - a.hits);
  for (const { base } of ranked) {
    const got = new Map<number, string>();
    for (const o of offsets) {
      const at = base + o.off;
      const end = img.indexOf(0, at);
      const s = img.toString('latin1', at, end < 0 ? at : Math.min(end, at + 120));
      if (/^[\x20-\x7e]*$/.test(s)) got.set(o.row, s);
    }
    const values = new Set(got.values());
    if (anchors.every((a) => values.has(a))) return got;
  }
  return out;
}

const G = await ready(tableByName('PlayerSkillGroup'));
const B = await ready(tableByName('PlayerSkillGroupBucket'));
const S = await ready(tableByName('PlayerSkill'));
if (!G || !B || !S) throw new Error('skill-group tables missing from the store');

const bucketNames = recoverStrings(B, 'Field_6', ['Man Coverage', 'Pass Blocking', 'Kick Power', 'Health']);
const skillNames = recoverStrings(S, 'Field_1', ['Speed', 'Awareness']);
const groupNames = recoverStrings(G, 'Field_1', ['Bump and Run', 'Pocket Passer', 'Signal Caller']);
if (!bucketNames.size || !skillNames.size || !groupNames.size) {
  throw new Error(`string pools: buckets ${bucketNames.size}, skills ${skillNames.size}, groups ${groupNames.size}`);
}

// ---- 3. Save schema: the Player rating fields the skills must resolve to ----
const save = await (mf.create ?? mf.FranchiseFile?.create)(savePath);
const playerT = (save.tables as any[])
  .filter((x: any) => x.name === 'Player')
  .sort((a: any, b: any) => (b.header?.recordCapacity ?? 0) - (a.header?.recordCapacity ?? 0))[0];
await playerT.readRecords(['PlayerType']);
const playerFields = new Set<string>((playerT.schema?.attributes ?? []).map((a: any) => String(a.name)));
const ptAttr: any = (playerT.schema?.attributes ?? []).find((a: any) => a.name === 'PlayerType');
const saveMembers: any[] = ptAttr?.enum?.members ?? ptAttr?.enum?._members ?? [];
const saveArchetypes = new Map<number, string>();
for (const m of saveMembers) {
  const id = String(m._name ?? m.name ?? '');
  const value = Number(m._value ?? m.value);
  if (!id || /^(First|Last|Count)_?$/.test(id) || /_$/.test(id) || !Number.isFinite(value)) continue;
  if (!saveArchetypes.has(value)) saveArchetypes.set(value, id);
}

// ---- 4. Skills: row -> { name, field } ----
interface SkillDef {
  name: string;
  field: string;
}
const skills = new Map<number, SkillDef>();
const unresolved: string[] = [];
(S.records as any[]).forEach((r: any, row: number) => {
  if (r.isEmpty) return;
  const abilityValue = Number(fieldVal(r, 'Field_2'));
  const member = PLAYER_ABILITY.get(abilityValue);
  const name = skillNames.get(row) ?? '';
  if (!member || !name) return;
  const field = `${member}Rating`;
  if (!playerFields.has(field)) unresolved.push(`${name} → ${field}`);
  skills.set(row, { name, field });
});
if (unresolved.length) console.warn(`skills with no Player rating field (kept by name): ${unresolved.join(', ')}`);
if (skills.size < 40) throw new Error(`only ${skills.size} skills resolved`);

async function skillList(ref: { t: number; row: number } | null): Promise<SkillDef[]> {
  if (!ref) return [];
  const t = await ready(tableById(ref.t));
  const rec = t?.records?.[ref.row];
  if (!rec) return [];
  const out: SkillDef[] = [];
  for (const f of Object.values(rec._fields) as any[]) {
    const rr = refOf(f.value);
    if (!rr) continue;
    const s = skills.get(rr.row);
    if (s) out.push(s);
  }
  return out;
}
async function splineY(ref: { t: number; row: number } | null): Promise<number[]> {
  if (!ref) return [];
  const t = await ready(tableById(ref.t));
  const rec = t?.records?.[ref.row];
  if (!rec) return [];
  const arr = async (v: any): Promise<number[]> => {
    const rr = refOf(v);
    if (!rr) return [];
    const at = await ready(tableById(rr.t));
    const r2 = at?.records?.[rr.row];
    if (!r2) return [];
    return (Object.values(r2._fields) as any[]).map((f) => Number(f.value));
  };
  const xs = await arr(fieldVal(rec, 'Field_1'));
  const ys = await arr(fieldVal(rec, 'Field_2'));
  // Level splines run X = 1..20; anything else is not a per-level cost.
  if (xs.length !== ys.length || xs[0] !== 1) return [];
  return ys;
}

// ---- 5. Groups: archetype -> six ordered buckets ----
interface BucketDef {
  name: string;
  primary: SkillDef[];
  secondary: SkillDef[];
  tertiary: SkillDef[];
  rgb: [number, number, number];
  spCost: number[];
}
const byArchetype = new Map<number, { row: number; name: string; buckets: BucketDef[] }[]>();
for (let row = 0; row < G.records.length; row++) {
  const r = G.records[row];
  if (r.isEmpty) continue;
  const arch = Number(fieldVal(r, 'Field_0'));
  const listRef = refOf(fieldVal(r, 'Field_2'));
  if (!listRef) continue;
  const list = (await ready(tableById(listRef.t)))?.records?.[listRef.row];
  if (!list) continue;
  const buckets: BucketDef[] = [];
  for (const f of Object.values(list._fields) as any[]) {
    const rr = refOf(f.value);
    if (!rr) continue;
    const b = B.records[rr.row];
    if (!b) continue;
    buckets.push({
      name: bucketNames.get(rr.row) ?? '',
      primary: await skillList(refOf(fieldVal(b, 'Field_7'))),
      secondary: await skillList(refOf(fieldVal(b, 'Field_8'))),
      tertiary: await skillList(refOf(fieldVal(b, 'Field_10'))),
      rgb: [Number(fieldVal(b, 'Field_3')), Number(fieldVal(b, 'Field_2')), Number(fieldVal(b, 'Field_1'))],
      spCost: await splineY(refOf(fieldVal(b, 'Field_9')))
    });
  }
  byArchetype.set(arch, [...(byArchetype.get(arch) ?? []), { row, name: groupNames.get(row) ?? '', buckets }]);
}

// Position-level fallback rows share value 0 with the first archetype and
// carry no name; the archetype row is the one wearing the game's label.
const groups: Record<string, BucketDef[]> = {};
for (const [value, member] of saveArchetypes) {
  const rows = byArchetype.get(value) ?? [];
  const xmlName = PLAYER_TYPE.get(value);
  if (xmlName && xmlName !== member) console.warn(`PlayerType ${value}: save says ${member}, game says ${xmlName}`);
  const label = ARCHETYPE_LABELS[member];
  const pick =
    rows.length === 1 && rows[0].buckets.length === 6
      ? rows[0]
      : rows.find((r) => r.buckets.length === 6 && label && r.name === label) ??
        rows.find((r) => r.buckets.length === 6 && r.name);
  if (!pick) {
    console.warn(`no six-bucket group row for ${member} (${rows.length} rows)`);
    continue;
  }
  if (label && pick.name && pick.name !== label) {
    console.warn(`${member}: group name "${pick.name}" differs from archetype label "${label}"`);
  }
  if (pick.buckets.some((b) => !b.name)) throw new Error(`${member}: unnamed bucket`);
  groups[member] = pick.buckets;
}

// ---- 6. Cap ceiling from the progression tuning row ----
const tuning = await ready(tableByName('PlayerProgressionTuning'));
const capMax = Number(fieldVal(tuning?.records?.[0], 'Field_22'));

// Anchors that must hold; a title update that moves them should fail loudly.
const cb = groups['CB_MantoMan']?.map((b) => b.name).join('/');
if (cb !== 'Man Coverage/Zone Coverage/Quickness/Hands/Power/Run Stopping') throw new Error(`anchor CB_MantoMan → ${cb}`);
const kp = groups['KP_Power']?.map((b) => b.name).join('/');
if (kp !== 'Kick Power/IQ/Kick Accuracy/Quickness/Throw Power/Throw Accuracy') throw new Error(`anchor KP_Power → ${kp}`);
if (capMax !== 20) throw new Error(`anchor SkillGroupCapMax → ${capMax}`);
// Every archetype a real player wears must have its six groups; the enum also
// carries Madden-lineage members (long snappers, returners) no player uses.
const worn = new Set<string>();
for (const r of playerT.records as any[]) {
  if (r.isEmpty) continue;
  const pt = String(fieldVal(r, 'PlayerType') ?? '');
  if (pt) worn.add(pt);
}
const missing = [...worn].filter((m) => !groups[m]);
if (missing.length) throw new Error(`archetypes worn by players but without groups: ${missing.join(', ')}`);
const unusedWithoutGroups = [...saveArchetypes.values()].filter((m) => !groups[m] && !worn.has(m));
if (unusedWithoutGroups.length) console.log(`no groups (and no players) for: ${unusedWithoutGroups.join(', ')}`);
if (!groups['QB_FieldGeneral']?.[0]?.primary.some((s) => s.field === 'ThrowAccuracyShortRating')) {
  throw new Error('anchor QB_FieldGeneral slot 1 should level short accuracy');
}

// ---- 7. Emit ----
const keys = Object.keys(groups).sort();
const lines: string[] = [];
lines.push('/**');
lines.push(" * The game's player skill groups per archetype: which group each of the six");
lines.push(' * SkillGroupCap slots names, the skills (save rating fields) it levels, its');
lines.push(' * UI color and the skill-point price of each level (index = level − 1).');
lines.push(' *');
lines.push(' * GENERATED by scripts/extract-skill-groups.ts — do not edit by hand.');
lines.push(' *');
lines.push(" * Order is per ARCHETYPE (the save's PlayerType member), straight from the");
lines.push(" * tuning store's PlayerSkillGroup → PlayerSkillGroupBucket[] chain; slot k");
lines.push(' * is Player.SkillGroupCap{k+1}. Caps are levels on a 0–SKILL_GROUP_CAP_MAX');
lines.push(' * scale, not ratings.');
lines.push(' */');
lines.push('export interface SkillRef {');
lines.push('  /** The name the game shows for the skill. */');
lines.push('  name: string;');
lines.push('  /** The Player rating field it moves. */');
lines.push('  field: string;');
lines.push('}');
lines.push('');
lines.push('export interface SkillGroupDef {');
lines.push('  name: string;');
lines.push('  primary: SkillRef[];');
lines.push('  secondary: SkillRef[];');
lines.push('  tertiary: SkillRef[];');
lines.push('  rgb: [number, number, number];');
lines.push('  /** Skill points to buy each level, index = level − 1. */');
lines.push('  spCost: number[];');
lines.push('}');
lines.push('');
lines.push(`export const SKILL_GROUP_CAP_MAX = ${capMax};`);
lines.push('');
lines.push('export const SKILL_GROUPS: Record<string, SkillGroupDef[]> = {');
const refs = (l: SkillDef[]): string => `[${l.map((s) => `{ name: ${JSON.stringify(s.name)}, field: ${JSON.stringify(s.field)} }`).join(', ')}]`;
for (const k of keys) {
  lines.push(`  ${k}: [`);
  for (const b of groups[k]) {
    lines.push(
      `    { name: ${JSON.stringify(b.name)}, primary: ${refs(b.primary)}, secondary: ${refs(b.secondary)}, tertiary: ${refs(b.tertiary)}, rgb: [${b.rgb.join(', ')}], spCost: [${b.spCost.join(', ')}] },`
    );
  }
  lines.push('  ],');
}
lines.push('};');
lines.push('');
lines.push('/** The six groups for an archetype, or null when the game defines none. */');
lines.push('export function skillGroupsFor(archetype: string): SkillGroupDef[] | null {');
lines.push('  return SKILL_GROUPS[archetype] ?? null;');
lines.push('}');
lines.push('');

const out = lines.join('\n');
if (printOnly) console.log(out);
else {
  fs.writeFileSync(OUT, out, 'utf8');
  console.log(`${OUT}: ${keys.length} archetypes written`);
}
for (const k of keys) console.log(`  ${k.padEnd(24)} ${groups[k].map((b) => b.name).join(' / ')}`);
