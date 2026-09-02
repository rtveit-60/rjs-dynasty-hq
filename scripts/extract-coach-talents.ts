/**
 * Generate src/shared/coach-talents.ts from the game's own data: the coach
 * talent trees (head coach: 13 subtrees; coordinators: the first 11), every
 * node's name / description / cost / branch, the node graph (which node
 * unlocks which), each subtree's archetype-node prerequisite, and the display
 * names of the CoachTalentArcheType / CoachBackstory enums.
 *
 * Sources (Win32/globals):
 *   - The franchise-common tuning store (the chunk carrying TalentSubTree,
 *     TalentNode, Talent, StaticTalentTree, TalentTreeTuning,
 *     TemplateTalentSubTree, CoachTalentPrerequisiteGoal, the *EnumTableEntry
 *     display tables). Records come back with generic schemas, so the
 *     attribute lists below are injected in the game's own member order
 *     (alphabetical per class, Core-Schemas XML) and strings read from each
 *     table's second-table string block.
 *   - A second, smaller FTC store holding TemplateTalentSubTreeNode (205 rows)
 *     and its ChildNodeList arrays: NodeIndex / Level / Column /
 *     EvaluationTemplate / children. The tuning store's TemplateNodeList
 *     arrays reference those rows by row number; sibling copies of the node
 *     store are byte-identical, so the first one that opens is used.
 *
 * Index conventions (verified against 2,392 live coach trees, RESEARCH "Coach
 * talent trees"): a coach's TalentSubTreeStatus[i] ↔ StaticTalentTree
 * .TalentSubTreeList[i]; TalentStatusN ↔ OrderedTalentNodeList[N] ↔ template
 * NodeIndex N. Node 0 is the archetype (gate) node; every other node has
 * exactly one parent.
 *
 * Usage: node scripts/extract-coach-talents.ts [--print]
 * Needs the installed game. Run after title updates; never hand-edit.
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
process.on('unhandledRejection', () => {});
const OUT = 'src/shared/coach-talents.ts';
const printOnly = process.argv.includes('--print');

const rawVal = (rec: any, key: string): any => {
  const f = rec?._fields?.[key];
  return f && 'value' in f ? f.value : undefined;
};
const I = (name: string, min = 0, max = 2147483647) => ({ name, type: 'int', minValue: String(min), maxValue: String(max) });
const B = (name: string) => ({ name, type: 'bool' });
const S = (name: string) => ({ name, type: 'string' });
const R = (name: string, type: string) => ({ name, type });
/** Member order = the game's own (alphabetical within the class). Strings are read as offsets. */
const SCHEMAS: Record<string, any[]> = {
  TalentSubTree: [B('CanBeDominant'), S('Description'), I('DominantPriority', 0, 100), S('Name'), R('OrderedTalentNodeList', 'TalentNode[]'), I('SubtreeArchetype', 0, 255), I('TalentTreeArchetype', 0, 255), R('TemplateTalentTree', 'TemplateTalentSubTree'), I('TreeType', 0, 3), I('Version', 0, 100)],
  TalentNode: [R('BranchInfo', 'TalentTreeBranchInfo'), B('IsArchetypeNode'), R('Prerequisite', 'CoachTalentPrerequisiteGoal'), S('ProgressLabel'), I('StaffPointCost', 0, 100), R('Talent', 'Talent')],
  Talent: [I('Behavior', 0, 3), R('Data', 'TalentData[]'), R('DCData', 'TalentData'), S('Description'), I('Duration', 0, 7), I('Effect', 0, 255), I('IconId', 0, 2000), S('Name'), R('OCData', 'TalentData'), I('TalentPosGroup', 0, 15)],
  StaticTalentTree: [R('TalentDisplayOrder', 'int[]'), R('TalentSubTreeList', 'TalentSubTree[]')],
  TemplateTalentSubTree: [I('MaxColumns', 0, 32), I('MaxRows', 0, 32), I('TalentTreeShapeId', 0, 100), R('TemplateNodeList', 'TemplateTalentSubTreeNode[]')],
  TemplateTalentSubTreeNode: [R('ChildNodeList', 'TemplateTalentSubTreeNode[]'), I('Column', 0, 10), I('EvaluationTemplate', 0, 7), I('Level', 0, 7), I('NodeIndex', 0, 44)],
  TalentTreeBranchInfo: [I('IconId', -1, 2000), S('Subtitle'), S('Title')],
  CoachTalentArchetypeEnumTableEntry: [S('Description'), S('LongName'), S('ShortName'), I('Value', 0, 255)],
  CoachBackstoryEnumTableEntry: [S('Description'), S('LongName'), S('ShortName'), I('Value', 0, 15)],
  TalentTreeTuning: [I('AutoProgressionArchetypeWeightMax', -64, 64), I('AutoProgressionArchetypeWeightMin', -64, 64), I('AutoProgressionPositionWeightMax', -64, 64), I('AutoProgressionPositionWeightMin', -64, 64), R('DefensiveCoordinatorTalentTree', 'StaticTalentTree'), R('HeadCoachTalentTree', 'StaticTalentTree'), R('OffensiveCoordinatorTalentTree', 'StaticTalentTree'), I('PlayerXPBoostWinStreakGameCount', 0, 7), { name: 'ProgressionFast', type: 'float' }, { name: 'ProgressionNormal', type: 'float' }, { name: 'ProgressionSlow', type: 'float' }, { name: 'ProgressionSlower', type: 'float' }, { name: 'ProgressionSlowest', type: 'float' }, I('RecruitingPointsBoostAccelerate_Divisor', 0, 31), R('TemplateStaticSubTreeStatus', 'TalentSubTreeStatus')]
};
/** CoachTalentPrerequisiteGoal: inheritance order Goal → CoachGoal → CoachMilestoneGoal → CoachStatMilestoneGoal → own, each alphabetical. */
const PREREQ_FIELDS = ['AchievementWeight', 'FromStats', 'IconAssetId', 'IconLibraryId', 'LegacyScoreAward', 'LegacyScoreContext', 'LegacyScoreMomentId', 'LegacyScoreTitle', 'CoachExperienceAward', 'CoachPrestigeScore', 'Description', 'DynastyPointAward', 'IconId', 'IsEvaluatedInGame', 'Title', 'SendEvent', 'StaffPointAward', 'CoachStat', 'CompletionValue', 'EvaluateAtEndOfSeason', 'IsInverted', 'IsRepeatable', 'StatPeriod', 'TeamStat', 'UseStatRanking', 'MinCoachLevel', 'PreOrderCurrentTitle', 'PreOrderPartnerTitle', 'TalentRequirements', 'TotalTalentSpendPoints'];

