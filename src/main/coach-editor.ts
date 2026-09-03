/**
 * Coach editor: the form behind a coach profile's EDIT control and the write
 * that applies it. Same posture as the player editor — whole-payload
 * validation, then one write to the <save>_RJ sibling through
 * writeEditedSave, verified on a cold reload.
 *
 * Field map and talent-tree mechanics: RESEARCH "Coach editor field map" and
 * "Coach talent trees". Notable conventions the save imposes:
 *   - Coach.Weight is pounds − 150 (schema minimum 150; players use −160).
 *   - Name is a denormalized display string ("R. Tveit") the app rebuilds on a rename.
 *   - Prestige is edited as CoachPrestigeScore; the game re-grades the letter.
 *   - Job-security status follows the percentage using this save's own bands.
 *   - A role change swaps with the same staff's holder of the target role; a
 *     coordinator promoted to head coach gets the two head-coach specialty
 *     subtrees provisioned open (archetype node purchasable, nothing owned).
 *   - Talent statuses are rewritten per subtree from the wanted owned set,
 *     keeping the game's invariants; the subtree's paid ledger moves by the
 *     cost delta, the coach's spendable points do not.
 */
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import type { CoachEditChanges, CoachEditForm, CoachTalentSlotState } from '../shared/types.ts';
import { COACH_ARCHETYPE_NAMES, COACH_BACKSTORY_NAMES, coachTalentTree, type CoachTalentSubTree } from '../shared/coach-talents.ts';
import { TALENT_NOT_OWNED, costDelta, ownedSet, ownedSetIsClosed, statusesFor } from '../shared/coach-talent-logic.ts';
import { editedPathFor, enumMembers, fieldMax, firstEmptyRow, refString, stringCap, writeEditedSave } from './editor.ts';
import { ensureCoachSchema } from './parser/coach-schema.ts';
import { isNullRef, mainTable, refFromRecord, tableById, val } from './parser/franchise.ts';

const ROLES = ['HeadCoach', 'OffensiveCoordinator', 'DefensiveCoordinator'];
const COACH_WEIGHT_OFFSET = 150;
const MAX_TALENT_STATUS = 33;
const LEDGER_MAX = 2000;

async function coachTable(franchise: any): Promise<any> {
  const table = mainTable(franchise, 'Coach');
  if (!(await ensureCoachSchema(franchise, table))) throw new Error('The Coach table is unreadable in this save.');
  // Always a full read: the parser reads this table with a field subset, and
  // a records-already-read guard would leave the tree/enum fields unloaded.
  await table.readRecords();
  return table;
}

function coachRecord(table: any, row: number): any {
  const rec = table.records?.[row];
  if (!rec || rec.isEmpty) throw new Error('No coach at that row in the save.');
  if (!ROLES.includes(String(val(rec, 'Position') ?? ''))) throw new Error('Only head coaches and coordinators can be edited.');
  return rec;
}

function fullName(rec: any): string {
  return `${String(val(rec, 'FirstName') ?? '').trim()} ${String(val(rec, 'LastName') ?? '').trim()}`.trim();
}

/** The game's own display form: first initial, last name ("R. Tveit"). */
function displayName(first: string, last: string, cap: number): string {
  const s = `${first.trim().charAt(0)}. ${last.trim()}`;
  return s.length > cap ? s.slice(0, cap) : s;
}

/** Percentage ceilings for the sub-Safe statuses, from this save's coaches (observed bands as fallback). */
function securityBands(table: any): CoachEditForm['securityBands'] {
  const max: Record<string, number> = {};
  for (const c of table.records as any[]) {
    if (c.isEmpty) continue;
    const st = String(val(c, 'CurrentJobSecurityStatus') ?? '');
    const pct = Number(val(c, 'CurrentJobSecurityPercentage'));
    if (!Number.isFinite(pct)) continue;
    max[st] = Math.max(max[st] ?? -1, pct);
  }
  const hotSeat = max['HotSeat'] ?? 49;
  const low = Math.max(hotSeat + 1, max['Low'] ?? 64);
  const safeForNow = Math.max(low + 1, max['SafeForNow'] ?? 79);
  return { hotSeat, low, safeForNow: Math.min(99, safeForNow) };
}

