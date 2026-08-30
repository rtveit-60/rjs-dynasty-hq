/**
 * Player/recruit editing. The one place in the app that writes save data —
 * and it never writes the user's own file: edits always land in a sibling
 * save named <original>_RJsEdited (an already-edited save updates itself,
 * after a timestamped backup). The parse pipeline stays read-only.
 *
 * Write mechanics proven against real saves (see docs/RESEARCH.md
 * "Player editing"): ints must be clamped before writing (out-of-range
 * values bit-wrap silently — 200 into a 7-bit rating reads back as 72),
 * strings truncate silently past the schema's maxLength, and enum fields
 * accept member NAME strings only, never numbers.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import type {
  EditMentalSlot,
  PlayerEditChanges,
  PlayerEditForm,
  ResourceForm
} from '../shared/types.ts';
import { MENTAL_ABILITIES } from '../shared/mental-abilities.ts';
import { PHYSICAL_ABILITY_SLOTS } from '../shared/physical-abilities.ts';
import { BY_GROUP, COMMON, GROUP_OF } from './parser/recruit-card.ts';
import { loadFranchise, mainTable, refFromRecord, tableById, val } from './parser/franchise.ts';

export const EDIT_SUFFIX = '_RJsEdited';
const BACKUPS_KEPT = 10;

/** Where an edit of this save lands. An already-edited save updates in place. */
export function editedPathFor(savePath: string): string {
  return savePath.endsWith(EDIT_SUFFIX) ? savePath : savePath + EDIT_SUFFIX;
}

const EDIT_BASE_FIELDS = [
  'FirstName',
  'LastName',
  'JerseyNum',
  'Position',
  'PlayerType',
  'MentalAbility1', 'MentalAbility2', 'MentalAbility3',
  'MentalAbilityRank1', 'MentalAbilityRank2', 'MentalAbilityRank3',
  'PhysicalAbility1', 'PhysicalAbility2', 'PhysicalAbility3', 'PhysicalAbility4', 'PhysicalAbility5'
];

/** The position's rating sheet, same fields and order the profile shows. */
function ratingSpecFor(position: string): [string, string][] {
  const spec = [...(BY_GROUP[GROUP_OF[position]] ?? []), ...COMMON];
  return spec.filter(([field], i) => spec.findIndex(([f]) => f === field) === i);
}

function allRatingFields(): string[] {
  const out = new Set<string>(COMMON.map(([f]) => f));
  for (const list of Object.values(BY_GROUP)) for (const [f] of list) out.add(f);
  return [...out];
}

/** Real enum member names off a field, markers dropped, aliases deduped by value. */
function enumMembers(rec: any, field: string): { name: string; value: number }[] {
  const en = rec?._fields?.[field]?.offset?.enum;
  const members: any[] = en?._members ?? en?.members ?? [];
  const seen = new Set<number>();
  const out: { name: string; value: number }[] = [];
  for (const m of members) {
    const name = String(m?._name ?? m?.name ?? '');
    const value = Number(m?._value ?? m?.value ?? NaN);
    if (!name || !Number.isFinite(value)) continue;
    if (/(^First_|^Last_|^Count_)/.test(name) || /_$/.test(name)) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ name, value });
  }
  return out;
}