const layout = loadLayout(GAME_ROOT_DEFAULT);
const toc = parseSuperbundleToc(readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32', 'globals.toc')));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-talents-'));

interface Store {
  store: any;
  image: Buffer;
  guid: string;
}
async function openStores(): Promise<{ tuning: Store; nodes: Store }> {
  let tuning: Store | null = null;
  let nodes: Store | null = null;
  let idx = 0;
  for (const chunk of toc.chunks) {
    if (tuning && nodes) break;
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
    const wantTuning = !tuning && image.includes(Buffer.from('TalentTreeTuning')) && image.includes(Buffer.from('TalentSubTree'));
    const wantNodes = !nodes && image.includes(Buffer.from('TemplateTalentSubTreeNode'));
    if (!wantTuning && !wantNodes) continue;
    const tmp = path.join(tmpDir, `s${idx++}.ftc`);
    fs.writeFileSync(tmp, payload);
    let store: any;
    try {
      store = await (mf.create ?? mf.FranchiseFile?.create)(tmp);
    } catch {
      continue;
    }
    const tables: any[] = store.tables;
    if (wantTuning && tables.some((t) => t.name === 'TalentTreeTuning') && tables.some((t) => t.name === 'TalentSubTree')) {
      tuning = { store, image, guid: chunk.guid };
    }
    // The node store: the plain table (not its `[]` arrays), 205 rows.
    const nodeT = tables.find((t) => t.name === 'TemplateTalentSubTreeNode' && t.header?.numMembers === 5);
    if (wantNodes && nodeT && nodeT.header.recordCapacity >= 100) {
      nodes = { store, image, guid: chunk.guid };
    }
  }
  if (!tuning) throw new Error('tuning store with TalentTreeTuning not found');
  if (!nodes) throw new Error('template node store (TemplateTalentSubTreeNode) not found');
  return { tuning, nodes };
}
const { tuning, nodes: nodeStore } = await openStores();