export function securityStatusFor(pct: number, bands: CoachEditForm['securityBands']): string {
  if (pct <= bands.hotSeat) return 'HotSeat';
  if (pct <= bands.low) return 'Low';
  if (pct <= bands.safeForNow) return 'SafeForNow';
  return 'Safe';
}

/** Coach.TeamIndex is a field, not the Team row; 255 = unemployed. */
function teamNameFor(teamTable: any, teamIndex: number): string | null {
  if (!Number.isFinite(teamIndex) || teamIndex === 255) return null;
  for (const t of teamTable.records as any[]) {
    if (!t.isEmpty && Number(val(t, 'TeamIndex')) === teamIndex) return String(val(t, 'LongName') ?? '').trim() || null;
  }
  return null;
}

interface TreeHandles {
  /** The TalentSubTreeStatus[] array record and its field names in slot order. */
  listRec: any;
  listFields: string[];
  /** Per slot: the status table + row (null when the list has no entry there). */
  rows: ({ table: any; row: number } | null)[];
}

async function treeHandles(franchise: any, rec: any): Promise<TreeHandles | null> {
  const ref = refFromRecord(rec, 'ActiveTalentTree');
  if (!ref || isNullRef(ref)) return null;
  const att = await tableById(franchise, ref.tableId);
  if (!att) return null;
  await att.readRecords();
  const attRec = att.records?.[ref.row];
  if (!attRec) return null;
  const listRef = refFromRecord(attRec, 'TalentSubTreeStatusList');
  if (!listRef || isNullRef(listRef)) return null;
  const arr = await tableById(franchise, listRef.tableId);
  if (!arr) return null;
  await arr.readRecords();
  const listRec = arr?.records?.[listRef.row];
  if (!listRec) return null;
  const listFields = Object.keys(listRec._fields ?? {});
  const size = typeof listRec.arraySize === 'number' ? listRec.arraySize : listFields.length;
  const rows: TreeHandles['rows'] = [];
  for (const k of listFields.slice(0, size)) {
    const rd = listRec._fields[k]?.referenceData;
    if (!rd?.tableId) {
      rows.push(null);
      continue;
    }
    const st = await tableById(franchise, rd.tableId);
    if (st && !(st as any).__coachEditorRead) {
      await st.readRecords();
      (st as any).__coachEditorRead = true;
    }
    const row = rd.rowNumber ?? rd.row;
    rows.push(st?.records?.[row] ? { table: st, row } : null);
  }
  return { listRec, listFields, rows };
}

function slotState(h: TreeHandles, slot: number): CoachTalentSlotState | null {
  const r = h.rows[slot];
  if (!r) return null;
  const rec = r.table.records[r.row];
  const status: number[] = [];
  for (let i = 0; i < MAX_TALENT_STATUS; i++) status.push(talentStatusValue(val(rec, `TalentStatus${i}`)));
  return { slot, status, spent: Number(val(rec, 'CoachPointsSpent')) || 0 };
}

const STATUS_NAMES = ['NotOwned', 'Purchasable', 'Owned', 'Locked', 'Invalid'];
function talentStatusValue(v: unknown): number {
  if (typeof v === 'number') return v;
  const i = STATUS_NAMES.indexOf(String(v ?? ''));
  return i < 0 ? 0 : i;
}

