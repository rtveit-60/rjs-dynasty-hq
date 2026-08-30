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
import type { EditMentalSlot, PlayerEditChanges, PlayerEditForm } from '../shared/types.ts';
import { MENTAL_ABILITIES } from '../shared/mental-abilities.ts';
import { PHYSICAL_ABILITY_SLOTS } from '../shared/physical-abilities.ts';
import { BY_GROUP, COMMON, GROUP_OF } from './parser/recruit-card.ts';
import { loadFranchise, mainTable, refFromRecord, val } from './parser/franchise.ts';

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
 * Validate, apply to the in-memory franchise, write the _RJsEdited sibling,
 * then reload the written file and read the row back — a write that cannot be
 * verified is rolled back (backup restored / new file removed) and thrown.
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

  const target = editedPathFor(savePath);
  const backupPath = backUp(target, join(backupDir, 'backups'));
  const existedBefore = backupPath !== null;
  try {
    await saveWithRetry(franchise, target);

    // Cold verify: the file loads as a CFB 27 save and carries the edit.
    const check = await loadFranchise(target);
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