/** Table access on one store: inject the known schema (strings as offsets), read once. */
function accessor(s: Store) {
  const byId = new Map<number, any>();
  for (const t of s.store.tables as any[]) byId.set(t.header.tableId, t);
  const byName = (name: string, members?: number): any =>
    (s.store.tables as any[]).find((t) => t.name === name && (members === undefined || t.header?.numMembers === members));
  const read = async (t: any): Promise<any> => {
    if (!t) throw new Error('missing table');
    if (!t.recordsRead) {
      const sc = SCHEMAS[t.name];
      if (sc && t.header.numMembers === sc.length) {
        t.schema = {
          name: t.name,
          attributes: sc.map((a) => (a.type === 'string' ? { name: a.name, type: 'int', minValue: '0', maxValue: '4294967295' } : { ...a }))
        };
      }
      await t.readRecords();
    }
    return t;
  };
  const t2str = (t: any, v: any): string => {
    const h = t.header;
    const t2: Buffer = t.data.subarray(h.table2StartIndex, h.table2StartIndex + h.table2Length);
    const off = Number(v);
    if (!Number.isFinite(off) || off < 0 || off >= t2.length) return '';
    const end = t2.indexOf(0, off);
    return t2.toString('latin1', off, end < 0 ? t2.length : end);
  };
  const str = (t: any, row: number, key: string): string => {
    const v = rawVal(t.records[row], key);
    return typeof v === 'string' ? v : t2str(t, v);
  };
  const ref = (rec: any, k: string): { tableId: number; row: number } | null => {
    const rd = rec?._fields?.[k]?.referenceData;
    return rd?.tableId ? { tableId: rd.tableId, row: rd.rowNumber ?? rd.row } : null;
  };
  const arrRefs = async (r: { tableId: number; row: number }): Promise<({ tableId: number; row: number } | null)[]> => {
    const t = await read(byId.get(r.tableId));
    const rec = t.records[r.row];
    const fields: any[] = rec.fieldsArray ?? Object.values(rec._fields);
    const size = typeof rec.arraySize === 'number' ? rec.arraySize : fields.length;
    return fields.slice(0, size).map((f) => (f?.referenceData?.tableId ? { tableId: f.referenceData.tableId, row: f.referenceData.rowNumber ?? f.referenceData.row } : null));
  };
  return { byId, byName, read, str, ref, arrRefs };
}
const T = accessor(tuning);
const N = accessor(nodeStore);

// ---- 1. Template node graphs (node store) ----
interface TplNode {
  index: number;
  level: number;
  column: number;
  evalRule: number;
  children: number[]; // NodeIndex values
}
const nodeT = await N.read(N.byName('TemplateTalentSubTreeNode', 5));
const tplByRow = new Map<number, TplNode>();
{
  const rowIndex = new Map<number, number>();
  (nodeT.records as any[]).forEach((r, row) => {
    if (!r.isEmpty) rowIndex.set(row, Number(rawVal(r, 'NodeIndex')));
  });
  for (let row = 0; row < nodeT.records.length; row++) {
    const r = nodeT.records[row];
    if (r.isEmpty) continue;
    const cref = N.ref(r, 'ChildNodeList');
    const children: number[] = [];
    if (cref) {
      for (const c of await N.arrRefs(cref)) {
        if (!c) continue;
        const idx = rowIndex.get(c.row);
        if (idx === undefined) throw new Error(`child ref to unknown node row ${c.row}`);
        children.push(idx);
      }
    }
    tplByRow.set(row, {
      index: Number(rawVal(r, 'NodeIndex')),
      level: Number(rawVal(r, 'Level')),
      column: Number(rawVal(r, 'Column')),
      evalRule: Number(rawVal(r, 'EvaluationTemplate')),
      children
    });
  }
}

// ---- 2. Prerequisite goals (tuning store, generic schema by member order) ----
interface Prereq {
  title: string;
  desc: string;
  minLevel: number;
  spendPoints: number;
}
const prereqByRow = new Map<number, Prereq>();
{
  const t = T.byName('CoachTalentPrerequisiteGoal');
  if (!t) throw new Error('CoachTalentPrerequisiteGoal missing');
  if (t.header.numMembers !== PREREQ_FIELDS.length) throw new Error(`CoachTalentPrerequisiteGoal has ${t.header.numMembers} members, expected ${PREREQ_FIELDS.length}`);
  await t.readRecords();
  const k = (name: string): string => `Field_${PREREQ_FIELDS.indexOf(name)}`;
  (t.records as any[]).forEach((r, row) => {
    if (r.isEmpty) return;
    prereqByRow.set(row, {
      title: T.str(t, row, k('Title')),
      desc: T.str(t, row, k('Description')),
      minLevel: Number(rawVal(r, k('MinCoachLevel'))),
      spendPoints: Number(rawVal(r, k('TotalTalentSpendPoints')))
    });
  });
  const arch = [...prereqByRow.values()].find((p) => p.title === 'Architect Prerequisites');
  if (!arch || arch.desc !== 'Win 4 Rivalry Games') throw new Error(`prereq anchor: ${JSON.stringify(arch)}`);
}