export async function buildCoachEditForm(franchise: any, coachRow: number, savePath: string): Promise<CoachEditForm> {
  const table = await coachTable(franchise);
  const rec = coachRecord(table, coachRow);
  const teamTable = mainTable(franchise, 'Team');
  await teamTable.readRecords(); // full read: a subset would narrow what the cached parse holds
  const teamIndex = Number(val(rec, 'TeamIndex'));
  const position = String(val(rec, 'Position') ?? '');

  const staff: CoachEditForm['staff'] = [];
  if (teamIndex !== 255) {
    for (let row = 0; row < table.records.length; row++) {
      const c = table.records[row];
      if (c.isEmpty || row === coachRow) continue;
      if (Number(val(c, 'TeamIndex')) !== teamIndex) continue;
      const p = String(val(c, 'Position') ?? '');
      if (ROLES.includes(p)) staff.push({ position: p, row, name: fullName(c) });
    }
  }

  const memberNames = (field: string, drop: RegExp): string[] =>
    enumMembers(rec, field)
      .filter((m) => !drop.test(m.name))
      .map((m) => m.name);
  const junk = /^(Invalid_?|INVALID|Max_?|Count_?|First_?|Last_?|Future\d*|NumCollegeCoaches|Owner|Scout|Trainer|GM|PlayerPersonnel|SpecialTeams|Freshman)$/;
  const archetypeByValue = new Map<number, string>();
  for (const m of enumMembers(rec, 'DominantArchetype')) {
    if (!junk.test(m.name) && !archetypeByValue.has(m.value)) archetypeByValue.set(m.value, m.name);
  }
  const backstoryByValue = new Map<number, string>();
  for (const m of enumMembers(rec, 'CoachBackstory')) {
    if (!backstoryByValue.has(m.value)) backstoryByValue.set(m.value, m.name);
  }
  const archetypeValue = (name: string): number => {
    for (const [v, n] of archetypeByValue) if (n === name) return v;
    return 0;
  };
  const backstoryValue = (name: string): number => {
    for (const [v, n] of backstoryByValue) if (n === name) return v;
    return 0;
  };

  const handles = await treeHandles(franchise, rec);
  const tree = handles
    ? coachTalentTree(position).map((s) => slotState(handles, s.slot)).filter((s): s is CoachTalentSlotState => s !== null)
    : null;

  const target = editedPathFor(savePath);
  const weightRaw = Number(val(rec, 'Weight')) || 0;
  return {
    coachRow,
    name: fullName(rec),
    firstName: String(val(rec, 'FirstName') ?? '').trim(),
    lastName: String(val(rec, 'LastName') ?? '').trim(),
    maxFirstLen: stringCap(rec, 'FirstName', 17),
    maxLastLen: stringCap(rec, 'LastName', 21),
    position,
    positionOptions: ROLES,
    teamName: teamNameFor(teamTable, teamIndex),
    isUser: val(rec, 'IsUserControlled') === true,
    staff,
    coachPoints: Number(val(rec, 'CoachPoints')) || 0,
    coachPointsMax: fieldMax(rec, 'CoachPoints', 4095),
    level: Number(val(rec, 'Level')) || 0,
    levelMax: Math.min(100, fieldMax(rec, 'Level', 100)),
    prestigeScore: Number(val(rec, 'CoachPrestigeScore')) || 0,
    prestigeScoreMax: fieldMax(rec, 'CoachPrestigeScore', 10000),
    prestigeLetter: String(val(rec, 'CoachPrestige') ?? ''),
    xp: Number(val(rec, 'ExperiencePoints')) || 0,
    xpMax: fieldMax(rec, 'ExperiencePoints', 1000000),
    securityPct: Number(val(rec, 'CurrentJobSecurityPercentage')) || 0,
    securityStatus: String(val(rec, 'CurrentJobSecurityStatus') ?? ''),
    securityBands: securityBands(table),
    age: Number(val(rec, 'Age')) || 0,
    ageMax: Math.min(90, fieldMax(rec, 'Age', 127)),
    heightIn: Number(val(rec, 'Height')) || 0,
    weightLb: weightRaw + COACH_WEIGHT_OFFSET,
    weightMin: COACH_WEIGHT_OFFSET,
    weightMax: COACH_WEIGHT_OFFSET + Math.min(250, fieldMax(rec, 'Weight', 511)),
    homeState: String(val(rec, 'HomeState') ?? ''),
    homeStateOptions: memberNames('HomeState', junk),
    demeanor: String(val(rec, 'COACH_DEMEANOR') ?? ''),
    demeanorOptions: memberNames('COACH_DEMEANOR', junk),
    stance: String(val(rec, 'COACH_STANCE') ?? ''),
    stanceOptions: memberNames('COACH_STANCE', junk),
    hat: String(val(rec, 'HatType') ?? ''),
    hatOptions: memberNames('HatType', junk),
    bodyType: String(val(rec, 'CharacterBodyType') ?? ''),
    bodyTypeOptions: memberNames('CharacterBodyType', /^(Invalid_?|Freshman|Alternate.*|Max_?|Count_?)$/),
    archetype: archetypeValue(String(val(rec, 'DominantArchetype') ?? '')),
    archetypeOptions: [...archetypeByValue]
      .filter(([v]) => v in COACH_ARCHETYPE_NAMES)
      .map(([value, member]) => ({ value, member, name: COACH_ARCHETYPE_NAMES[value] ?? member }))
      .sort((a, b) => a.value - b.value),
    backstory: backstoryValue(String(val(rec, 'CoachBackstory') ?? '')),
    backstoryOptions: [...backstoryByValue]
      .filter(([v]) => v in COACH_BACKSTORY_NAMES)
      .map(([value, member]) => ({ value, member, name: COACH_BACKSTORY_NAMES[value] ?? member }))
      .sort((a, b) => a.value - b.value),
    expertScout: val(rec, 'TraitExpertScout') === true,
    tree,
    targetFileName: basename(target),
    targetExists: existsSync(target)
  };
}

