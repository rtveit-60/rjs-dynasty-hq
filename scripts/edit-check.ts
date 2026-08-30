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
  applyCoachFire,
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

const recruitForm = await buildEditForm(franchise, recruitRow, work);
check('form: recruit flagged, no jersey', recruitForm.isRecruit && recruitForm.jersey === null);

// --- 2. the edit writes the sibling; the source file never changes ---
const ratingField = form.ratings[0].field;
const mentalPick = form.mentalOptions[0].id;
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
    physical: form.physical.length ? [{ slot: form.physical[0].slot, rank: 'Platinum' }] : []
  },
  dir
);
check('write: landed at the sibling path', editedPath === editedPathFor(work), editedPath);
check('write: source file bytes untouched', sha(work) === sourceHash);

const readBack = await loadFranchise(editedPath);
const p2 = mainTable(readBack, 'Player');
await p2.readRecords(['FirstName', 'LastName', 'JerseyNum', ratingField, 'MentalAbility1', 'MentalAbilityRank1',
  ...(form.physical.length ? [`PhysicalAbility${form.physical[0].slot}`] : [])]);
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
await p3.readRecords(['FirstName', 'LastName']);
check('in-place: second edit persisted', String(val(p3.records[recruitRow], 'FirstName')) === 'Second');
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

console.log(failures === 0 ? '\nedit-check: ALL PASS' : `\nedit-check: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