// ---- 3. Enum display names ----
async function enumNames(table: string, valueField = 'Value', nameField = 'ShortName'): Promise<Record<number, string>> {
  const t = await T.read(T.byName(table));
  if (!t) throw new Error(`${table} missing`);
  const out: Record<number, string> = {};
  (t.records as any[]).forEach((r, row) => {
    if (r.isEmpty) return;
    const v = Number(rawVal(r, valueField));
    const name = T.str(t, row, nameField).trim();
    if (Number.isFinite(v) && name && !(v in out)) out[v] = name;
  });
  return out;
}
const ARCHETYPE_NAMES = await enumNames('CoachTalentArchetypeEnumTableEntry');
const BACKSTORY_NAMES = await enumNames('CoachBackstoryEnumTableEntry');
if (ARCHETYPE_NAMES[1] !== 'Tactician' || ARCHETYPE_NAMES[12] !== 'CEO') throw new Error(`archetype names anchor: ${JSON.stringify(ARCHETYPE_NAMES)}`);
if (Object.keys(BACKSTORY_NAMES).length !== 3) throw new Error(`backstory names: ${JSON.stringify(BACKSTORY_NAMES)}`);

// ---- 4. Static trees ----
interface NodeDef {
  index: number;
  name: string;
  desc: string;
  cost: number;
  level: number;
  column: number;
  parent: number | null;
  children: number[];
  branch: string | null;
}
interface SubTreeDef {
  slot: number;
  name: string;
  desc: string;
  type: string;
  archetype: number;
  canBeDominant: boolean;
  prereq: Prereq | null;
  nodes: NodeDef[];
}
const TREE_TYPES = ['Base', 'Hybrid', 'Specialty'];

async function readTree(treeRef: { tableId: number; row: number }): Promise<SubTreeDef[]> {
  const stt = await T.read(T.byId.get(treeRef.tableId));
  const srec = stt.records[treeRef.row];
  const subRefs = await T.arrRefs(T.ref(srec, 'TalentSubTreeList')!);
  const out: SubTreeDef[] = [];
  for (let slot = 0; slot < subRefs.length; slot++) {
    const sr = subRefs[slot];
    if (!sr) throw new Error(`empty subtree slot ${slot}`);
    const st = await T.read(T.byId.get(sr.tableId));
    const s = st.records[sr.row];
    // template graph for this subtree
    const tplRef = T.ref(s, 'TemplateTalentTree');
    if (!tplRef) throw new Error(`subtree slot ${slot} has no template`);
    const tt = await T.read(T.byId.get(tplRef.tableId));
    const listRef = T.ref(tt.records[tplRef.row], 'TemplateNodeList');
    if (!listRef) throw new Error(`template row ${tplRef.row} has no node list`);
    const graph = new Map<number, TplNode>();
    for (const nr of await T.arrRefs(listRef)) {
      if (!nr) continue;
      const tn = tplByRow.get(nr.row);
      if (!tn) throw new Error(`template node row ${nr.row} not in the node store`);
      graph.set(tn.index, tn);
    }
    const parentOf = new Map<number, number>();
    for (const tn of graph.values()) for (const c of tn.children) parentOf.set(c, tn.index);

    const nodeRefs = await T.arrRefs(T.ref(s, 'OrderedTalentNodeList')!);
    const nodes: NodeDef[] = [];
    let prereq: Prereq | null = null;
    for (let i = 0; i < nodeRefs.length; i++) {
      const nr = nodeRefs[i];
      if (!nr) throw new Error(`slot ${slot} node ${i} empty`);
      const nt = await T.read(T.byId.get(nr.tableId));
      const n = nt.records[nr.row];
      const tr = T.ref(n, 'Talent');
      if (!tr) throw new Error(`slot ${slot} node ${i} has no talent`);
      const tt2 = await T.read(T.byId.get(tr.tableId));
      const br = T.ref(n, 'BranchInfo');
      let branch: string | null = null;
      if (br) {
        const bt = await T.read(T.byId.get(br.tableId));
        branch = T.str(bt, br.row, 'Title').trim() || null;
      }
      const pr = T.ref(n, 'Prerequisite');
      if (i === 0 && pr) prereq = prereqByRow.get(pr.row) ?? null;
      const g = graph.get(i);
      if (!g) throw new Error(`slot ${slot}: no template node for index ${i}`);
      nodes.push({
        index: i,
        name: T.str(tt2, tr.row, 'Name').trim(),
        desc: T.str(tt2, tr.row, 'Description').trim(),
        cost: Number(rawVal(n, 'StaffPointCost')),
        level: g.level,
        column: g.column,
        parent: i === 0 ? null : (parentOf.get(i) ?? null),
        children: g.children.filter((c) => c < nodeRefs.length).sort((a, b) => a - b),
        branch
      });
    }
    if (nodes.some((n) => n.index !== 0 && n.parent === null)) throw new Error(`slot ${slot}: orphan node`);
    out.push({
      slot,
      name: T.str(st, sr.row, 'Name').trim(),
      desc: T.str(st, sr.row, 'Description').trim(),
      type: TREE_TYPES[Number(rawVal(s, 'TreeType'))] ?? String(rawVal(s, 'TreeType')),
      archetype: Number(rawVal(s, 'TalentTreeArchetype')),
      canBeDominant: rawVal(s, 'CanBeDominant') === true,
      prereq,
      nodes
    });
  }
  return out;
}
const tune = await T.read(T.byName('TalentTreeTuning'));
const trec = (tune.records as any[]).find((r) => !r.isEmpty);
const hcRef = T.ref(trec, 'HeadCoachTalentTree');
const ocRef = T.ref(trec, 'OffensiveCoordinatorTalentTree');
const dcRef = T.ref(trec, 'DefensiveCoordinatorTalentTree');
if (!hcRef || !ocRef || !dcRef) throw new Error('TalentTreeTuning tree refs missing');
const HC = await readTree(hcRef);
const OC = await readTree(ocRef);
const DC = await readTree(dcRef);