function intIn(v: unknown, lo: number, hi: number): v is number {
  return Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
}

/** Whole-payload validation; a bad payload changes nothing. */
function validate(rec: any, c: CoachEditChanges, form: CoachEditForm): string | null {
  const nameOk = (s: string): boolean => /^[\x20-\x7e]+$/.test(s);
  if (c.firstName !== undefined) {
    const v = c.firstName.trim();
    if (!v) return 'First name cannot be empty.';
    if (v.length > form.maxFirstLen) return `First name is capped at ${form.maxFirstLen} characters by the save format.`;
    if (!nameOk(v)) return 'First name has characters the save cannot store.';
  }
  if (c.lastName !== undefined) {
    const v = c.lastName.trim();
    if (!v) return 'Last name cannot be empty.';
    if (v.length > form.maxLastLen) return `Last name is capped at ${form.maxLastLen} characters by the save format.`;
    if (!nameOk(v)) return 'Last name has characters the save cannot store.';
  }
  if (c.position !== undefined && !ROLES.includes(c.position)) return 'Unknown coaching role.';
  if (c.coachPoints !== undefined && !intIn(c.coachPoints, 0, form.coachPointsMax)) return `Coach points must be 0–${form.coachPointsMax}.`;
  if (c.level !== undefined && !intIn(c.level, 0, form.levelMax)) return `Level must be 0–${form.levelMax}.`;
  if (c.prestigeScore !== undefined && !intIn(c.prestigeScore, 0, form.prestigeScoreMax)) return `Prestige score must be 0–${form.prestigeScoreMax}.`;
  if (c.xp !== undefined && !intIn(c.xp, 0, form.xpMax)) return `Experience points must be 0–${form.xpMax}.`;
  if (c.securityPct !== undefined && !intIn(c.securityPct, 0, 100)) return 'Job security must be 0–100.';
  if (c.age !== undefined && !intIn(c.age, 20, form.ageMax)) return `Age must be 20–${form.ageMax}.`;
  if (c.heightIn !== undefined && !intIn(c.heightIn, 60, 84)) return 'Height must be 5\'0" to 7\'0".';
  if (c.weightLb !== undefined && !intIn(c.weightLb, form.weightMin, form.weightMax)) return `Weight must be ${form.weightMin}–${form.weightMax} lb.`;
  const enumOk = (v: string | undefined, options: string[], label: string): string | null =>
    v !== undefined && !options.includes(v) ? `Unknown ${label}: ${v}` : null;
  return (
    enumOk(c.homeState, form.homeStateOptions, 'home state') ??
    enumOk(c.demeanor, form.demeanorOptions, 'demeanor') ??
    enumOk(c.stance, form.stanceOptions, 'stance') ??
    enumOk(c.hat, form.hatOptions, 'hat type') ??
    enumOk(c.bodyType, form.bodyTypeOptions, 'body type') ??
    (c.archetype !== undefined && !form.archetypeOptions.some((o) => o.value === c.archetype) ? 'Unknown archetype.' : null) ??
    (c.backstory !== undefined && !form.backstoryOptions.some((o) => o.value === c.backstory) ? 'Only the three named backstories can be set.' : null) ??
    (c.expertScout !== undefined && typeof c.expertScout !== 'boolean' ? 'Expert Scout must be on or off.' : null) ??
    (c.talents !== undefined && !Array.isArray(c.talents) ? 'Bad talent payload.' : null) ??
    (rec ? null : 'No coach.')
  );
}

