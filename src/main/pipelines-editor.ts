/**
 * Pipelines editor: the form behind the Program Dashboard's Your Pipelines
 * EDIT control and the write that applies it. Same posture as the grades
 * editor — whole-payload validation, then one write to the <save>_RJ sibling
 * through writeEditedSave, verified on a cold reload.
 *
 * A school's pipelines are `Team.SchoolPipelineInfluenceList` → one array row
 * per school (42 slots, one per real pipeline) of refs into the shared
 * SchoolPipelineInfluence table (`{Pipeline, InfluenceLevel, InfluenceValue}`).
 * Adding a pipeline takes a free entry row and appends its ref; removing one
 * empties the row and compacts the array the way the game's own churn does
 * (RESEARCH "Pipeline editor"). The tier is written together with the value
 * from the observed band ladder so the pair never disagrees, whichever of the
 * two the game reads.
 */
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import type { PipelineEditEntry, PipelinesChanges, PipelinesForm } from '../shared/types.ts';
import {
  PIPELINE_TIERS,
  PIPELINE_VALUE_MAX,
  levelLabel,
  pipelineLabel,
  pipelineRegion,
  tierForValue,
  tierOfLevel
} from '../shared/pipeline-tiers.ts';
import { editedPathFor, enumMembers, fieldMax, firstEmptyRow, refString, writeEditedSave } from './editor.ts';
import { isNullRef, mainTable, refFromRecord, tableById, val } from './parser/franchise.ts';

const ARRAY_FIELD = 'SchoolPipelineInfluence';
const ZERO_REF = '0'.repeat(32);

interface Handles {
  team: any;
  /** The school's array row. */
  arr: any;
  /** Refs per school the array can hold. */
  capacity: number;
  entryTable: any;
  entryTableId: number;
  /** Pipeline member → its slot in the array and its entry row. */
  slots: Map<string, { slot: number; row: number }>;
}

function slotRef(arr: any, slot: number): { tableId: number; row: number } | null {
  return refFromRecord(arr, `${ARRAY_FIELD}${slot}`);
}

async function handles(franchise: any, teamRow: number): Promise<Handles> {
  const teamTable = mainTable(franchise, 'Team');
  await teamTable.readRecords(['DisplayName', 'SchoolPipelineInfluenceList']);
  const team = teamTable.records?.[teamRow];
  if (!team || team.isEmpty) throw new Error('No school at that row in the save.');
  const ref = refFromRecord(team, 'SchoolPipelineInfluenceList');
  // FCS filler schools carry no list — nothing to edit.
  if (isNullRef(ref)) throw new Error('The game keeps no pipelines for this school.');
  const arrTable = await tableById(franchise, ref.tableId);
  const arr = arrTable?.records?.[ref.row];
  if (!arr) throw new Error('The pipeline list is missing from the save.');
  const capacity = Number(arrTable.header?.numMembers) || Object.keys(arr._fields ?? {}).length;

  // Every school's refs point into the one SchoolPipelineInfluence table; an
  // empty list resolves it by name so a bare school can still take an add.
  const size = Number(arr.arraySize ?? 0);
  let entryTableId = -1;
  for (let i = 0; i < size; i++) {
    const r = slotRef(arr, i);
    if (r && !isNullRef(r)) {
      entryTableId = r.tableId;
      break;
    }
  }
  let entryTable: any;
  if (entryTableId >= 0) entryTable = await tableById(franchise, entryTableId);
  else {
    entryTable = (franchise.tables as any[])
      .filter((t) => t?.name === 'SchoolPipelineInfluence')
      .sort((a, b) => (b.header?.recordCapacity ?? 0) - (a.header?.recordCapacity ?? 0))[0];
    if (entryTable && !entryTable.recordsRead) await entryTable.readRecords();
    entryTableId = entryTable?.header?.tableId ?? -1;
  }
  if (!entryTable) throw new Error('The pipeline table is missing from the save.');

  const slots = new Map<string, { slot: number; row: number }>();
  for (let i = 0; i < size; i++) {
    const r = slotRef(arr, i);
    if (!r || isNullRef(r)) continue;
    if (r.tableId !== entryTableId) throw new Error('Pipeline entries span tables — unexpected save layout.');
    const e = entryTable.records?.[r.row];
    if (!e || e.isEmpty) continue;
    slots.set(String(val(e, 'Pipeline') ?? ''), { slot: i, row: r.row });
  }
  return { team, arr, capacity, entryTable, entryTableId, slots };
}