// ---- 5. Anchors ----
const hcNames = HC.map((s) => s.name);
const EXPECT = ['Motivator', 'Tactician', 'Recruiter', 'Master Motivator', 'Architect', 'Scheme Guru', 'Strategist', 'Elite Recruiter', 'Talent Developer', 'Rainmaker', 'Visionary', 'Program Builder', 'CEO'];
if (hcNames.join('|') !== EXPECT.join('|')) throw new Error(`HC subtree order: ${hcNames.join(' / ')}`);
if (JSON.stringify(OC) !== JSON.stringify(DC)) throw new Error('OC and DC trees differ');
if (OC.length !== 11 || JSON.stringify(OC) !== JSON.stringify(HC.slice(0, 11))) throw new Error('coordinator tree is not the first 11 HC subtrees');
const counts = HC.map((s) => s.nodes.length).join(',');
if (counts !== '33,33,33,33,33,33,33,33,33,5,5,22,10') throw new Error(`node counts: ${counts}`);
for (const s of HC) {
  if (s.nodes[0].parent !== null || s.nodes[0].cost < 0) throw new Error(`${s.name}: bad root`);
  for (const n of s.nodes) {
    if (n.index === 0) continue;
    const p = s.nodes[n.parent!];
    if (!p || !p.children.includes(n.index)) throw new Error(`${s.name} node ${n.index}: parent/child mismatch`);
  }
}
if (HC[12].archetype !== 12 || HC[11].archetype !== 11) throw new Error('CEO / Program Builder slots');
if (HC[0].prereq?.minLevel !== 10 || HC[12].prereq?.spendPoints !== 500) throw new Error('prereq anchors');