/**
 * Provision an open, unspent status row: archetype node purchasable, the rest
 * not owned. The editor is a sandbox, so it never writes a Locked gate; the
 * game re-evaluates prerequisites itself.
 */
function provisionOpenRow(statusTable: any, nodeCount: number): number {
  const row = firstEmptyRow(statusTable);
  const rec = statusTable.records[row];
  rec.CoachPointsSpent = 0;
  rec.Version = 0;
  for (let i = 0; i < MAX_TALENT_STATUS; i++) rec[`TalentStatus${i}`] = i === 0 && nodeCount > 0 ? 'Purchasable' : 'NotOwned';
  return row;
}

/** A coordinator becoming head coach needs slots 11–12 (Program Builder, CEO) in the list. */
async function ensureHeadCoachSlots(franchise: any, rec: any): Promise<void> {
  const h = await treeHandles(franchise, rec);
  if (!h) return;
  const full = coachTalentTree('HeadCoach');
  const size = typeof h.listRec.arraySize === 'number' ? h.listRec.arraySize : h.rows.length;
  if (size >= full.length) return;
  const template = h.rows.find((r) => r !== null);
  if (!template) return;
  const statusTable = template.table;
  if (!h.listFields[full.length - 1]) throw new Error('The talent list cannot hold the head-coach specialties.');
  for (let slot = size; slot < full.length; slot++) {
    const row = provisionOpenRow(statusTable, full[slot].nodes.length);
    h.listRec[h.listFields[slot]] = refString(statusTable.header.tableId, row);
  }
  await franchise.recalculateEmptyRecordReferences?.(statusTable);
}

