/**
 * Facilities editor: the form behind the NIL & Budget tab's FACILITIES
 * control and the write that applies it. Same posture as the other editors —
 * validation first, one write to the <save>_RJ sibling through
 * writeEditedSave, verified on a cold reload.
 *
 * Mechanism (RESEARCH "Athletic facilities"): Team.FacilitiesLevel is the
 * building tier 0–4 (Basic → National Powerhouse, names and costs generated
 * from the game's BuildingTeamUpgrade rows into shared/facilities.ts); the
 * game reserves each level's renewal fee in FacilitiesRenewalCostReserved,
 * so a level write moves the reserve with it. Equipment ownership rows
 * (EquipmentTeamUpgradeStatusList) are read for the slot-cap check and shown
 * read-only; the Athletic Facilities letter is re-graded weekly by the game
 * from the level's band plus the equipment bonus, so it is not written here.
 * Free sandbox by design (RJ, 2026-09-03): no program points move.
 */
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import type { FacilitiesChanges, FacilitiesForm } from '../shared/types.ts';
import { FACILITY_LEVELS, equipmentByAsset } from '../shared/facilities.ts';
import { editedPathFor, fieldMax, writeEditedSave } from './editor.ts';
import { isNullRef, mainTable, refFromRecord, refsFromArrayRecord, tableById, val } from './parser/franchise.ts';

const TEAM_FIELDS = [
  'DisplayName',
  'FacilitiesLevel',
  'FacilitiesRenewalCostReserved',
  'EquipmentTeamUpgradeStatusList',
  'MySchoolTrackingTable'
];

async function teamRecord(franchise: any, teamRow: number): Promise<any> {
  const table = mainTable(franchise, 'Team');
  await table.readRecords(TEAM_FIELDS);
  const rec = table.records?.[teamRow];
  if (!rec || rec.isEmpty) throw new Error('No school at that row in the save.');
  if (!rec._fields?.FacilitiesLevel) throw new Error('This save carries no facilities level on the team row.');
  return rec;
}

/** The school's owned equipment rows, resolved to catalog entries. */
async function ownedEquipment(franchise: any, teamRec: any): Promise<FacilitiesForm['equipment']> {
  const out: FacilitiesForm['equipment'] = [];
  const ref = refFromRecord(teamRec, 'EquipmentTeamUpgradeStatusList');
  if (isNullRef(ref)) return out;
  const aT = await tableById(franchise, ref.tableId);
  const arr = aT?.records?.[ref.row];
  if (!arr) return out;
  for (const er of refsFromArrayRecord(arr)) {
    if (er.tableId === 0 && er.row === 0) continue;
    const eT = await tableById(franchise, er.tableId);
    const e = eT?.records?.[er.row];
    if (!e || e.isEmpty) continue;
    const item = equipmentByAsset(String(val(e, 'TeamUpgrade') ?? ''));
    out.push({
      name: item?.name ?? 'Unknown equipment',
      effect: item?.effect ?? '',
      value: item?.value ?? 0,
      cost: Number(val(e, 'CostSpent') ?? 0),
      weeksOwned: Number(val(e, 'WeeksOwned') ?? 0)
    });
  }
  return out;
}

async function currentGrade(franchise: any, teamRec: any): Promise<string> {
  const ref = refFromRecord(teamRec, 'MySchoolTrackingTable');
  if (isNullRef(ref)) return '';
  const t = await tableById(franchise, ref.tableId);
  return String(val(t?.records?.[ref.row], 'AthleticFacilitiesGrade') ?? '');
}

export async function buildFacilitiesForm(franchise: any, teamRow: number, savePath: string): Promise<FacilitiesForm> {
  const rec = await teamRecord(franchise, teamRow);
  const target = editedPathFor(savePath);
  return {
    school: String(val(rec, 'DisplayName') ?? ''),
    level: Number(val(rec, 'FacilitiesLevel')) || 0,
    levelMax: Math.min(fieldMax(rec, 'FacilitiesLevel', 4), FACILITY_LEVELS.length - 1),
    renewReserved: Number(val(rec, 'FacilitiesRenewalCostReserved')) || 0,
    levels: FACILITY_LEVELS.map((l) => ({
      level: l.level,
      name: l.name,
      desc: l.desc,
      cost: l.cost,
      renewCost: l.renewCost,
      slotCap: l.slotCap,
      bestGrade: l.bestGrade,
      worstGrade: l.worstGrade
    })),
    equipment: await ownedEquipment(franchise, rec),
    grade: await currentGrade(franchise, rec),
    targetFileName: basename(target),
    targetExists: existsSync(target)
  };
}

export async function applyFacilitiesEdit(
  franchise: any,
  savePath: string,
  req: { teamRow: number } & FacilitiesChanges,
  backupDir: string
): Promise<{ editedPath: string }> {
  const rec = await teamRecord(franchise, req.teamRow);
  const max = Math.min(fieldMax(rec, 'FacilitiesLevel', 4), FACILITY_LEVELS.length - 1);
  const def = FACILITY_LEVELS.find((l) => l.level === req.level);
  if (!Number.isInteger(req.level) || req.level < 0 || req.level > max || !def) {
    throw new Error(`Facility level runs 0–${max}.`);
  }
  if (req.level === Number(val(rec, 'FacilitiesLevel'))) throw new Error('That is already the facility level.');
  // The game's slot cap: a lower level cannot hold more equipment than it allows.
  const owned = await ownedEquipment(franchise, rec);
  if (owned.length > def.slotCap) {
    throw new Error(
      `${def.name} allows ${def.slotCap} equipment slot${def.slotCap === 1 ? '' : 's'} and this school owns ${owned.length} — sell equipment in the game first.`
    );
  }
  const reserve = Math.min(def.renewCost, fieldMax(rec, 'FacilitiesRenewalCostReserved', 10000));

  rec.FacilitiesLevel = req.level;
  rec.FacilitiesRenewalCostReserved = reserve;

  return writeEditedSave(franchise, savePath, backupDir, async (check) => {
    const w = await teamRecord(check, req.teamRow);
    if (Number(val(w, 'FacilitiesLevel')) !== req.level || Number(val(w, 'FacilitiesRenewalCostReserved')) !== reserve) {
      throw new Error('The written save did not read back with the new facility level.');
    }
  });
}