// ---- 6. Emit ----
const lines: string[] = [];
lines.push('/**');
lines.push(" * The game's coach talent trees: the head coach's 13 subtrees (coordinators");
lines.push(' * use the first 11), every node with its name, description, cost, screen');
lines.push(' * position, parent/children links and branch title, each subtree\'s');
lines.push(" * archetype-node prerequisite, and the enums' display names.");
lines.push(' *');
lines.push(' * GENERATED by scripts/extract-coach-talents.ts — do not edit by hand.');
lines.push(' *');
lines.push(" * Slot i is the coach's TalentSubTreeStatus[i]; node index N is that row's");
lines.push(' * TalentStatusN. Node 0 is the archetype (gate) node; every other node has');
lines.push(' * exactly one parent and becomes purchasable when the parent is owned.');
lines.push(' * Archetype value 1 is "Schemer" in the save enum but "Tactician" on screen —');
lines.push(' * map by value.');
lines.push(' */');
lines.push('export interface CoachTalentNode {');
lines.push('  index: number;');
lines.push('  name: string;');
lines.push('  desc: string;');
lines.push('  /** Coach points the game charges. */');
lines.push('  cost: number;');
lines.push('  /** Screen row (0 = the archetype node) and column. */');
lines.push('  level: number;');
lines.push('  column: number;');
lines.push('  parent: number | null;');
lines.push('  children: number[];');
lines.push('  /** Branch heading the game shows on a level-1 node, when it has one. */');
lines.push('  branch: string | null;');
lines.push('}');
lines.push('');
lines.push('export interface CoachTalentSubTree {');
lines.push('  slot: number;');
lines.push('  name: string;');
lines.push('  desc: string;');
lines.push("  type: 'Base' | 'Hybrid' | 'Specialty';");
lines.push('  /** CoachTalentArcheType value this subtree represents. */');
lines.push('  archetype: number;');
lines.push('  canBeDominant: boolean;');
lines.push("  /** What unlocks the archetype node in-game (the game evaluates it natively). */");
lines.push('  prereq: { title: string; desc: string; minLevel: number; spendPoints: number } | null;');
lines.push('  nodes: CoachTalentNode[];');
lines.push('}');
lines.push('');
lines.push('/** CoachTalentArcheType value → the name the game shows. */');
lines.push(`export const COACH_ARCHETYPE_NAMES: Record<number, string> = ${JSON.stringify(ARCHETYPE_NAMES)};`);
lines.push('');
lines.push('/** CoachBackstory value → the name the game shows (only these three are named). */');
lines.push(`export const COACH_BACKSTORY_NAMES: Record<number, string> = ${JSON.stringify(BACKSTORY_NAMES)};`);
lines.push('');
lines.push('export const HEAD_COACH_TALENT_TREE: CoachTalentSubTree[] = [');
for (const s of HC) {
  lines.push(`  {`);
  lines.push(`    slot: ${s.slot}, name: ${JSON.stringify(s.name)}, desc: ${JSON.stringify(s.desc)}, type: ${JSON.stringify(s.type)}, archetype: ${s.archetype}, canBeDominant: ${s.canBeDominant},`);
  lines.push(`    prereq: ${JSON.stringify(s.prereq)},`);
  lines.push(`    nodes: [`);
  for (const n of s.nodes) {
    lines.push(`      { index: ${n.index}, name: ${JSON.stringify(n.name)}, desc: ${JSON.stringify(n.desc)}, cost: ${n.cost}, level: ${n.level}, column: ${n.column}, parent: ${n.parent}, children: [${n.children.join(', ')}], branch: ${JSON.stringify(n.branch)} },`);
  }
  lines.push(`    ]`);
  lines.push(`  },`);
}
lines.push('];');
lines.push('');
lines.push('/** Coordinators run the same tree without the two head-coach specialties. */');
lines.push('export const COORDINATOR_TALENT_TREE: CoachTalentSubTree[] = HEAD_COACH_TALENT_TREE.slice(0, 11);');
lines.push('');
lines.push("/** The tree for a save Position member ('HeadCoach' | 'OffensiveCoordinator' | 'DefensiveCoordinator'). */");
lines.push('export function coachTalentTree(position: string): CoachTalentSubTree[] {');
lines.push("  return position === 'HeadCoach' ? HEAD_COACH_TALENT_TREE : COORDINATOR_TALENT_TREE;");
lines.push('}');
lines.push('');

const out = lines.join('\n');
if (printOnly) console.log(out);
else {
  fs.writeFileSync(OUT, out, 'utf8');
  console.log(`${OUT}: ${HC.length} subtrees, ${HC.reduce((a, s) => a + s.nodes.length, 0)} nodes (stores ${tuning.guid.slice(0, 8)} + ${nodeStore.guid.slice(0, 8)})`);
}
for (const s of HC) console.log(`  ${String(s.slot).padStart(2)} ${s.name.padEnd(18)} ${s.type.padEnd(9)} ${s.nodes.length} nodes, root ${s.nodes[0].name} (${s.nodes[0].cost}) — ${s.prereq?.desc || s.prereq?.title || '-'}`);