export async function applyCoachEdit(
  franchise: any,
  savePath: string,
  changes: CoachEditChanges,
  backupDir: string
): Promise<{ editedPath: string; coachName: string }> {
  const table = await coachTable(franchise);
  const rec = coachRecord(table, changes.coachRow);
  const form = await buildCoachEditForm(franchise, changes.coachRow, savePath);
  const problem = validate(rec, changes, form);
  if (problem) throw new Error(problem);
  const coachName = fullName(rec);

  // --- role swap: the same staff's holder of the target role takes this one ---
  const oldRole = form.position;
  const newRole = changes.position ?? oldRole;
  let partner: { rec: any; row: number } | null = null;
  if (changes.position !== undefined && changes.position !== oldRole) {
    const p = form.staff.find((s) => s.position === changes.position);
    if (p) partner = { rec: table.records[p.row], row: p.row };
  }

  // --- talent trees: compute every changed subtree's full vector first ---
  const treeAfterRole = coachTalentTree(newRole);
  const handles = await treeHandles(franchise, rec);
  const treeWrites: { slot: number; status: number[]; spent: number; sub: CoachTalentSubTree }[] = [];
  for (const t of changes.talents ?? []) {
    if (!handles) throw new Error('This coach has no talent tree in the save.');
    const sub = treeAfterRole[t.slot];
    const cur = slotState(handles, t.slot);
    if (!sub || !cur) throw new Error(`No talent subtree at slot ${t.slot} for a ${newRole}.`);
    if (!Array.isArray(t.owned) || t.owned.some((i) => !Number.isInteger(i) || i < 0 || i >= sub.nodes.length)) {
      throw new Error(`Bad node index in ${sub.name}.`);
    }
    const wanted = new Set<number>(t.owned);
    if (!ownedSetIsClosed(sub, wanted)) throw new Error(`${sub.name}: a node cannot be owned without the node above it.`);
    const before = ownedSet(cur.status);
    const spent = Math.max(0, Math.min(LEDGER_MAX, cur.spent + costDelta(sub, before, wanted)));
    treeWrites.push({ slot: t.slot, status: statusesFor(sub, cur.status, wanted), spent, sub });
  }
  // The dominant archetype must name a subtree whose archetype node is owned (an invariant the game keeps).
  if (changes.archetype !== undefined && changes.archetype !== form.archetype) {
    const sub = treeAfterRole.find((s) => s.archetype === changes.archetype);
    const written = treeWrites.find((w) => sub && w.slot === sub.slot);
    const status0 = written ? written.status[0] : sub && handles ? (slotState(handles, sub.slot)?.status[0] ?? TALENT_NOT_OWNED) : TALENT_NOT_OWNED;
    if (!sub || status0 !== 2) {
      throw new Error(`Own the ${COACH_ARCHETYPE_NAMES[changes.archetype] ?? 'chosen'} archetype node before making it dominant.`);
    }
  }

  // --- apply ---
  const first = changes.firstName?.trim() ?? form.firstName;
  const last = changes.lastName?.trim() ?? form.lastName;
  if (changes.firstName !== undefined) rec.FirstName = first;
  if (changes.lastName !== undefined) rec.LastName = last;
  if (changes.firstName !== undefined || changes.lastName !== undefined) {
    rec.Name = displayName(first, last, stringCap(rec, 'Name', 18));
  }
  if (changes.coachPoints !== undefined) rec.CoachPoints = changes.coachPoints;
  if (changes.level !== undefined) rec.Level = changes.level;
  if (changes.prestigeScore !== undefined) rec.CoachPrestigeScore = changes.prestigeScore;
  if (changes.xp !== undefined) rec.ExperiencePoints = changes.xp;
  if (changes.securityPct !== undefined) {
    rec.CurrentJobSecurityPercentage = changes.securityPct;
    rec.CurrentJobSecurityStatus = securityStatusFor(changes.securityPct, form.securityBands);
  }
  if (changes.age !== undefined) rec.Age = changes.age;
  if (changes.heightIn !== undefined) rec.Height = changes.heightIn;
  if (changes.weightLb !== undefined) rec.Weight = changes.weightLb - COACH_WEIGHT_OFFSET;
  if (changes.homeState !== undefined) rec.HomeState = changes.homeState;
  if (changes.demeanor !== undefined) rec.COACH_DEMEANOR = changes.demeanor;
  if (changes.stance !== undefined) rec.COACH_STANCE = changes.stance;
  if (changes.hat !== undefined) rec.HatType = changes.hat;
  if (changes.bodyType !== undefined) rec.CharacterBodyType = changes.bodyType;
  if (changes.archetype !== undefined) {
    rec.DominantArchetype = form.archetypeOptions.find((o) => o.value === changes.archetype)!.member;
  }
  if (changes.backstory !== undefined) {
    rec.CoachBackstory = form.backstoryOptions.find((o) => o.value === changes.backstory)!.member;
  }
  if (changes.expertScout !== undefined) rec.TraitExpertScout = changes.expertScout;

  if (changes.position !== undefined && changes.position !== oldRole) {
    rec.PrevPosition = oldRole;
    rec.Position = changes.position;
    if (changes.position === 'HeadCoach') await ensureHeadCoachSlots(franchise, rec);
    if (partner) {
      partner.rec.PrevPosition = changes.position;
      partner.rec.Position = oldRole;
      if (oldRole === 'HeadCoach') await ensureHeadCoachSlots(franchise, partner.rec);
    }
  }

  for (const w of treeWrites) {
    const r = handles!.rows[w.slot]!;
    const srec = r.table.records[r.row];
    for (let i = 0; i < MAX_TALENT_STATUS; i++) srec[`TalentStatus${i}`] = STATUS_NAMES[w.status[i] ?? 0];
    srec.CoachPointsSpent = w.spent;
  }

  // --- write + verify on a cold reload ---
  const partnerRow = partner?.row ?? -1;
  const { editedPath } = await writeEditedSave(franchise, savePath, backupDir, async (check) => {
    const t = mainTable(check, 'Coach');
    if (!(await ensureCoachSchema(check, t))) throw new Error('Verify reload failed.');
    await t.readRecords();
    const w = t.records?.[changes.coachRow];
    const bad = (why: string): never => {
      throw new Error(`The written save did not read back with the edit (${why}).`);
    };
    if (!w) bad('row');
    if (changes.firstName !== undefined && String(val(w, 'FirstName')) !== first) bad('first name');
    if (changes.lastName !== undefined && String(val(w, 'LastName')) !== last) bad('last name');
    if (changes.position !== undefined && String(val(w, 'Position')) !== changes.position) bad('position');
    if (partnerRow >= 0 && String(val(t.records[partnerRow], 'Position')) !== oldRole) bad('swap partner');
    if (changes.coachPoints !== undefined && Number(val(w, 'CoachPoints')) !== changes.coachPoints) bad('coach points');
    if (changes.level !== undefined && Number(val(w, 'Level')) !== changes.level) bad('level');
    if (changes.prestigeScore !== undefined && Number(val(w, 'CoachPrestigeScore')) !== changes.prestigeScore) bad('prestige');
    if (changes.xp !== undefined && Number(val(w, 'ExperiencePoints')) !== changes.xp) bad('experience');
    if (changes.securityPct !== undefined && Number(val(w, 'CurrentJobSecurityPercentage')) !== changes.securityPct) bad('security');
    if (changes.age !== undefined && Number(val(w, 'Age')) !== changes.age) bad('age');
    if (changes.heightIn !== undefined && Number(val(w, 'Height')) !== changes.heightIn) bad('height');
    if (changes.weightLb !== undefined && Number(val(w, 'Weight')) + COACH_WEIGHT_OFFSET !== changes.weightLb) bad('weight');
    if (changes.homeState !== undefined && String(val(w, 'HomeState')) !== changes.homeState) bad('home state');
    if (changes.expertScout !== undefined && (val(w, 'TraitExpertScout') === true) !== changes.expertScout) bad('expert scout');
    if (treeWrites.length) {
      const h2 = await treeHandles(check, w);
      if (!h2) bad('tree');
      for (const tw of treeWrites) {
        const s2 = slotState(h2!, tw.slot);
        if (!s2 || s2.spent !== tw.spent || tw.status.some((v, i) => s2.status[i] !== v)) bad(`${tw.sub.name} statuses`);
      }
    }
  });
  return { editedPath, coachName };
}
