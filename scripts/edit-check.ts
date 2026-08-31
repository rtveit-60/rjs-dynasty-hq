/**
 * Regression harness for the player editor (src/main/editor.ts).
 *
 * Proves, against scratch copies in the OS temp dir (never samples/, never the
 * real saves folder):
 *   1. the edit form carries schema truth (name caps, ratings, ability options)
 *   2. an edit writes <save>_RJsEdited and the source file's bytes never change
 *   3. editing an already-edited save updates it in place, after a backup
 *   4. bad payloads are rejected before anything is applied
 *
 * Usage: node scripts/edit-check.ts [save]
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyBoardEdit,
  applyCoachFire,
  applyCreateRecruit,
  applyTargetActions,
  buildCreateForm,
  buildTargetForm,
  applyDepthChartEdit,
  applyPlayerEdit,
  applyResourceEdit,
  buildEditForm,
  buildResourceForm,
  editedPathFor
} from '../src/main/editor.ts';
import { ensureCoachSchema } from '../src/main/parser/coach-schema.ts';
import { loadFranchise, mainTable, refFromRecord, val } from '../src/main/parser/franchise.ts';

const savePath = process.argv[2] ?? 'samples/DYNASTY-VIRGINIA-MIDSEASON';
const dir = mkdtempSync(path.join(os.tmpdir(), 'edit-check-'));
const work = path.join(dir, 'DYNASTY-EDITCHECK');
copyFileSync(savePath, work);

const sha = (p: string): string => createHash('sha1').update(readFileSync(p)).digest('hex');
const sourceHash = sha(work);

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
async function rejects(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    check(label, false, 'was accepted');
  } catch (err) {
    check(label, true, err instanceof Error ? err.message : String(err));
  }
}

let addTargetGlobal = -1;
let removedTargetGlobal = -1;

const franchise = await loadFranchise(work);

// --- pick one rostered player and one recruit ---
const players = mainTable(franchise, 'Player');
await players.readRecords(['FirstName', 'LastName', 'JerseyNum', 'Position']);
const playerTableId = players.header?.tableId;
const recruits = mainTable(franchise, 'Recruit');
await recruits.readRecords(['Player']);
const recruitRows = new Set<number>();
for (const r of recruits.records as any[]) {
  if (r.isEmpty) continue;
  const ref = refFromRecord(r, 'Player');
  if (ref && ref.tableId === playerTableId) recruitRows.add(ref.row);
}
let rosterRow = -1;
let recruitRow = -1;
for (let i = 0; i < players.records.length; i++) {
  const r = players.records[i];
  if (r.isEmpty || !r._fields?.FirstName?.value) continue;
  if (rosterRow < 0 && !recruitRows.has(i)) rosterRow = i;
  if (recruitRow < 0 && recruitRows.has(i)) recruitRow = i;
  if (rosterRow >= 0 && recruitRow >= 0) break;
}
check('found a rostered player and a recruit', rosterRow >= 0 && recruitRow >= 0, `rows ${rosterRow}/${recruitRow}`);

// --- 1. form truth ---
const form = await buildEditForm(franchise, rosterRow, work);
check('form: schema name caps', form.maxFirstLen === 17 && form.maxLastLen === 21, `${form.maxFirstLen}/${form.maxLastLen}`);
check('form: position rating sheet present', form.ratings.length >= 8, `${form.ratings.length} fields`);
check('form: mental slots ×3', form.mental.length === 3);
check('form: mental options carry game names', form.mentalOptions.length >= 15 &&
  form.mentalOptions.every((o) => o.name && o.id), `${form.mentalOptions.length} options`);
check('form: tier options', ['Bronze', 'Silver', 'Gold', 'Platinum'].every((t) => form.rankOptions.includes(t)),
  form.rankOptions.join('/'));
check('form: rostered player has a jersey', form.jersey !== null && !form.isRecruit);
check('form: target is the _RJsEdited sibling', form.targetFileName === 'DYNASTY-EDITCHECK_RJsEdited' && !form.targetExists);

check('form: rostered player carries his own look record',
  form.look !== null && (form.lookTone === null || (form.lookTone >= 1 && form.lookTone <= 8)),
  `${Object.keys(form.look ?? {}).length} slots, tone ${form.lookTone}`);
check('form: appearance catalogs ride the edit form',
  form.faces.length >= 200 && form.gearSlots.length >= 6 && Object.keys(form.helmetMasks).length >= 15,
  `${form.faces.length} faces, ${form.gearSlots.length} slots`);

const recruitForm = await buildEditForm(franchise, recruitRow, work);
check('form: recruit flagged, no jersey', recruitForm.isRecruit && recruitForm.jersey === null);
check('form: recruit is undressed until enrollment', recruitForm.look === null);

// --- 2. the edit writes the sibling; the source file never changes ---
const ratingField = form.ratings[0].field;
const mentalPick = form.mentalOptions[0].id;
const editFace = form.faces.find((f) => f.tone === 4) ?? form.faces[0];
const editState = Object.keys(form.cities).sort().find((st) => st !== form.homeState && form.cities[st].length)!;
const editTown = form.cities[editState][0];
const preLookRef = refFromRecord(
  (mainTable(franchise, 'Player')).records[rosterRow], 'CharacterVisuals'
);
const { editedPath } = await applyPlayerEdit(
  franchise,
  work,
  {
    playerRow: rosterRow,
    firstName: 'Harness',
    lastName: 'Verified',
    jersey: 7,
    ratings: { [ratingField]: 99 },
    mental: [{ slot: 1, ability: mentalPick, rank: 'Gold' }],
    physical: form.physical.length ? [{ slot: form.physical[0].slot, rank: 'Platinum' }] : [],
    face: editFace,
    skinTone: editFace.tone,
    bodyType: 2,
    gear: { Towel: 'Towel_West' },
    homeState: editState,
    homeTown: editTown.town
  },
  dir
);
check('write: landed at the sibling path', editedPath === editedPathFor(work), editedPath);
check('write: source file bytes untouched', sha(work) === sourceHash);

const readBack = await loadFranchise(editedPath);
const p2 = mainTable(readBack, 'Player');
await p2.readRecords();
const rb = p2.records[rosterRow];
check('write: names + jersey persisted',
  String(val(rb, 'FirstName')) === 'Harness' && String(val(rb, 'LastName')) === 'Verified' && Number(val(rb, 'JerseyNum')) === 7);
check('write: rating persisted', Number(val(rb, ratingField)) === 99, `${ratingField}=${val(rb, ratingField)}`);
check('write: mental ability + tier persisted',
  String(val(rb, 'MentalAbility1')) === mentalPick && String(val(rb, 'MentalAbilityRank1')) === 'Gold',
  `${val(rb, 'MentalAbility1')}/${val(rb, 'MentalAbilityRank1')}`);
if (form.physical.length) {
  check('write: physical tier persisted',
    String(val(rb, `PhysicalAbility${form.physical[0].slot}`)) === 'Platinum');
}
check('write: hometown pair + pipeline persisted',
  String(val(rb, 'PLYR_HOME_STATE')) === editState &&
  String(val(rb, 'PLYR_HOME_TOWN')) === editTown.town &&
  String(val(rb, 'HomePipeline')) === editTown.pipeline,
  `${val(rb, 'PLYR_HOME_TOWN')}, ${val(rb, 'PLYR_HOME_STATE')} -> ${val(rb, 'HomePipeline')}`);
check('write: face swap persisted on the player row',
  String(val(rb, 'GenericHeadAssetName')) === editFace.assetName &&
  Number(val(rb, 'PLYR_PORTRAIT')) === editFace.portraitId,
  `${val(rb, 'GenericHeadAssetName')} / ${val(rb, 'PLYR_PORTRAIT')}`);
{
  const ref2 = refFromRecord(rb, 'CharacterVisuals');
  const vT2 = ref2 && ref2.tableId !== 0 ? readBack.getTableById(ref2.tableId) : null;
  if (vT2 && !vT2.recordsRead) await vT2.readRecords();
  const blob = vT2 ? JSON.parse(String(vT2.records[ref2!.row]._fields.RawData.value)) : null;
  const towel = (blob?.loadouts ?? []).flatMap((l: any) => l.loadoutElements ?? [])
    .find((e: any) => e.slotType === 'Towel')?.itemAssetName;
  check('write: look edited in the player\'s own visuals row',
    !!preLookRef && ref2?.tableId === preLookRef.tableId && ref2?.row === preLookRef.row &&
    blob?.skinTone === editFace.tone && blob?.bodyType === 2 && towel === 'Towel_West',
    `row ${ref2?.row} (was ${preLookRef?.row}), tone ${blob?.skinTone}, body ${blob?.bodyType}, towel ${towel}`);
}

// --- 3. editing the edited save updates it in place, with a backup ---
const secondForm = await buildEditForm(readBack, recruitRow, editedPath);
check('form: on an edited save the target is itself',
  secondForm.targetFileName === path.basename(editedPath) && secondForm.targetExists);
const second = await applyPlayerEdit(
  readBack,
  editedPath,
  { playerRow: recruitRow, firstName: 'Second', lastName: 'Pass' },
  dir
);
check('in-place: same file', second.editedPath === editedPath);
const backups = existsSync(path.join(dir, 'backups')) ? readdirSync(path.join(dir, 'backups')) : [];
check('in-place: backup taken first', backups.length === 1, backups.join(', '));
const readBack2 = await loadFranchise(editedPath);
const p3 = mainTable(readBack2, 'Player');
await p3.readRecords();
check('in-place: second edit persisted', String(val(p3.records[recruitRow], 'FirstName')) === 'Second');
check('in-place: recruit stays undressed (no visuals ref)',
  (() => { const r = refFromRecord(p3.records[recruitRow], 'CharacterVisuals'); return !r || r.tableId === 0; })());
check('in-place: first edit survives', String(val(p3.records[rosterRow], 'FirstName')) === 'Harness');
check('source still untouched after everything', sha(work) === sourceHash);

// --- 4. bad payloads are rejected whole ---
const before = sha(editedPath);
await rejects('reject: rating over 99 (would bit-wrap)', () =>
  applyPlayerEdit(readBack2, editedPath, { playerRow: rosterRow, ratings: { [ratingField]: 120 } }, dir));
await rejects('reject: empty first name', () =>
  applyPlayerEdit(readBack2, editedPath, { playerRow: rosterRow, firstName: '   ' }, dir));
await rejects('reject: name past the schema cap', () =>
  applyPlayerEdit(readBack2, editedPath, { playerRow: rosterRow, firstName: 'X'.repeat(18) }, dir));
await rejects('reject: unknown mental ability', () =>
  applyPlayerEdit(readBack2, editedPath, { playerRow: rosterRow, mental: [{ slot: 1, ability: 'MoxieMaximus', rank: 'Gold' }] }, dir));
await rejects('reject: unknown rating field', () =>
  applyPlayerEdit(readBack2, editedPath, { playerRow: rosterRow, ratings: { OverallRating: 99 } }, dir));
await rejects('reject: jersey out of range', () =>
  applyPlayerEdit(readBack2, editedPath, { playerRow: rosterRow, jersey: 100 }, dir));
await rejects('reject: face outside the catalog', () =>
  applyPlayerEdit(readBack2, editedPath, {
    playerRow: rosterRow,
    face: { headId: 'NoHead', assetName: 'gen_head_madeup_001', portraitId: 99999, tone: 4 }
  }, dir));
await rejects('reject: unknown gear on an edit', () =>
  applyPlayerEdit(readBack2, editedPath, { playerRow: rosterRow, gear: { Towel: 'Towel_Imaginary' } }, dir));
await rejects('reject: dressing an unenrolled prospect (game blanks on it)', () =>
  applyPlayerEdit(readBack2, editedPath, { playerRow: recruitRow, gear: { Towel: 'Towel_West' } }, dir));
await rejects('reject: skin tone off the scale', () =>
  applyPlayerEdit(readBack2, editedPath, { playerRow: rosterRow, skinTone: 9 }, dir));
await rejects('reject: hometown not on the state list', () =>
  applyPlayerEdit(readBack2, editedPath, { playerRow: rosterRow, homeTown: 'Made Up Ville' }, dir));
await rejects('reject: unknown body type', () =>
  applyPlayerEdit(readBack2, editedPath, { playerRow: rosterRow, bodyType: 9 }, dir));
check('rejections left the edited file unchanged', sha(editedPath) === before);

// --- 5. program resources: Fundraising + recruiter hours ---
// A user-controlled team row: find one via isUserTeam? The harness stays
// save-agnostic — use the first team whose budget reads non-zero.
{
  const teams = mainTable(readBack2, 'Team');
  await teams.readRecords(['ProgramPointBudget', 'LongName']);
  let teamRow = -1;
  for (let i = 0; i < teams.records.length; i++) {
    const r = teams.records[i];
    if (!r.isEmpty && Number(val(r, 'ProgramPointBudget')) > 0) {
      teamRow = i;
      break;
    }
  }
  const rf = await buildResourceForm(readBack2, teamRow, editedPath);
  check('resource form: school + caps read', rf.school.length > 0 && rf.budget.headroom >= 0,
    `${rf.school}, headroom ${rf.budget.headroom}`);
  check('resource form: hours block present', rf.hours !== null,
    rf.hours ? `${rf.hours.total} total (headroom ${rf.hours.headroom})` : 'missing');

  const raise = Math.min(500, rf.budget.headroom);
  const res = await applyResourceEdit(readBack2, editedPath, { teamRow, kind: 'nil', amount: raise }, dir);
  check('fundraising: applied in full', res.applied === raise, `+${res.applied}`);
  const fr5 = await loadFranchise(editedPath);
  const t5 = mainTable(fr5, 'Team');
  await t5.readRecords();
  const w = t5.records[teamRow];
  const pillarSum =
    Number(val(w, 'BrandExposureProgramPoints')) + Number(val(w, 'ProgramTraditionsProgramPoints')) +
    Number(val(w, 'StadiumAtmosphereProgramPoints')) + Number(val(w, 'ConferencePrestigeProgramPoints')) +
    Number(val(w, 'CoachContractGoalsProgramPoints')) + Number(val(w, 'RolloverProgramPoints'));
  check('fundraising: budget/remaining/rollover moved together',
    Number(val(w, 'ProgramPointBudget')) === rf.budget.total + raise &&
    Number(val(w, 'RemainingProgramPoints')) === rf.budget.remaining + raise &&
    Number(val(w, 'RolloverProgramPoints')) === rf.budget.rollover + raise);
  check('fundraising: pillars still sum to the total', pillarSum === Number(val(w, 'ProgramPointBudget')),
    `${pillarSum} vs ${val(w, 'ProgramPointBudget')}`);

  if (rf.hours) {
    const hourRaise = Math.min(100, rf.hours.headroom);
    const res2 = await applyResourceEdit(fr5, editedPath, { teamRow, kind: 'hours', amount: hourRaise }, dir);
    check('hours: applied in full', res2.applied === hourRaise, `+${res2.applied}`);
    const overCap = await applyResourceEdit(
      await loadFranchise(editedPath), editedPath, { teamRow, kind: 'hours', amount: 30000 }, dir
    ).then((r) => r.applied, () => -1);
    check('hours: oversize raise clamps to the 4095 cap headroom', overCap >= 0 && overCap < 30000,
      `applied ${overCap}`);
  }
  await rejects('resource reject: zero amount', async () =>
    applyResourceEdit(await loadFranchise(editedPath), editedPath, { teamRow, kind: 'nil', amount: 0 }, dir));
  check('source still untouched after resource edits', sha(work) === sourceHash);
}

// --- 6. depth chart: swap round-trip + whole-payload rejections ---
{
  const fr = await loadFranchise(editedPath);
  const teams = mainTable(fr, 'Team');
  await teams.readRecords();
  let teamRow = -1;
  for (let i = 0; i < teams.records.length; i++) {
    const r = teams.records[i];
    if (!r.isEmpty && Number(val(r, 'ProgramPointBudget')) > 0) {
      teamRow = i;
      break;
    }
  }
  const players = mainTable(fr, 'Player');
  await players.readRecords(['TeamIndex']);
  const pid = players.header?.tableId ?? -1;
  const windowOf = async (franchise: any, row: number, pos: string): Promise<number[]> => {
    const t = mainTable(franchise, 'Team');
    await t.readRecords();
    const dcRef = refFromRecord(t.records[row], 'DepthChart');
    const dcT = franchise.getTableById(dcRef!.tableId);
    if (!dcT.recordsRead) await dcT.readRecords();
    const slotRef = refFromRecord(dcT.records[dcRef!.row], pos);
    const arrT = franchise.getTableById(slotRef!.tableId);
    if (!arrT.recordsRead) await arrT.readRecords();
    const arr = arrT.records[slotRef!.row];
    const out: number[] = [];
    for (let i = 0; i < (arr.arraySize ?? 0); i++) {
      const v = arr._fields[`Player${i}`]?.value as string;
      out.push(parseInt(v.slice(15), 2));
    }
    return out;
  };

  const before = await windowOf(fr, teamRow, 'QB');
  check('depth: QB window resolves', before.length >= 2, `${before.length} slots`);
  const swapped = [...before];
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  const res = await applyDepthChartEdit(
    fr, editedPath, { teamRow, changes: [{ position: 'QB', playerRows: swapped }] }, dir
  );
  check('depth: swap wrote in place', res.editedPath === editedPath && res.windows === 1);
  const after = await windowOf(await loadFranchise(editedPath), teamRow, 'QB');
  check('depth: swap persisted through cold reload', after.join(',') === swapped.join(','));

  const fr2 = await loadFranchise(editedPath);
  await rejects('depth reject: wrong slot count', () =>
    applyDepthChartEdit(fr2, editedPath, { teamRow, changes: [{ position: 'QB', playerRows: swapped.slice(1) }] }, dir));
  await rejects('depth reject: duplicate player in a window', () =>
    applyDepthChartEdit(fr2, editedPath, { teamRow, changes: [{ position: 'QB', playerRows: swapped.map(() => swapped[0]) }] }, dir));
  await rejects('depth reject: unknown window', () =>
    applyDepthChartEdit(fr2, editedPath, { teamRow, changes: [{ position: 'QB9', playerRows: swapped }] }, dir));
  const foreign = (() => {
    const teamIndex = Number(val(teams.records[teamRow], 'TeamIndex'));
    for (let i = 0; i < players.records.length; i++) {
      const p = players.records[i];
      if (!p.isEmpty && Number(val(p, 'TeamIndex')) !== teamIndex) return i;
    }
    return -1;
  })();
  await rejects('depth reject: player from another roster', () =>
    applyDepthChartEdit(fr2, editedPath, { teamRow, changes: [{ position: 'QB', playerRows: [foreign, ...swapped.slice(1)] }] }, dir));
  check('source still untouched after depth edits', sha(work) === sourceHash);
}

// --- 7. fire coach: PendingFire round-trip + rejections ---
{
  const fr = await loadFranchise(editedPath);
  const coach = mainTable(fr, 'Coach');
  await ensureCoachSchema(fr, coach);
  await coach.readRecords(['FirstName', 'Position', 'IsUserControlled', 'ContractStatus', 'TeamIndex']);
  let cpuHC = -1;
  let userCoach = -1;
  coach.records.forEach((r: any, i: number) => {
    const ti = Number(val(r, 'TeamIndex'));
    if (r.isEmpty || !val(r, 'FirstName') || !Number.isInteger(ti) || ti < 0 || ti >= 250) return;
    const status = String(val(r, 'ContractStatus'));
    if (cpuHC < 0 && val(r, 'IsUserControlled') !== true && String(val(r, 'Position')) === 'HeadCoach' && (status === 'First_Active' || status === 'Signed')) cpuHC = i;
    if (userCoach < 0 && val(r, 'IsUserControlled') === true) userCoach = i;
  });
  check('fire: found a CPU head coach', cpuHC >= 0, `row ${cpuHC}`);

  const fired = await applyCoachFire(fr, editedPath, { coachRow: cpuHC, undo: false }, dir);
  check('fire: PendingFire written', fired.editedPath === editedPath, fired.coachName);
  const fr2 = await loadFranchise(editedPath);
  const c2 = mainTable(fr2, 'Coach');
  await ensureCoachSchema(fr2, c2);
  await c2.readRecords(['ContractStatus']);
  const readBackStatus = String(val(c2.records[cpuHC], 'ContractStatus'));
  check('fire: persisted through cold reload (alias-tolerant)',
    readBackStatus === 'PendingFire' || readBackStatus === 'First_Pending', readBackStatus);

  await rejects('fire reject: already marked', () =>
    applyCoachFire(fr2, editedPath, { coachRow: cpuHC, undo: false }, dir));
  if (userCoach >= 0) {
    await rejects('fire reject: user-controlled coach', () =>
      applyCoachFire(fr2, editedPath, { coachRow: userCoach, undo: false }, dir));
  }

  const undone = await applyCoachFire(fr2, editedPath, { coachRow: cpuHC, undo: true }, dir);
  check('fire: undo restores Signed', undone.coachName === fired.coachName);
  const fr3 = await loadFranchise(editedPath);
  const c3 = mainTable(fr3, 'Coach');
  await ensureCoachSchema(fr3, c3);
  await c3.readRecords(['ContractStatus']);
  const restored = String(val(c3.records[cpuHC], 'ContractStatus'));
  check('fire: undo persisted', restored === 'Signed' || restored === 'First_Active', restored);
  check('source still untouched after fire edits', sha(work) === sourceHash);
}

// --- 8. board membership: remove + add round-trips + rejections ---
{
  const fr = await loadFranchise(editedPath);
  const teams = mainTable(fr, 'Team');
  await teams.readRecords();
  let teamRow = -1;
  for (let i = 0; i < teams.records.length; i++) {
    const r = teams.records[i];
    if (!r.isEmpty && Number(val(r, 'ProgramPointBudget')) > 0) {
      teamRow = i;
      break;
    }
  }
  const boardRows = async (franchise: any): Promise<Set<number>> => {
    const t = mainTable(franchise, 'Team');
    await t.readRecords();
    const bRef = refFromRecord(t.records[teamRow], 'RecruitingBoard');
    const bT = franchise.getTableById(bRef!.tableId);
    if (!bT.recordsRead) await bT.readRecords();
    const lRef = refFromRecord(bT.records[bRef!.row], 'Recruits');
    const lT = franchise.getTableById(lRef!.tableId);
    if (!lT.recordsRead) await lT.readRecords();
    const arr = lT.records[lRef!.row];
    const out = new Set<number>();
    for (let i = 0; i < (arr.arraySize ?? 0); i++) {
      const tr = refFromRecord(arr, `RecruitTarget${i}`);
      if (!tr || (tr.tableId === 0 && tr.row === 0)) continue;
      const tT = franchise.getTableById(tr.tableId);
      if (!tT.recordsRead) await tT.readRecords();
      const rRef = refFromRecord(tT.records[tr.row], 'Recruit');
      if (rRef) out.add(rRef.row);
    }
    return out;
  };

  const before = await boardRows(fr);
  check('board: resolves', before.size > 0, `${before.size} targets`);
  const removeTarget = [...before][0];
  removedTargetGlobal = removeTarget;

  // an uncommitted recruit who is NOT on this board
  const recruitsT = mainTable(fr, 'Recruit');
  await recruitsT.readRecords(['Player', 'RecruitStage']);
  let addTarget = -1;
  let committedRecruit = -1;
  for (let i = 0; i < recruitsT.records.length; i++) {
    const r = recruitsT.records[i];
    if (r.isEmpty) continue;
    const committed = String(val(r, 'RecruitStage') ?? '').includes('Committed');
    if (committedRecruit < 0 && committed) committedRecruit = i;
    if (addTarget < 0 && !committed && !before.has(i)) addTarget = i;
    if (addTarget >= 0 && committedRecruit >= 0) break;
  }
  check('board: found an addable recruit', addTarget >= 0, `recruit row ${addTarget}`);
  addTargetGlobal = addTarget;

  const res = await applyBoardEdit(
    fr, editedPath,
    { teamRow, changes: [{ recruitRow: removeTarget, action: 'remove' }, { recruitRow: addTarget, action: 'add' }] },
    dir
  );
  check('board: batch applied', res.added === 1 && res.removed === 1);
  const after = await boardRows(await loadFranchise(editedPath));
  check('board: add persisted through cold reload', after.has(addTarget));
  check('board: remove persisted through cold reload', !after.has(removeTarget));
  check('board: count held', after.size === before.size, `${before.size} -> ${after.size}`);

  const fr2 = await loadFranchise(editedPath);
  await rejects('board reject: already on the board', () =>
    applyBoardEdit(fr2, editedPath, { teamRow, changes: [{ recruitRow: addTarget, action: 'add' }] }, dir));
  await rejects('board reject: not on the board', () =>
    applyBoardEdit(fr2, editedPath, { teamRow, changes: [{ recruitRow: removeTarget, action: 'remove' }] }, dir));
  if (committedRecruit >= 0) {
    await rejects('board reject: committed recruit', () =>
      applyBoardEdit(fr2, editedPath, { teamRow, changes: [{ recruitRow: committedRecruit, action: 'add' }] }, dir));
  }
  await rejects('board reject: duplicate change', () =>
    applyBoardEdit(fr2, editedPath, { teamRow, changes: [
      { recruitRow: addTarget, action: 'remove' }, { recruitRow: addTarget, action: 'add' }
    ] }, dir));
  check('source still untouched after board edits', sha(work) === sourceHash);
}

// --- 9. weekly target actions on the freshly added recruit ---
{
  const fr = await loadFranchise(editedPath);
  const teams = mainTable(fr, 'Team');
  await teams.readRecords();
  let teamRow = -1;
  for (let i = 0; i < teams.records.length; i++) {
    const r = teams.records[i];
    if (!r.isEmpty && Number(val(r, 'ProgramPointBudget')) > 0) {
      teamRow = i;
      break;
    }
  }
  // the recruit added in section 8 sits on this board with a fresh row
  const form = await buildTargetForm(fr, teamRow, addTargetGlobal, editedPath);
  check('actions form: caps from the schema',
    form.hoursCap === 127 && form.nilCap === 1023 && form.intelMax === 16383,
    `${form.hoursCap}/${form.nilCap}/${form.intelMax}`);
  check('actions form: fresh state', form.hours === 0 && form.intel === 0 && form.scholarship === 'None');
  check('actions form: sway options carry pitch names',
    form.swayOptions.length >= 15 && form.swayOptions.every((o) => o.name), `${form.swayOptions.length}`);

  const poolBefore = form.poolAssigned;
  await applyTargetActions(fr, editedPath, {
    teamRow,
    recruitRow: addTargetGlobal,
    hours: 40,
    actions: { sendHouse: true, socialMedia: true },
    scholarship: 'Offered',
    nilOffer: 300,
    swayPitch: 'HometownHero',
    scoutFull: true
  }, dir);
  const form2 = await buildTargetForm(await loadFranchise(editedPath), teamRow, addTargetGlobal, editedPath);
  check('actions: everything persisted through cold reload',
    form2.hours === 40 && form2.actions.sendHouse && form2.actions.socialMedia &&
    form2.scholarship === 'Offered' && form2.nilOffer === 300 &&
    form2.swayPitch === 'HometownHero' && form2.intel === 16383,
    JSON.stringify({ h: form2.hours, s: form2.scholarship, n: form2.nilOffer, p: form2.swayPitch, i: form2.intel }));
  check('actions: pool assigned moved with the hours', form2.poolAssigned === poolBefore + 40,
    `${poolBefore} -> ${form2.poolAssigned}`);

  const fr3 = await loadFranchise(editedPath);
  await rejects('actions reject: hours past the 7-bit cap', () =>
    applyTargetActions(fr3, editedPath, { teamRow, recruitRow: addTargetGlobal, hours: 200 }, dir));
  await rejects('actions reject: NIL past the 10-bit cap', () =>
    applyTargetActions(fr3, editedPath, { teamRow, recruitRow: addTargetGlobal, nilOffer: 2000 }, dir));
  await rejects('actions reject: unknown pitch', () =>
    applyTargetActions(fr3, editedPath, { teamRow, recruitRow: addTargetGlobal, swayPitch: 'MoxiePitch' }, dir));
  await rejects('actions reject: recruit not on the board', () =>
    applyTargetActions(fr3, editedPath, { teamRow, recruitRow: removedTargetGlobal, hours: 5 }, dir));
  check('source still untouched after action edits', sha(work) === sourceHash);
}

// --- 10. create a recruit: clone-with-overrides round-trip + rejections ---
{
  const fr = await loadFranchise(editedPath);
  const cform = await buildCreateForm(fr, editedPath);
  const positions = Object.keys(cform.archetypesByPosition);
  check('create form: archetypes per position from the class', positions.length >= 15,
    `${positions.length} positions`);
  check('create form: states + dev traits from the schema',
    cform.states.length >= 40 && cform.devTraits.length >= 3,
    `${cform.states.length} states, ${cform.devTraits.length} traits`);
  check('create form: row supply reported', cform.playerRowsFree > 0 && cform.recruitRowsFree > 0,
    `${cform.playerRowsFree} player / ${cform.recruitRowsFree} recruit rows`);

  const pos = positions.includes('QB') ? 'QB' : positions[0];
  const archetype = cform.archetypesByPosition[pos][0];
  const state = cform.states.includes('Ohio') ? 'Ohio' : cform.states[0];
  const homeCity = cform.cities[state]?.[0];
  check('create form: hometowns per state with pipelines',
    Object.keys(cform.cities).length >= 40 && !!homeCity?.town && !!homeCity?.pipeline,
    `${Object.keys(cform.cities).length} states; ${state} first: ${homeCity?.town} (${homeCity?.pipeline})`);
  const res = await applyCreateRecruit(fr, editedPath, {
    firstName: 'Custom',
    lastName: 'Prospect',
    position: pos,
    archetype,
    stars: 5,
    devTrait: cform.devTraits[cform.devTraits.length - 1],
    heightIn: 76,
    weightLb: 215,
    homeState: state,
    homeTown: homeCity.town
  }, dir);
  check('create: wrote in place', res.editedPath === editedPath, `recruit row ${res.recruitRow}`);

  const fr2 = await loadFranchise(editedPath);
  const rT = mainTable(fr2, 'Recruit');
  await rT.readRecords();
  const pT = mainTable(fr2, 'Player');
  await pT.readRecords();
  const nr = rT.records[res.recruitRow];
  const npRef = refFromRecord(nr, 'Player');
  const np = pT.records[npRef!.row];
  check('create: player row reads back',
    String(val(np, 'FirstName')) === 'Custom' && String(val(np, 'LastName')) === 'Prospect' &&
    String(val(np, 'Position')) === pos && String(val(np, 'PlayerType')) === archetype,
    `${val(np, 'FirstName')} ${val(np, 'LastName')} ${val(np, 'Position')}/${val(np, 'PlayerType')}`);
  check('create: measurables + identity overrides',
    Number(val(np, 'Height')) === 76 && Number(val(np, 'Weight')) === 55 &&
    String(val(np, 'ProspectStarRating')) === 'FIVE_STAR' &&
    String(val(np, 'PLYR_HOME_STATE')) === state,
    `H${val(np, 'Height')} W${val(np, 'Weight')} ${val(np, 'ProspectStarRating')}`);
  check('create: ratings inherited from the template (non-zero sheet)',
    Number(val(np, 'SpeedRating')) > 0 && Number(val(np, 'AwarenessRating')) > 0);
  check('create: recruit row state',
    String(val(nr, 'RecruitStage')) === 'Top10' && Number(val(nr, 'NationalRank')) === 0 &&
    String(val(nr, 'QualityModifier')) === 'NORMAL',
    `${val(nr, 'RecruitStage')} rank ${val(nr, 'NationalRank')}`);
  const raceRef = refFromRecord(nr, 'TopSchoolsList');
  check('create: race list starts empty (zero ref)', !raceRef || raceRef.tableId === 0);
  check('create: hometown pipeline follows the city',
    String(val(np, 'PLYR_HOME_TOWN')) === homeCity.town &&
    String(val(np, 'HomePipeline')) === homeCity.pipeline,
    `${val(np, 'PLYR_HOME_TOWN')} -> ${val(np, 'HomePipeline')}`);
  await rejects('create reject: hometown not in the state list', () =>
    applyCreateRecruit(fr2, editedPath, {
      firstName: 'A', lastName: 'B', position: pos, archetype, stars: 3,
      devTrait: cform.devTraits[0], heightIn: 74, weightLb: 200,
      homeState: state, homeTown: 'Made Up Ville'
    }, dir));

  // The created recruit can immediately ride the other write families.
  const boardRes = await applyBoardEdit(
    fr2, editedPath, { teamRow: 0, changes: [{ recruitRow: res.recruitRow, action: 'add' }] }, dir
  );
  check('create: new recruit can join the board', boardRes.added === 1);

  const fr3 = await loadFranchise(editedPath);
  await rejects('create reject: empty name', () =>
    applyCreateRecruit(fr3, editedPath, {
      firstName: ' ', lastName: 'X', position: pos, archetype, stars: 3,
      devTrait: cform.devTraits[0], heightIn: 74, weightLb: 200, homeState: state, homeTown: homeCity.town
    }, dir));
  await rejects('create reject: bad stars', () =>
    applyCreateRecruit(fr3, editedPath, {
      firstName: 'A', lastName: 'B', position: pos, archetype, stars: 7,
      devTrait: cform.devTraits[0], heightIn: 74, weightLb: 200, homeState: state, homeTown: homeCity.town
    }, dir));
  await rejects('create reject: unknown archetype/position template', () =>
    applyCreateRecruit(fr3, editedPath, {
      firstName: 'A', lastName: 'B', position: 'QQ', archetype: 'QQ_Wizard', stars: 3,
      devTrait: cform.devTraits[0], heightIn: 74, weightLb: 200, homeState: state, homeTown: homeCity.town
    }, dir));
  await rejects('create reject: unknown state', () =>
    applyCreateRecruit(fr3, editedPath, {
      firstName: 'A', lastName: 'B', position: pos, archetype, stars: 3,
      devTrait: cform.devTraits[0], heightIn: 74, weightLb: 200, homeState: 'Narnia', homeTown: homeCity.town
    }, dir));
  check('source still untouched after creation', sha(work) === sourceHash);

  // --- 10b. creations are face-only: the game dresses recruits at enrollment
  //     (in-game verified 2026-08-30 — a pre-provisioned visuals row blanks
  //     the dynasty UI). The gear catalogs still power the roster edit dialog.
  const cform2 = await buildCreateForm(await loadFranchise(editedPath), editedPath);
  check('create form: gear catalog from dressed players',
    cform2.gearSlots.length >= 6 && cform2.gearSlots.every((g) => g.options.length > 1),
    cform2.gearSlots.map((g) => `${g.slot}×${g.options.length}`).join(' '));
  check('create form: observed skin tones', cform2.skinTones.length >= 4, cform2.skinTones.join(','));
  const mask = cform2.gearSlots.find((g) => g.slot === 'FaceMask');
  await rejects('create reject: any look request (game dresses recruits)', async () =>
    applyCreateRecruit(await loadFranchise(editedPath), editedPath, {
      firstName: 'Styled', lastName: 'Prospect', position: pos, archetype, stars: 4,
      devTrait: cform2.devTraits[0], heightIn: 75, weightLb: 220, homeState: state, homeTown: homeCity.town,
      skinTone: cform2.skinTones[0], bodyType: 4,
      gear: mask ? { FaceMask: mask.options[0] } : undefined
    }, dir));
  // helmet↔mask compatibility: the game's loadout pairings + this save's
  const helmets = Object.keys(cform2.helmetMasks);
  check('create form: helmet-mask compatibility map', helmets.length >= 15 &&
    helmets.every((h) => cform2.helmetMasks[h].length > 0),
    `${helmets.length} helmets, Speed_Flex×${cform2.helmetMasks['GearHelmet_Speed_Flex']?.length}`);
  // the merged vocabulary carries game items no one in this save wears
  const helmetOpts = cform2.gearSlots.find((g) => g.slot === 'HeadWear')?.options ?? [];
  check('create form: game vocabulary merged into options',
    helmetOpts.includes('GearHelmet_RevolutionSpeed') && helmetOpts.length >= 15 &&
    (cform2.gearSlots.find((g) => g.slot === 'FaceMask')?.options.length ?? 0) >= 100,
    `${helmetOpts.length} helmets, ${cform2.gearSlots.find((g) => g.slot === 'FaceMask')?.options.length} masks`);
  check('create form: base look named per position',
    !!cform2.baseLook[pos]?.HeadWear && Object.keys(cform2.baseLook).length >= 5,
    `${pos}: ${cform2.baseLook[pos]?.HeadWear}, tone ${cform2.baseTones[pos]}`);
  // helmet↔mask coupling now exercises through the rostered edit path: a
  // game-vocabulary mask this save never dressed, on the rostered player.
  const soloHelmet = 'GearHelmet_RevolutionSpeed';
  const soloMask = cform2.helmetMasks[soloHelmet][0];
  const frM = await loadFranchise(editedPath);
  const pTM0 = mainTable(frM, 'Player');
  await pTM0.readRecords();
  const ownRef = refFromRecord(pTM0.records[rosterRow], 'CharacterVisuals')!;
  const vTM0 = frM.getTableById(ownRef.tableId);
  await vTM0.readRecords();
  const ownItems: Record<string, string> = {};
  for (const lo of JSON.parse(String(vTM0.records[ownRef.row]._fields.RawData.value)).loadouts ?? []) {
    for (const el of lo?.loadoutElements ?? []) {
      if (el?.slotType && el?.itemAssetName && ownItems[el.slotType] === undefined) {
        ownItems[el.slotType] = el.itemAssetName;
      }
    }
  }
  const ownHelmet = ownItems['HeadWear'];
  const expectHelmet = ownHelmet && cform2.helmetMasks[ownHelmet]?.includes(soloMask)
    ? ownHelmet
    : Object.keys(cform2.helmetMasks).find((h) => cform2.helmetMasks[h].includes(soloMask));
  await applyPlayerEdit(frM, editedPath, { playerRow: rosterRow, gear: { FaceMask: soloMask } }, dir);
  const frM2 = await loadFranchise(editedPath);
  const pTM = mainTable(frM2, 'Player');
  await pTM.readRecords();
  const vRefM = refFromRecord(pTM.records[rosterRow], 'CharacterVisuals')!;
  const vTM = frM2.getTableById(vRefM.tableId);
  await vTM.readRecords();
  const vjM = JSON.parse(String(vTM.records[vRefM.row]._fields.RawData.value));
  const els = vjM.loadouts.flatMap((l: any) => l.loadoutElements ?? []);
  const gotHelmet = els.find((e: any) => e.slotType === 'HeadWear')?.itemAssetName;
  const gotMask = els.find((e: any) => e.slotType === 'FaceMask')?.itemAssetName;
  check('edit: game-vocab mask lands, helmet resolves per the rules',
    gotMask === soloMask && gotHelmet === expectHelmet,
    `${gotHelmet} :: ${gotMask} (own ${ownHelmet}, expected ${expectHelmet})`);
  check('source still untouched after look edits', sha(work) === sourceHash);

  // --- 10c. creation with a chosen face (head + portrait + tone triple) ---
  check('create form: face catalog from real players',
    cform2.faces.length >= 200 &&
    cform2.faces.every((f) => f.portraitId > 0 && f.tone >= 1 && f.tone <= 8 && !!f.headId && !!f.assetName),
    `${cform2.faces.length} faces, tones ${[...new Set(cform2.faces.map((f) => f.tone))].sort().join(',')}`);
  // Prefer a tone-8 face: it exercises the full 1-8 skin-tone range.
  const face = cform2.faces.find((f) => f.tone === 8) ?? cform2.faces[Math.floor(cform2.faces.length / 2)];
  check('create form: faces are generic art with embedded portrait ids',
    cform2.faces.every((f) => f.assetName.startsWith('Generic_') && Number(f.assetName.split('_')[1]) === f.portraitId),
    face.assetName);
  // frM2 already reflects the current on-disk state — reuse it for the write.
  const resF = await applyCreateRecruit(frM2, editedPath, {
    firstName: 'Chosen', lastName: 'Face', position: pos, archetype, stars: 3,
    devTrait: cform2.devTraits[0], heightIn: 74, weightLb: 210, homeState: state, homeTown: homeCity.town,
    face
  }, dir);
  const frF2 = await loadFranchise(editedPath);
  const pTF = mainTable(frF2, 'Player');
  await pTF.readRecords();
  const npF = pTF.records[resF.playerRow];
  check('create: chosen face lands on the player',
    String(val(npF, 'PLYR_GENERICHEAD')) === face.headId &&
    String(val(npF, 'GenericHeadAssetName')) === face.assetName &&
    Number(val(npF, 'PLYR_PORTRAIT')) === face.portraitId,
    `${val(npF, 'PLYR_GENERICHEAD')} / ${val(npF, 'GenericHeadAssetName')} / ${val(npF, 'PLYR_PORTRAIT')}`);
  const vRefF = refFromRecord(npF, 'CharacterVisuals');
  check('create: created recruit stays undressed (game dresses at enrollment)',
    !vRefF || vRefF.tableId === 0, JSON.stringify(vRefF));
  // Validation rejects before any mutation, so frF2 can host the refusal.
  await rejects('create reject: face not in the catalog', async () =>
    applyCreateRecruit(frF2, editedPath, {
      firstName: 'A', lastName: 'B', position: pos, archetype, stars: 3,
      devTrait: cform2.devTraits[0], heightIn: 74, weightLb: 200, homeState: state, homeTown: homeCity.town,
      face: { headId: face.headId, assetName: 'gen_head_madeup_001', portraitId: 99999, tone: face.tone }
    }, dir));
  check('source still untouched after face creation', sha(work) === sourceHash);
}

console.log(failures === 0 ? '\nedit-check: ALL PASS' : `\nedit-check: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