function stringCap(rec: any, field: string, fallback: number): number {
  const n = Number(rec?._fields?.[field]?.offset?.maxLength);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function playerRecord(franchise: any, playerRow: number): Promise<any> {
  const table = mainTable(franchise, 'Player');
  await table.readRecords([...EDIT_BASE_FIELDS, ...allRatingFields()]);
  const rec = table.records?.[playerRow];
  if (!rec || rec.isEmpty) throw new Error('No player at that row in the save.');
  return rec;
}

/** Whether a Recruit row points at this player (recruits carry no jersey in game). */
async function isRecruitRow(franchise: any, playerRow: number): Promise<boolean> {
  try {
    const playerTableId = mainTable(franchise, 'Player').header?.tableId;
    const recruits = mainTable(franchise, 'Recruit');
    await recruits.readRecords(['Player']);
    for (const r of recruits.records as any[]) {
      if (r.isEmpty) continue;
      const ref = refFromRecord(r, 'Player');
      if (ref && ref.tableId === playerTableId && ref.row === playerRow) return true;
    }
  } catch {
    // no Recruit table (offseason states) — treat as rostered
  }
  return false;
}

export async function buildEditForm(
  franchise: any,
  playerRow: number,
  savePath: string
): Promise<PlayerEditForm> {
  const rec = await playerRecord(franchise, playerRow);
  const recruit = await isRecruitRow(franchise, playerRow);
  const position = String(val(rec, 'Position') ?? '');
  const first = String(val(rec, 'FirstName') ?? '').trim();
  const last = String(val(rec, 'LastName') ?? '').trim();

  const mental: EditMentalSlot[] = [1, 2, 3].map((slot) => ({
    slot,
    ability: String(val(rec, `MentalAbility${slot}`) ?? 'None'),
    rank: String(val(rec, `MentalAbilityRank${slot}`) ?? 'None')
  }));

  // Options the save schema actually accepts, labeled with the game's names.
  const mentalOptions = enumMembers(rec, 'MentalAbility1')
    .filter((m) => m.value !== 0)
    .map((m) => ({
      id: m.name,
      name: MENTAL_ABILITIES[m.name]?.name ?? m.name,
      desc: MENTAL_ABILITIES[m.name]?.desc ?? null
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const ranks = enumMembers(rec, 'MentalAbilityRank1');
  const rankOptions = ['None', ...ranks.filter((r) => r.value !== 0).map((r) => r.name)];

  const slotNames = PHYSICAL_ABILITY_SLOTS[String(val(rec, 'PlayerType') ?? '')] ?? [];
  const physical = [1, 2, 3, 4, 5]
    .filter((slot) => slotNames[slot - 1])
    .map((slot) => ({
      slot,
      name: slotNames[slot - 1] as string,
      rank: String(val(rec, `PhysicalAbility${slot}`) ?? 'None')
    }));

  const target = editedPathFor(savePath);
  const jerseyRaw = Number(val(rec, 'JerseyNum'));
  return {
    playerRow,
    name: `${first} ${last}`.trim(),
    position,
    firstName: first,
    lastName: last,
    maxFirstLen: stringCap(rec, 'FirstName', 17),
    maxLastLen: stringCap(rec, 'LastName', 21),
    jersey: recruit ? null : Number.isFinite(jerseyRaw) ? jerseyRaw : 0,
    isRecruit: recruit,
    ratings: ratingSpecFor(position).map(([field, label]) => {
      const v = Number(val(rec, field));
      return { field, label, value: Number.isFinite(v) ? v : 0 };
    }),
    mental,
    mentalOptions,
    rankOptions,
    physical,
    targetFileName: basename(target),
    targetExists: existsSync(target)
  };
}

/** Full validation before anything is applied — a bad payload changes nothing. */
function validate(rec: any, changes: PlayerEditChanges): string | null {
  const nameOk = (s: string): boolean => /^[\x20-\x7e]+$/.test(s);
  if (changes.firstName !== undefined) {
    const v = changes.firstName.trim();
    const cap = stringCap(rec, 'FirstName', 17);
    if (!v) return 'First name cannot be empty.';
    if (v.length > cap) return `First name is capped at ${cap} characters by the save format.`;
    if (!nameOk(v)) return 'First name has characters the save cannot store.';
  }
  if (changes.lastName !== undefined) {
    const v = changes.lastName.trim();
    const cap = stringCap(rec, 'LastName', 21);
    if (!v) return 'Last name cannot be empty.';
    if (v.length > cap) return `Last name is capped at ${cap} characters by the save format.`;
    if (!nameOk(v)) return 'Last name has characters the save cannot store.';
  }
  if (changes.jersey !== undefined) {
    if (!Number.isInteger(changes.jersey) || changes.jersey < 0 || changes.jersey > 99) {
      return 'Jersey number must be 0–99.';
    }
  }
  if (changes.ratings) {
    const allowed = new Set(allRatingFields());
    for (const [field, value] of Object.entries(changes.ratings)) {
      if (!allowed.has(field) || !rec._fields?.[field]) return `Unknown rating field: ${field}`;
      if (!Number.isInteger(value) || value < 0 || value > 99) {
        return `${field} must be 0–99.`;
      }
    }
  }
  const rankNames = new Set(enumMembers(rec, 'MentalAbilityRank1').map((m) => m.name));
  if (changes.mental) {
    const abilityNames = new Set(enumMembers(rec, 'MentalAbility1').map((m) => m.name));
    for (const m of changes.mental) {
      if (![1, 2, 3].includes(m.slot)) return 'Bad mental-ability slot.';
      if (!abilityNames.has(m.ability)) return `Unknown mental ability: ${m.ability}`;
      if (!rankNames.has(m.rank)) return `Unknown ability tier: ${m.rank}`;
    }
  }
  if (changes.physical) {
    for (const p of changes.physical) {
      if (![1, 2, 3, 4, 5].includes(p.slot)) return 'Bad physical-ability slot.';
      if (!rankNames.has(p.rank)) return `Unknown ability tier: ${p.rank}`;
    }
  }
  return null;
}

function apply(rec: any, changes: PlayerEditChanges): void {
  if (changes.firstName !== undefined) rec.FirstName = changes.firstName.trim();
  if (changes.lastName !== undefined) rec.LastName = changes.lastName.trim();
  if (changes.jersey !== undefined) rec.JerseyNum = changes.jersey;
  if (changes.ratings) {
    for (const [field, value] of Object.entries(changes.ratings)) rec[field] = value;
  }
  for (const m of changes.mental ?? []) {
    rec[`MentalAbility${m.slot}`] = m.ability;
    // A slot without an ability holds no tier either.
    rec[`MentalAbilityRank${m.slot}`] = m.ability === 'None' ? 'None' : m.rank;
  }
  for (const p of changes.physical ?? []) {
    rec[`PhysicalAbility${p.slot}`] = p.rank;
  }
}

function backUp(target: string, backupDir: string): string | null {
  if (!existsSync(target)) return null;
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = join(backupDir, `${basename(target)}.${stamp}`);
  copyFileSync(target, backupPath);
  // Keep the newest few per save name; an edited save also lives next to its
  // untouched original, so this is belt over braces.
  const prefix = `${basename(target)}.`;
  const siblings = readdirSync(backupDir)
    .filter((f) => f.startsWith(prefix))
    .map((f) => ({ f, t: statSync(join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const old of siblings.slice(BACKUPS_KEPT)) {
    try {
      rmSync(join(backupDir, old.f));
    } catch {
      // a locked backup is not worth failing the edit over
    }
  }
  return backupPath;
}

async function saveWithRetry(franchise: any, target: string): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await franchise.save(target);
      return;
    } catch (err) {
      lastErr = err;
      // OneDrive briefly holds files in the synced saves folder — back off and retry.
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/**
 * Shared write plumbing: back up an existing target, save with retries, run
 * the caller's cold verify against a fresh load of the written file, and roll
 * back (backup restored / new file removed) on any failure.
 */
async function writeEditedSave(
  franchise: any,
  savePath: string,
  backupDir: string,
  verify: (check: any) => Promise<void>
): Promise<{ editedPath: string }> {
  const target = editedPathFor(savePath);
  const backupPath = backUp(target, join(backupDir, 'backups'));
  const existedBefore = backupPath !== null;
  try {
    await saveWithRetry(franchise, target);
    await verify(await loadFranchise(target));
  } catch (err) {
    try {
      if (backupPath) copyFileSync(backupPath, target);
      else if (!existedBefore && existsSync(target)) rmSync(target);
    } catch {
      // rollback is best effort; the original save was never touched either way
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
  return { editedPath: target };
}

/**
 * Validate, apply to the in-memory franchise, write the _RJsEdited sibling,
 * then reload the written file and read the row back — a write that cannot be
 * verified is rolled back and thrown.
 */
export async function applyPlayerEdit(
  franchise: any,
  savePath: string,
  changes: PlayerEditChanges,
  backupDir: string
): Promise<{ editedPath: string }> {
  const rec = await playerRecord(franchise, changes.playerRow);
  const problem = validate(rec, changes);
  if (problem) throw new Error(problem);

  apply(rec, changes);

  return writeEditedSave(franchise, savePath, backupDir, async (check) => {
    const table = mainTable(check, 'Player');
    await table.readRecords(['FirstName', 'LastName', 'JerseyNum']);
    const written = table.records?.[changes.playerRow];
    const expectFirst = changes.firstName?.trim();
    const expectLast = changes.lastName?.trim();
    if (
      !written ||
      (expectFirst !== undefined && String(val(written, 'FirstName')) !== expectFirst) ||
      (expectLast !== undefined && String(val(written, 'LastName')) !== expectLast) ||
      (changes.jersey !== undefined && Number(val(written, 'JerseyNum')) !== changes.jersey)
    ) {
      throw new Error('The written save did not read back with the edit.');
    }
  });
}

// --- Fire Coach -------------------------------------------------------------

/** Names the library may hand back for the two contract states we flip. */
const PENDING_FIRE_NAMES = new Set(['PendingFire', 'First_Pending']);
const SIGNED_NAMES = new Set(['Signed', 'First_Active']);

/**
 * Flip a CPU coach's ContractStatus to the game's own PendingFire state (or
 * back to Signed), and write the _RJsEdited sibling. The offseason carousel
 * is what processes PendingFire — this sets the flag the game itself uses;
 * whether a mid-season AD re-evaluation can clear it is verified in-game.
 */
export async function applyCoachFire(
  franchise: any,
  savePath: string,
  req: { coachRow: number; undo: boolean },
  backupDir: string
): Promise<{ editedPath: string; coachName: string }> {
  const { ensureCoachSchema } = await import('./parser/coach-schema.ts');
  const table = mainTable(franchise, 'Coach');
  if (!(await ensureCoachSchema(franchise, table))) {
    throw new Error('The Coach table is unreadable in this save.');
  }
  await table.readRecords([
    'FirstName',
    'LastName',
    'Position',
    'IsUserControlled',
    'ContractStatus'
  ]);
  const rec = table.records?.[req.coachRow];
  if (!rec || rec.isEmpty) throw new Error('No coach at that row in the save.');
  const role = String(val(rec, 'Position') ?? '');
  if (!['HeadCoach', 'OffensiveCoordinator', 'DefensiveCoordinator'].includes(role)) {
    throw new Error('Only head coaches and coordinators can be marked.');
  }
  if (val(rec, 'IsUserControlled') === true) {
    throw new Error('That is your own coach — the AD does not take requests about you.');
  }
  const coachName = `${String(val(rec, 'FirstName') ?? '').trim()} ${String(val(rec, 'LastName') ?? '').trim()}`.trim();
  const current = String(val(rec, 'ContractStatus') ?? '');
  if (req.undo) {
    if (!PENDING_FIRE_NAMES.has(current)) throw new Error(`${coachName} is not marked to be fired.`);
    rec.ContractStatus = 'Signed';
  } else {
    if (PENDING_FIRE_NAMES.has(current)) throw new Error(`${coachName} is already marked to be fired.`);
    if (!SIGNED_NAMES.has(current) && current !== 'Expiring') {
      throw new Error(`${coachName} is in the ${current} state — only active coaches can be marked.`);
    }
    rec.ContractStatus = 'PendingFire';
  }

  const want = req.undo ? SIGNED_NAMES : PENDING_FIRE_NAMES;
  const { editedPath } = await writeEditedSave(franchise, savePath, backupDir, async (check) => {
    const t = mainTable(check, 'Coach');
    if (!(await ensureCoachSchema(check, t))) throw new Error('Verify reload failed.');
    await t.readRecords(['ContractStatus']);
    const written = String(val(t.records?.[req.coachRow], 'ContractStatus') ?? '');
    if (!want.has(written)) {
      throw new Error('The written save did not read back with the new contract state.');
    }
  });
  return { editedPath, coachName };
}

// --- Program resources (Fundraising / Hire Additional Recruiters) ----------

const BUDGET_FIELDS = [
  'ProgramPointBudget',
  'RemainingProgramPoints',
  'RolloverProgramPoints',
  'NILProgramPointsSpent',
  'LongName',
  'RecruitingBoard',
  'DepthChart',
  'TeamIndex'
];

function fieldMax(rec: any, field: string, fallback: number): number {
  const n = Number(rec?._fields?.[field]?.offset?.maxValue);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function teamRecord(franchise: any, teamRow: number): Promise<any> {
  const table = mainTable(franchise, 'Team');
  await table.readRecords(BUDGET_FIELDS);
  const rec = table.records?.[teamRow];
  if (!rec || rec.isEmpty) throw new Error('No school at that row in the save.');
  return rec;
}

/** The user school's recruiting-board record (Team.RecruitingBoard ref). */
async function boardRecord(franchise: any, teamRec: any): Promise<any | null> {
  const ref = refFromRecord(teamRec, 'RecruitingBoard');
  if (!ref || (ref.tableId === 0 && ref.row === 0)) return null;
  const table = await tableById(franchise, ref.tableId);
  return table?.records?.[ref.row] ?? null;
}

export async function buildResourceForm(
  franchise: any,
  teamRow: number,
  savePath: string
): Promise<ResourceForm> {
  const rec = await teamRecord(franchise, teamRow);
  const n = (k: string): number => Number(val(rec, k) ?? 0);
  // Fundraising raises total, remaining and the rollover income line together
  // (the pillar breakdown must keep summing to the total), so the headroom is
  // whichever of the three caps is nearest.
  const budgetHeadroom = Math.max(
    0,
    Math.min(
      fieldMax(rec, 'ProgramPointBudget', 30000) - n('ProgramPointBudget'),
      fieldMax(rec, 'RemainingProgramPoints', 30000) - n('RemainingProgramPoints'),
      fieldMax(rec, 'RolloverProgramPoints', 20000) - n('RolloverProgramPoints')
    )
  );
  let hours: ResourceForm['hours'] = null;
  const board = await boardRecord(franchise, rec);
  if (board && board._fields?.RecruitingHoursTotal) {
    const total = Number(val(board, 'RecruitingHoursTotal') ?? 0);
    hours = {
      total,
      assigned: Number(val(board, 'RecruitingHoursAssigned') ?? 0),
      headroom: Math.max(0, fieldMax(board, 'RecruitingHoursTotal', 4095) - total)
    };
  }
  const target = editedPathFor(savePath);
  return {
    teamRow,
    school: String(val(rec, 'LongName') ?? ''),
    budget: {
      total: n('ProgramPointBudget'),
      remaining: n('RemainingProgramPoints'),
      rollover: n('RolloverProgramPoints'),
      nilSpent: n('NILProgramPointsSpent'),
      headroom: budgetHeadroom
    },
    hours,
    targetFileName: basename(target),
    targetExists: existsSync(target)
  };
}

// --- Depth chart -----------------------------------------------------------

const REF_BITS = /^[01]{32}$/;

/** 32-bit binary ref string (15-bit table id + 17-bit row), the array-field write format. */
function refString(tableId: number, row: number): string {
  return tableId.toString(2).padStart(15, '0') + row.toString(2).padStart(17, '0');
}

/** The window's current Player rows, in slot order — direct Player refs only. */
function windowRows(arrRec: any, playerTableId: number): number[] {
  const rows: number[] = [];
  const size = typeof arrRec?.arraySize === 'number' ? arrRec.arraySize : 0;
  for (let i = 0; i < size; i++) {
    const v = arrRec._fields?.[`Player${i}`]?.value;
    if (typeof v !== 'string' || !REF_BITS.test(v)) return [];
    const tid = parseInt(v.slice(0, 15), 2);
    const row = parseInt(v.slice(15), 2);
    if (tid !== playerTableId) return [];
    rows.push(row);
  }
  return rows;
}

/**
 * Reorder/swap depth-chart windows for the user's school and write the
 * _RJsEdited sibling. Size-preserving by design: each change must carry
 * exactly the window's current slot count, with the same team's players and
 * no duplicates inside a window.
 */
export async function applyDepthChartEdit(
  franchise: any,
  savePath: string,
  req: { teamRow: number; changes: { position: string; playerRows: number[] }[] },
  backupDir: string
): Promise<{ editedPath: string; windows: number }> {
  if (!req.changes.length) throw new Error('No depth-chart changes to save.');
  const teamRec = await teamRecord(franchise, req.teamRow);
  const teamIndex = Number(val(teamRec, 'TeamIndex'));
  const dcRef = refFromRecord(teamRec, 'DepthChart');
  if (!dcRef || (dcRef.tableId === 0 && dcRef.row === 0)) {
    throw new Error('No depth chart in the save for this school.');
  }
  const dcTable = await tableById(franchise, dcRef.tableId);
  const dcRec = dcTable?.records?.[dcRef.row];
  if (!dcRec) throw new Error('No depth chart in the save for this school.');

  const players = mainTable(franchise, 'Player');
  await players.readRecords(['TeamIndex', 'FirstName']);
  const playerTableId = players.header?.tableId ?? -1;

  // Validate everything before writing anything.
  const writes: { arrRec: any; rows: number[] }[] = [];
  for (const change of req.changes) {
    const pos = change.position;
    if (pos === 'LockedEntries' || !dcRec._fields?.[pos]) {
      throw new Error(`Unknown depth-chart window: ${pos}`);
    }
    const slotRef = refFromRecord(dcRec, pos);
    const arrTable = slotRef ? await tableById(franchise, slotRef.tableId) : null;
    const arrRec = arrTable?.records?.[slotRef!.row];
    if (!arrRec) throw new Error(`The save carries no ${pos} window.`);
    const current = windowRows(arrRec, playerTableId);
    if (!current.length) {
      throw new Error(`The ${pos} window has gaps or an unexpected shape — edit it in the game.`);
    }
    if (change.playerRows.length !== current.length) {
      throw new Error(`${pos} must keep its ${current.length} slots.`);
    }
    if (new Set(change.playerRows).size !== change.playerRows.length) {
      throw new Error(`A player appears twice in the ${pos} window.`);
    }
    for (const row of change.playerRows) {
      const p = players.records?.[row];
      if (!Number.isInteger(row) || !p || p.isEmpty) throw new Error(`No player at row ${row}.`);
      if (Number(val(p, 'TeamIndex')) !== teamIndex) {
        throw new Error(`${String(val(p, 'FirstName') ?? 'That player')} is not on this roster.`);
      }
    }
    writes.push({ arrRec, rows: change.playerRows });
  }
  for (const w of writes) {
    w.rows.forEach((row, i) => {
      w.arrRec[`Player${i}`] = refString(playerTableId, row);
    });
  }

  const { editedPath } = await writeEditedSave(franchise, savePath, backupDir, async (check) => {
    const t = mainTable(check, 'Team');
    await t.readRecords(BUDGET_FIELDS);
    const rec2 = t.records?.[req.teamRow];
    const ref2 = rec2 && refFromRecord(rec2, 'DepthChart');
    const dcT2 = ref2 && (await tableById(check, ref2.tableId));
    const dc2 = dcT2?.records?.[ref2!.row];
    const players2 = mainTable(check, 'Player');
    await players2.readRecords(['TeamIndex']);
    const pid2 = players2.header?.tableId ?? -1;
    for (const change of req.changes) {
      const sRef = dc2 && refFromRecord(dc2, change.position);
      const aT = sRef && (await tableById(check, sRef.tableId));
      const a2 = aT?.records?.[sRef!.row];
      const rows = a2 ? windowRows(a2, pid2) : [];
      if (rows.join(',') !== change.playerRows.join(',')) {
        throw new Error(`The written save did not read back with the new ${change.position} order.`);
      }
    }
  });
  return { editedPath, windows: req.changes.length };
}

/**
 * Add program points (Fundraising) or recruiting hours (Hire Additional
 * Recruiters) to the user's school, clamped to the save format's field caps,
 * and write the _RJsEdited sibling. Returns the delta actually applied.
 */
export async function applyResourceEdit(
  franchise: any,
  savePath: string,
  req: { teamRow: number; kind: 'nil' | 'hours'; amount: number },
  backupDir: string
): Promise<{ editedPath: string; applied: number }> {
  if (!Number.isInteger(req.amount) || req.amount <= 0 || req.amount > 30000) {
    throw new Error('Amount must be a whole number greater than zero.');
  }
  const rec = await teamRecord(franchise, req.teamRow);
  const form = await buildResourceForm(franchise, req.teamRow, savePath);

  let applied: number;
  let expect: { total: number };
  if (req.kind === 'nil') {
    applied = Math.min(req.amount, form.budget.headroom);
    if (applied <= 0) throw new Error('The program-point budget is already at the save format’s cap.');
    rec.ProgramPointBudget = form.budget.total + applied;
    rec.RemainingProgramPoints = form.budget.remaining + applied;
    rec.RolloverProgramPoints = form.budget.rollover + applied;
    expect = { total: form.budget.total + applied };
  } else {
    if (!form.hours) throw new Error('No recruiting board in the save for this school yet.');
    applied = Math.min(req.amount, form.hours.headroom);
    if (applied <= 0) throw new Error('Recruiting hours are already at the save format’s cap.');
    const board = await boardRecord(franchise, rec);
    board.RecruitingHoursTotal = form.hours.total + applied;
    expect = { total: form.hours.total + applied };
  }

  const { editedPath } = await writeEditedSave(franchise, savePath, backupDir, async (check) => {
    const table = mainTable(check, 'Team');
    await table.readRecords(BUDGET_FIELDS);
    const written = table.records?.[req.teamRow];
    if (!written) throw new Error('The written save did not read back.');
    if (req.kind === 'nil') {
      if (Number(val(written, 'ProgramPointBudget')) !== expect.total) {
        throw new Error('The written save did not read back with the new budget.');
      }
    } else {
      const board = await boardRecord(check, written);
      if (!board || Number(val(board, 'RecruitingHoursTotal')) !== expect.total) {
        throw new Error('The written save did not read back with the new hours.');
      }
    }
  });
  return { editedPath, applied };
}
