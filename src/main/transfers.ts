/**
 * Manual transfers: move rostered players between two schools the way the
 * game's own TeamManager_SignPlayer does (RESEARCH "Manual transfers"):
 *
 *   old team   Roster.FindAndErase(player); every depth-chart window drops him;
 *              ActiveRosterSize -= 1
 *   player     PrevTeamIndex = old TeamIndex; TeamIndex = new TeamIndex;
 *              PLYR_CONSECYEARSWITHTEAM = 0; IsInjuredReserve = false
 *   new team   Roster.Append(player); ActiveRosterSize += 1
 *
 * The new team's depth chart is left for the game to refill (a fifth of every
 * roster sits in no window; the game rebuilds windows itself). Roster size is
 * capped at the save's own RosterInfo.MaxRosterSize (85). Same write posture
 * as every other edit: whole-payload validation, one write to the _RJsEdited
 * sibling through writeEditedSave, verified on a cold reload.
 */
import type { TransferRequest } from '../shared/types.ts';
import { isRecruitRow, refString, writeEditedSave } from './editor.ts';
import { isNullRef, mainTable, refFromRecord, refsFromArrayRecord, tableById, val } from './parser/franchise.ts';

const ZERO_REF = '0'.repeat(32);
const TEAM_FIELDS = ['TeamIndex', 'LongName', 'Roster', 'DepthChart', 'ActiveRosterSize', 'TEAM_TYPE'];
const PLAYER_FIELDS = ['TeamIndex', 'PrevTeamIndex', 'PLYR_CONSECYEARSWITHTEAM', 'IsInjuredReserve', 'FirstName', 'LastName'];
export const ROSTER_CAP_FALLBACK = 85;

/** The game's roster ceiling: RosterInfo.MaxRosterSize (stored above the schema's floor). */
export async function rosterCap(franchise: any): Promise<number> {
  try {
    const t = mainTable(franchise, 'RosterInfo');
    await t.readRecords(['MaxRosterSize']);
    const rec = (t.records as any[]).find((r) => !r.isEmpty);
    const raw = Number(val(rec, 'MaxRosterSize'));
    const floor = Number(rec?._fields?.MaxRosterSize?.offset?.minValue) || 0;
    const cap = raw + floor;
    if (Number.isFinite(cap) && cap >= 53 && cap <= 120) return cap;
  } catch {
    // fall through to the observed cap
  }
  return ROSTER_CAP_FALLBACK;
}

interface ArrayHandle {
  rec: any;
  keys: string[];
}

async function arrayAt(franchise: any, rec: any, field: string): Promise<ArrayHandle | null> {
  const ref = refFromRecord(rec, field);
  if (!ref || isNullRef(ref)) return null;
  const t = await tableById(franchise, ref.tableId);
  if (t && !t.recordsRead) await t.readRecords();
  const arr = t?.records?.[ref.row];
  if (!arr) return null;
  return { rec: arr, keys: Object.keys(arr._fields ?? {}) };
}

function arraySize(h: ArrayHandle): number {
  return typeof h.rec.arraySize === 'number' ? h.rec.arraySize : 0;
}

function slotOf(h: ArrayHandle, playerTableId: number, playerRow: number): number {
  const refs = refsFromArrayRecord(h.rec);
  return refs.findIndex((r) => r.tableId === playerTableId && r.row === playerRow);
}

/** Drop slot i and close the gap, keeping order (depth windows are ordered). */
function removeSlot(h: ArrayHandle, i: number): void {
  const size = arraySize(h);
  for (let j = i; j < size - 1; j++) h.rec[h.keys[j]] = h.rec._fields[h.keys[j + 1]].value;
  h.rec[h.keys[size - 1]] = ZERO_REF; // shrinks arraySize
}

function appendSlot(h: ArrayHandle, ref: string, what: string): void {
  const size = arraySize(h);
  if (size >= h.keys.length) throw new Error(`${what} has no free slot in the save.`);
  h.rec[h.keys[size]] = ref; // grows arraySize
}

const DEPTH_SKIP = new Set(['LockedEntries']);

async function depthWindows(franchise: any, teamRec: any): Promise<{ name: string; h: ArrayHandle }[]> {
  const dcRef = refFromRecord(teamRec, 'DepthChart');
  if (!dcRef || isNullRef(dcRef)) return [];
  const dcT = await tableById(franchise, dcRef.tableId);
  if (dcT && !dcT.recordsRead) await dcT.readRecords();
  const dc = dcT?.records?.[dcRef.row];
  if (!dc) return [];
  const out: { name: string; h: ArrayHandle }[] = [];
  for (const name of Object.keys(dc._fields ?? {})) {
    if (DEPTH_SKIP.has(name)) continue;
    const h = await arrayAt(franchise, dc, name);
    if (h) out.push({ name, h });
  }
  return out;
}

