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
import { applyPlayerEdit, buildEditForm, editedPathFor } from '../src/main/editor.ts';
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

console.log(failures === 0 ? '\nedit-check: ALL PASS' : `\nedit-check: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