/** Real Pipeline members (Invalid dropped), from the schema. */
function pipelineMembers(entryTable: any): string[] {
  const probe = entryTable.records?.[0];
  return enumMembers(probe, 'Pipeline')
    .map((m) => m.name)
    .filter((n) => n !== 'Invalid');
}

function freeRows(entryTable: any): number {
  let n = 0;
  for (const r of entryTable.records as any[]) if (r.isEmpty) n++;
  return n;
}

function entryOf(entryTable: any, row: number, pipeline: string): PipelineEditEntry {
  const e = entryTable.records[row];
  const level = String(val(e, 'InfluenceLevel') ?? 'Unrecognized');
  return {
    pipeline,
    label: pipelineLabel(pipeline),
    region: pipelineRegion(pipeline),
    level,
    tier: tierOfLevel(level),
    value: Number(val(e, 'InfluenceValue') ?? 0)
  };
}

export async function buildPipelinesForm(franchise: any, teamRow: number, savePath: string): Promise<PipelinesForm> {
  const h = await handles(franchise, teamRow);
  const target = editedPathFor(savePath);
  const entries = [...h.slots.entries()]
    .map(([pipeline, s]) => entryOf(h.entryTable, s.row, pipeline))
    .sort((a, b) => b.tier - a.tier || b.value - a.value || a.label.localeCompare(b.label));
  const options = pipelineMembers(h.entryTable)
    .map((pipeline) => ({ pipeline, label: pipelineLabel(pipeline), region: pipelineRegion(pipeline) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const probe = h.entryTable.records?.[0];
  return {
    school: String(val(h.team, 'DisplayName') ?? ''),
    entries,
    options,
    levels: PIPELINE_TIERS.map((t) => ({ level: t.level, tier: t.tier, label: levelLabel(t.level), floor: t.floor })),
    valueMax: probe ? fieldMax(probe, 'InfluenceValue', PIPELINE_VALUE_MAX) : PIPELINE_VALUE_MAX,
    capacity: h.capacity,
    freeRows: freeRows(h.entryTable),
    targetFileName: basename(target),
    targetExists: existsSync(target)
  };
}

export async function applyPipelinesEdit(
  franchise: any,
  savePath: string,
  req: { teamRow: number } & PipelinesChanges,
  backupDir: string
): Promise<{ editedPath: string; added: number; updated: number; removed: number }> {
  const h = await handles(franchise, req.teamRow);
  const known = new Set(pipelineMembers(h.entryTable));
  const probe = h.entryTable.records?.[0];
  const valueMax = probe ? fieldMax(probe, 'InfluenceValue', PIPELINE_VALUE_MAX) : PIPELINE_VALUE_MAX;

  // ---- validate everything before touching anything ----
  const sets = req.set ?? [];
  const removes = req.remove ?? [];
  if (!Array.isArray(sets) || !Array.isArray(removes)) throw new Error('Bad pipeline changes.');
  const seen = new Set<string>();
  for (const s of sets) {
    if (!s || typeof s.pipeline !== 'string' || !known.has(s.pipeline)) {
      throw new Error(`Unknown pipeline: ${String(s?.pipeline)}`);
    }
    if (!Number.isInteger(s.value) || s.value < 0 || s.value > valueMax) {
      throw new Error(`Influence runs 0–${valueMax}.`);
    }
    if (seen.has(s.pipeline)) throw new Error(`${pipelineLabel(s.pipeline)} appears twice in the changes.`);
    seen.add(s.pipeline);
  }
  for (const p of removes) {
    if (typeof p !== 'string' || !known.has(p)) throw new Error(`Unknown pipeline: ${String(p)}`);
    if (seen.has(p)) throw new Error(`${pipelineLabel(p)} is both set and removed.`);
    seen.add(p);
    if (!h.slots.has(p)) throw new Error(`${pipelineLabel(p)} is not one of this school's pipelines.`);
  }
  const adds = sets.filter((s) => !h.slots.has(s.pipeline));
  const updates = sets.filter((s) => h.slots.has(s.pipeline));
  if (!adds.length && !updates.length && !removes.length) throw new Error('Nothing to change.');
  const size = Number(h.arr.arraySize ?? 0);
  const finalCount = size - removes.length + adds.length;
  if (finalCount > h.capacity) throw new Error(`A school's list holds at most ${h.capacity} pipelines.`);
  if (adds.length > freeRows(h.entryTable) + removes.length) {
    throw new Error('The save has no free pipeline rows left.');
  }

  // ---- removes, highest slot first so compaction never moves a pending one ----
  const removeSlots = removes
    .map((pipeline) => ({ pipeline, ...h.slots.get(pipeline)! }))
    .sort((a, b) => b.slot - a.slot);
  for (const { slot, row } of removeSlots) {
    const last = Number(h.arr.arraySize ?? 1) - 1;
    if (slot !== last) {
      h.arr[`${ARRAY_FIELD}${slot}`] = h.arr._fields[`${ARRAY_FIELD}${last}`].value;
    }
    h.arr[`${ARRAY_FIELD}${last}`] = ZERO_REF; // shrinks arraySize
    h.entryTable.records[row].empty();
  }

  // ---- updates in place: value, with the tier following it ----
  for (const s of updates) {
    const e = h.entryTable.records[h.slots.get(s.pipeline)!.row];
    e.InfluenceValue = s.value;
    e.InfluenceLevel = tierForValue(s.value).level;
  }

  // ---- adds: a free entry row each, appended to the array ----
  for (const s of adds) {
    const row = firstEmptyRow(h.entryTable);
    if (row < 0) throw new Error('The save has no free pipeline rows left.');
    const e = h.entryTable.records[row];
    e.Pipeline = s.pipeline;
    e.InfluenceLevel = tierForValue(s.value).level;
    e.InfluenceValue = s.value;
    const slot = Number(h.arr.arraySize ?? 0);
    h.arr[`${ARRAY_FIELD}${slot}`] = refString(h.entryTableId, row); // grows
  }
  // The library's own crash-prevention pass over the empty chain we touched.
  try {
    h.entryTable.recalculateEmptyRecordReferences?.();
  } catch {
    // bookkeeping helper only; the write itself is verified below
  }

  const { editedPath } = await writeEditedSave(franchise, savePath, backupDir, async (check) => {
    const h2 = await handles(check, req.teamRow);
    for (const s of sets) {
      const at = h2.slots.get(s.pipeline);
      if (!at) throw new Error('A pipeline did not read back on the list.');
      const e = h2.entryTable.records[at.row];
      const level = tierForValue(s.value).level;
      if (Number(val(e, 'InfluenceValue')) !== s.value || String(val(e, 'InfluenceLevel')) !== level) {
        throw new Error('The written save did not read back with the new influence.');
      }
    }
    for (const p of removes) {
      if (h2.slots.has(p)) throw new Error('A removed pipeline still reads back on the list.');
    }
    if (Number(h2.arr.arraySize ?? 0) !== finalCount) throw new Error('The pipeline count did not read back as expected.');
  });
  return { editedPath, added: adds.length, updated: updates.length, removed: removes.length };
}