export async function applyRosterTransfers(
  franchise: any,
  savePath: string,
  req: TransferRequest,
  backupDir: string
): Promise<{ editedPath: string; moved: number; summary: string }> {
  const moves = Array.isArray(req?.moves) ? req.moves : [];
  if (!moves.length) throw new Error('No transfers to save.');
  if (moves.length > 100) throw new Error('Too many transfers in one write.');
  if (new Set(moves.map((m) => m.playerRow)).size !== moves.length) throw new Error('A player appears twice.');

  const teams = mainTable(franchise, 'Team');
  await teams.readRecords(TEAM_FIELDS);
  const players = mainTable(franchise, 'Player');
  await players.readRecords(PLAYER_FIELDS);
  const playerTableId = players.header?.tableId ?? -1;
  const cap = await rosterCap(franchise);

  const teamRec = (row: number): any => {
    const r = teams.records?.[row];
    if (!Number.isInteger(row) || !r || r.isEmpty) throw new Error(`No school at row ${row}.`);
    if (String(val(r, 'TEAM_TYPE') ?? 'Current') !== 'Current') throw new Error('Only real programs can trade players.');
    return r;
  };
  const teamName = (r: any): string => String(val(r, 'LongName') ?? '').trim() || 'that school';

  // --- validate everything first ---
  const rosters = new Map<number, ArrayHandle>();
  const delta = new Map<number, number>();
  const named: string[] = [];
  for (const m of moves) {
    if (!Number.isInteger(m.playerRow) || m.fromTeamRow === m.toTeamRow) throw new Error('Bad transfer.');
    const from = teamRec(m.fromTeamRow);
    const to = teamRec(m.toTeamRow);
    const p = players.records?.[m.playerRow];
    if (!p || p.isEmpty) throw new Error(`No player at row ${m.playerRow}.`);
    const name = `${String(val(p, 'FirstName') ?? '').trim()} ${String(val(p, 'LastName') ?? '').trim()}`.trim();
    if (await isRecruitRow(franchise, m.playerRow)) throw new Error(`${name} is a prospect — only rostered players transfer.`);
    if (Number(val(p, 'TeamIndex')) !== Number(val(from, 'TeamIndex'))) {
      throw new Error(`${name} is not on ${teamName(from)}'s roster.`);
    }
    for (const row of [m.fromTeamRow, m.toTeamRow]) {
      if (!rosters.has(row)) {
        const h = await arrayAt(franchise, teams.records[row], 'Roster');
        if (!h) throw new Error(`${teamName(teams.records[row])} has no roster list in the save.`);
        rosters.set(row, h);
      }
    }
    if (slotOf(rosters.get(m.fromTeamRow)!, playerTableId, m.playerRow) < 0) {
      throw new Error(`${name} is not in ${teamName(from)}'s roster list.`);
    }
    delta.set(m.fromTeamRow, (delta.get(m.fromTeamRow) ?? 0) - 1);
    delta.set(m.toTeamRow, (delta.get(m.toTeamRow) ?? 0) + 1);
    named.push(`${name} → ${teamName(to)}`);
  }
  for (const [row, d] of delta) {
    const after = arraySize(rosters.get(row)!) + d;
    if (after > cap) {
      throw new Error(`${teamName(teams.records[row])} would carry ${after} players; the game's roster limit is ${cap}.`);
    }
  }

  // --- apply, mirroring the game's own sign-player choreography ---
  const windowsByTeam = new Map<number, { name: string; h: ArrayHandle }[]>();
  for (const m of moves) {
    const from = teams.records[m.fromTeamRow];
    const to = teams.records[m.toTeamRow];
    const p = players.records[m.playerRow];
    const fromRoster = rosters.get(m.fromTeamRow)!;
    const toRoster = rosters.get(m.toTeamRow)!;
    removeSlot(fromRoster, slotOf(fromRoster, playerTableId, m.playerRow));
    if (!windowsByTeam.has(m.fromTeamRow)) windowsByTeam.set(m.fromTeamRow, await depthWindows(franchise, from));
    for (const w of windowsByTeam.get(m.fromTeamRow)!) {
      let i = slotOf(w.h, playerTableId, m.playerRow);
      while (i >= 0) {
        removeSlot(w.h, i);
        i = slotOf(w.h, playerTableId, m.playerRow);
      }
    }
    appendSlot(toRoster, refString(playerTableId, m.playerRow), `${teamName(to)}'s roster`);
    p.PrevTeamIndex = Number(val(from, 'TeamIndex'));
    p.TeamIndex = Number(val(to, 'TeamIndex'));
    p.PLYR_CONSECYEARSWITHTEAM = 0;
    if (p._fields?.IsInjuredReserve) p.IsInjuredReserve = false;
    from.ActiveRosterSize = Math.max(0, (Number(val(from, 'ActiveRosterSize')) || 0) - 1);
    to.ActiveRosterSize = (Number(val(to, 'ActiveRosterSize')) || 0) + 1;
  }

  const { editedPath } = await writeEditedSave(franchise, savePath, backupDir, async (check) => {
    const t2 = mainTable(check, 'Team');
    await t2.readRecords(TEAM_FIELDS);
    const p2 = mainTable(check, 'Player');
    await p2.readRecords(['TeamIndex', 'PrevTeamIndex']);
    const pid2 = p2.header?.tableId ?? -1;
    for (const m of moves) {
      const from = t2.records[m.fromTeamRow];
      const to = t2.records[m.toTeamRow];
      const p = p2.records[m.playerRow];
      const bad = (why: string): never => {
        throw new Error(`The written save did not read back with the transfer (${why}).`);
      };
      if (Number(val(p, 'TeamIndex')) !== Number(val(to, 'TeamIndex'))) bad('team index');
      if (Number(val(p, 'PrevTeamIndex')) !== Number(val(from, 'TeamIndex'))) bad('previous team');
      const toRoster = await arrayAt(check, to, 'Roster');
      const fromRoster = await arrayAt(check, from, 'Roster');
      if (!toRoster || slotOf(toRoster, pid2, m.playerRow) < 0) bad('new roster');
      if (fromRoster && slotOf(fromRoster, pid2, m.playerRow) >= 0) bad('old roster');
      for (const w of await depthWindows(check, from)) {
        if (slotOf(w.h, pid2, m.playerRow) >= 0) bad(`old ${w.name} window`);
      }
    }
  });
  return { editedPath, moved: moves.length, summary: named.join(', ') };
}
