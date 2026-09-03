/**
 * Program grades editor: the form behind the Program Dashboard's EDIT control
 * and the write that applies it. Same posture as the player editor — whole
 * payload validation, then one write to the <save>_RJ sibling through
 * writeEditedSave, verified on a cold reload.
 *
 * The letters live on the school's MySchoolTrackingTable row as LetterGrade
 * members (Aplus … F, plus Incomplete, which is never written). The game
 * recomputes them on its own cadence (RESEARCH "Program grades"): two are
 * static, six refresh every week, two at the offseason — the form carries the
 * lifetime so the dialog can say how long a written letter survives.
 * TeamPrestige is the star rating (0–10 in half-star steps), re-derived each
 * offseason from the weighted letters.
 */
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import type { GradeLifetime, GradesEditChanges, GradesEditForm } from '../shared/types.ts';
import { editedPathFor, enumMembers, fieldMax, writeEditedSave } from './editor.ts';
import { isNullRef, mainTable, refFromRecord, tableById, val } from './parser/franchise.ts';

const TEAM_FIELDS = ['DisplayName', 'TeamPrestige', 'PrestigeRank', 'MySchoolTrackingTable'];

/** Dashboard order, with the game's own recompute cadence per grade. */
const GRADE_FIELDS: { field: string; label: string; lifetime: GradeLifetime }[] = [
  { field: 'AcademicPrestigeGrade', label: 'Academic Prestige', lifetime: 'Permanent' },
  { field: 'AthleticFacilitiesGrade', label: 'Athletic Facilities', lifetime: 'Until next week' },
  { field: 'BrandExposureGrade', label: 'Brand Exposure', lifetime: 'Until next week' },
  { field: 'CampusLifestyleGrade', label: 'Campus Lifestyle', lifetime: 'Permanent' },
  { field: 'ChampionshipContenderGrade', label: 'Championship Contender', lifetime: 'Until next week' },
  { field: 'CoachPrestigeGrade', label: 'Coach Prestige', lifetime: 'Until offseason' },
  { field: 'CoachStabilityGrade', label: 'Coach Stability', lifetime: 'Until next week' },
  { field: 'ConferencePrestigeGrade', label: 'Conference Prestige', lifetime: 'Until offseason' },
  { field: 'ProgramTraditionGrade', label: 'Program Tradition', lifetime: 'Until next week' },
  { field: 'StadiumAtmosphereGrade', label: 'Stadium Atmosphere', lifetime: 'Until next week' }
];

async function teamAndTrack(franchise: any, teamRow: number): Promise<{ team: any; track: any }> {
  const teamTable = mainTable(franchise, 'Team');
  await teamTable.readRecords(TEAM_FIELDS);
  const team = teamTable.records?.[teamRow];
  if (!team || team.isEmpty) throw new Error('No school at that row in the save.');
  const ref = refFromRecord(team, 'MySchoolTrackingTable');
  // FCS filler schools carry no tracking row — nothing to grade.
  if (isNullRef(ref)) throw new Error('The game keeps no program grades for this school.');
  const table = await tableById(franchise, ref.tableId);
  const track = table?.records?.[ref.row];
  if (!track || track.isEmpty) throw new Error('The program grade row is missing from the save.');
  return { team, track };
}

/** Aplus … F. The schema's Incomplete shares its number with a COUNT sentinel; neither is a letter. */
function letterOptions(track: any): string[] {
  return enumMembers(track, GRADE_FIELDS[0].field)
    .filter((m) => m.name !== 'Incomplete' && m.name !== 'COUNT')
    .sort((a, b) => a.value - b.value)
    .map((m) => m.name);
}

export async function buildGradesForm(franchise: any, teamRow: number, savePath: string): Promise<GradesEditForm> {
  const { team, track } = await teamAndTrack(franchise, teamRow);
  const target = editedPathFor(savePath);
  return {
    school: String(val(team, 'DisplayName') ?? ''),
    grades: GRADE_FIELDS.filter((g) => track._fields?.[g.field]).map((g) => ({
      field: g.field,
      label: g.label,
      grade: String(val(track, g.field) ?? 'Incomplete'),
      lifetime: g.lifetime
    })),
    gradeOptions: letterOptions(track),
    prestige: Number(val(team, 'TeamPrestige')) || 0,
    prestigeMax: fieldMax(team, 'TeamPrestige', 10),
    prestigeRank: Number(val(team, 'PrestigeRank')) || 0,
    targetFileName: basename(target),
    targetExists: existsSync(target)
  };
}

export async function applyGradesEdit(
  franchise: any,
  savePath: string,
  req: { teamRow: number } & GradesEditChanges,
  backupDir: string
): Promise<{ editedPath: string }> {
  const { team, track } = await teamAndTrack(franchise, req.teamRow);
  const known = new Set(GRADE_FIELDS.map((g) => g.field));
  const letters = new Set(letterOptions(track));
  const grades = Object.entries(req.grades ?? {});
  for (const [field, letter] of grades) {
    if (!known.has(field) || !track._fields?.[field]) throw new Error(`Unknown grade: ${field}`);
    if (!letters.has(letter)) throw new Error(`Unknown letter for ${field}: ${letter}`);
  }
  const prestigeMax = fieldMax(team, 'TeamPrestige', 10);
  if (req.prestige !== undefined) {
    if (!Number.isInteger(req.prestige) || req.prestige < 0 || req.prestige > prestigeMax) {
      throw new Error(`Prestige runs 0–${prestigeMax} (half stars).`);
    }
  }
  if (!grades.length && req.prestige === undefined) throw new Error('Nothing to change.');

  for (const [field, letter] of grades) track[field] = letter;
  if (req.prestige !== undefined) team.TeamPrestige = req.prestige;

  return writeEditedSave(franchise, savePath, backupDir, async (check) => {
    const { team: wTeam, track: wTrack } = await teamAndTrack(check, req.teamRow);
    for (const [field, letter] of grades) {
      if (String(val(wTrack, field)) !== letter) {
        throw new Error('The written save did not read back with the new grades.');
      }
    }
    if (req.prestige !== undefined && Number(val(wTeam, 'TeamPrestige')) !== req.prestige) {
      throw new Error('The written save did not read back with the new prestige.');
    }
  });
}
