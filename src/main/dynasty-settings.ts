/**
 * Dynasty settings editor: the game's gameplay, XP and league sliders as the
 * save stores them, and the write that applies changes. Same posture as the
 * other editors — every value validated against the schema (range, boolean,
 * enum member), one write to the <save>_RJ sibling through writeEditedSave,
 * verified on a cold reload.
 *
 * Tables (RESEARCH "Dynasty settings"): SkillSlider (row 0 CPU, row 1 Player)
 * and SpecialTeamSlider (same rows), GameOptionSlider (the row
 * LeagueSetting.GameOptionSlider points at), PenaltySlider and
 * ProgressionXPSlider (one row each), LeagueSetting (the live row) and the
 * user's TeamSetting row (Team.TeamSettingRef). Labels are the game's own
 * strings where its settings screens name the field; the rest are the field
 * names spaced out.
 *
 * Deliberately held back: QuarterLength (set in-game by the player, mechanism
 * unresolved), CoachStartingLevel (reads below its schema minimum), the two
 * settings the game locks after creation (shown read-only), and every
 * *Description / DefaultValue field.
 */
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import type {
  DynastySettingsChanges,
  DynastySettingsForm,
  SettingField,
  SettingsGroup,
  SettingsSection
} from '../shared/types.ts';
import { editedPathFor, enumMembers, writeEditedSave } from './editor.ts';
import { isNullRef, mainTable, refFromRecord, tableById, tablesByName, val } from './parser/franchise.ts';

type TableKey = 'skill' | 'st' | 'gameopt' | 'penalty' | 'xp' | 'league' | 'team';

interface FieldSpec {
  field: string;
  label: string;
  locked?: boolean;
  note?: string;
}

interface SectionSpec {
  title: string;
  note?: string;
  parts: { table: TableKey; row: number; fields: FieldSpec[] }[];
}

const SKILL_FIELDS: FieldSpec[] = [
  { field: 'QBAccuracy', label: 'QB Accuracy' },
  { field: 'PassBlocking', label: 'Pass Blocking' },
  { field: 'WRCatching', label: 'WR Catching' },
  { field: 'RunBlocking', label: 'Run Blocking' },
  { field: 'Fumbles', label: 'Ball Security' },
  { field: 'PassDefenseReactionTime', label: 'Pass Defense Reaction Time' },
  { field: 'Interceptions', label: 'Interceptions' },
  { field: 'PassCoverage', label: 'Pass Coverage' },
  { field: 'Tackling', label: 'Tackling' }
];
const ST_FIELDS: FieldSpec[] = [
  { field: 'FGPower', label: 'FG Power' },
  { field: 'FGAccuracy', label: 'FG Accuracy' },
  { field: 'PuntPower', label: 'Punt Power' },
  { field: 'PuntAccuracy', label: 'Punt Accuracy' },
  { field: 'KickoffPower', label: 'Kickoff Power' }
];
const XP_POSITIONS = ['QB', 'HB', 'FB', 'WR', 'TE', 'T', 'G', 'C', 'DE', 'DT', 'OLB', 'MLB', 'CB', 'FS', 'SS', 'K', 'P', 'LS'];

const LOCKED_NOTE = 'This setting cannot be modified once your Dynasty has started.';

const league = (fields: FieldSpec[]) => ({ table: 'league' as TableKey, row: 0, fields });

const GAMEPLAY: SectionSpec[] = [
  {
    title: 'Player Skill',
    parts: [
      { table: 'skill', row: 1, fields: SKILL_FIELDS },
      { table: 'st', row: 1, fields: ST_FIELDS }
    ]
  },
  {
    title: 'CPU Skill',
    parts: [
      { table: 'skill', row: 0, fields: SKILL_FIELDS },
      { table: 'st', row: 0, fields: ST_FIELDS }
    ]
  },
  {
    title: 'Game Options',
    parts: [
      league([
        { field: 'SkillLevel', label: 'Skill Level' },
        { field: 'GameStyle', label: 'Game Style' },
        { field: 'QuarterLength', label: 'Quarter Length', locked: true, note: 'Set in-game by the player.' },
        { field: 'IsPlayClockEnabled', label: 'Play Clock' },
        { field: 'IsAcceleratedClockEnabled', label: 'Accelerated Clock' },
        { field: 'MinPlayClock', label: 'Minimum Play Clock Time' },
        { field: 'IsInjuryEnabled', label: 'Injuries' },
        { field: 'IsSuperstarAbilitiesEnabled', label: 'Superstar Abilities' }
      ]),
      {
        table: 'gameopt',
        row: 0,
        fields: [
          { field: 'Injuries', label: 'Injury Frequency' },
          { field: 'Fatigue', label: 'Fatigue' },
          { field: 'MinPlayerSpeedThreshold', label: 'Player Speed Parity Scale' }
        ]
      }
    ]
  },
  {
    title: 'Penalties',
    parts: [
      {
        table: 'penalty',
        row: 0,
        fields: [
          { field: 'Offside', label: 'Offside' },
          { field: 'FalseStart', label: 'False Start' },
          { field: 'Holding', label: 'Offensive Holding' },
          { field: 'DefensiveHolding', label: 'Defensive Holding' },
          { field: 'FaceMask', label: 'Facemask' },
          { field: 'DefensivePassInterference', label: 'Defensive Pass Interference' },
          { field: 'RoughingPasser', label: 'Roughing the Passer' },
          { field: 'Clipping', label: 'Illegal Block in the Back' },
          { field: 'IllegalContact', label: 'Illegal Contact' },
          { field: 'IntentionalGrounding', label: 'Intentional Grounding' },
          { field: 'OffensivePassInterference', label: 'Offensive Pass Interference' },
          { field: 'PuntCatchInterference', label: 'Kick Catch Interference' },
          { field: 'RoughingKicker', label: 'Roughing the Kicker' },
          { field: 'RunningIntoKicker', label: 'Running into the Kicker' }
        ]
      }
    ]
  },
  {
    title: 'Tackle Mechanics',
    parts: [
      league([
        { field: 'TackleImpactScaling', label: 'Normal Tackle Impact' },
        { field: 'CatchTackleScaling', label: 'Catch Tackle Impact' },
        { field: 'HitStickImpact', label: 'Hit Stick Impact' },
        { field: 'CutStickImpact', label: 'Cut Stick Impact' },
        { field: 'SizeDifferentialImpact', label: 'Defender Tackle Advantage Impact' },
        { field: 'SackScaling', label: 'Sack Impact' },
        { field: 'BlockScaling', label: 'Block Impact' },
        { field: 'ImpactBlockScaling', label: 'Impact Block Impact' }
      ])
    ]
  },
  {
    title: 'Wear and Tear',
    parts: [
      league([
        { field: 'IsWearAndTearEnabled', label: 'Wear and Tear' },
        { field: 'IsProgressiveFatigueEnabled', label: 'Progressive Fatigue' },
        { field: 'PerPlayRecovery', label: 'Per-Play Recovery' },
        { field: 'TimeOutRecovery', label: 'Per-Timeout Recovery' },
        { field: 'EndOfQuarterRecovery', label: 'Between-Quarter Recovery' },
        { field: 'HalftimeRecovery', label: 'Halftime Recovery' },
        { field: 'RecoveryPoolBasedOnQuarterLength', label: 'In-Game Healing Reserve Pool' },
        { field: 'WeekToWeekRecovery', label: 'Week to Week Recovery' }
      ])
    ]
  },
  {
    title: 'Precipitation',
    parts: [
      league([
        { field: 'PrecipitationLocomotionPenaltyScaling', label: 'Precipitation Movement Penalties' },
        { field: 'PrecipitationSlipScaling', label: 'Precipitation Slip Scale' },
        { field: 'PrecipitationBrokenTackleScaling', label: 'Precipitation Broken Tackle Scale' },
        { field: 'PrecipitationCatchChanceScaling', label: 'Precipitation Catch Chance Scale' },
        { field: 'PrecipitationPassAccuracyScaling', label: 'Precipitation Pass Accuracy Scale' },
        { field: 'PrecipitationPassStrengthScaling', label: 'Precipitation Pass Strength Scale' },
        { field: 'PrecipitationKickingAccuracyScaling', label: 'Precipitation Kicking Accuracy Scale' },
        { field: 'PrecipitationKickingStrengthScaling', label: 'Precipitation Kicking Strength Scale' }
      ])
    ]
  },
  {
    title: 'Coach Mode',
    parts: [
      league([
        { field: 'IsCoachModeEnabled', label: 'Coach Mode Enabled' },
        { field: 'IsCoachModeAutopassEnabled', label: 'Auto Quarterback' },
        { field: 'IsCoachModeAutosnapEnabled', label: 'Auto Snap' },
        { field: 'IsCoachModeSuggestionsEnabled', label: 'Coach Suggestions Enabled' },
        { field: 'IsCoachModePreplayCutoffEnabled', label: 'Preplay Cutoff Enabled' }
      ])
    ]
  }
];

const XP: SectionSpec[] = [
  {
    title: 'Position XP',
    note: 'Scales the XP each position earns; 100 is the game default, 300 triples it.',
    parts: [{ table: 'xp', row: 0, fields: XP_POSITIONS.map((p) => ({ field: p, label: `${p} XP %` })) }]
  },
  {
    title: 'Progression',
    parts: [
      league([
        { field: 'ManualProgressionXPPenalty', label: 'Manual Progression XP Penalty %' },
        { field: 'CPUProgressionFrequency', label: 'CPU Progression Frequency' },
        { field: 'CPUTalentProgressionFrequency', label: 'CPU Talent Progression Frequency' },
        { field: 'CoachXPSpeedSetting', label: 'Coach XP Speed Setting' },
        { field: 'TalentProgressSpeed', label: 'Talent Progress Speed' },
        { field: 'IsAllowCoachRespecEnabled', label: 'Allow Coach Respec' },
        { field: 'IsAllowCoordinatorRespecEnabled', label: 'Allow Coordinator Respec' }
      ])
    ]
  }
];

const LEAGUE: SectionSpec[] = [
  {
    title: 'Coaches',
    parts: [
      league([
        { field: 'CoachFiring', label: 'Coach Firing' },
        { field: 'IsCoachLevelsPurchaseEnabled', label: 'Coach Level Purchases', locked: true, note: LOCKED_NOTE },
        { field: 'IsEntitlementAwardEnabled', label: 'Pre-Order & Membership Bonuses', locked: true, note: LOCKED_NOTE }
      ])
    ]
  },
  {
    title: 'Rosters & Transfers',
    parts: [
      league([
        { field: 'MinRosterSize', label: 'Minimum Roster Size' },
        { field: 'PlayerMovementLimit', label: 'In-Season Player Movement Limit' },
        { field: 'PlayerOVRCutRestriction', label: 'Player OVR Cut Restrictions' },
        { field: 'OffSeasonPlayerCutLimit', label: 'OffSeason Player Cut Limit' },
        { field: 'MaxTransfersPerTeam', label: 'Max Transfers Per Team' },
        { field: 'UserPlayerTransferChance', label: 'User Player Transfer Chance' },
        { field: 'CPUPlayerTransferChance', label: 'CPU Player Transfer Chance' }
      ])
    ]
  },
  {
    title: 'Recruiting',
    parts: [
      league([
        { field: 'IsRecruitFlippingEnabled', label: 'Recruit Flipping' },
        { field: 'SoftCommitInfluenceBonus', label: 'Verbal Commit Influence %' }
      ])
    ]
  },
  {
    title: 'Injuries',
    parts: [
      league([
        { field: 'IsSimInjuryEnabled', label: 'Sim Injury' },
        { field: 'IsPracticeInjuryEnabled', label: 'Practice Injury' }
      ])
    ]
  },
  {
    title: 'Play Calling',
    parts: [
      league([
        { field: 'PlayCallCooldown', label: 'Playcall Cooldown' },
        { field: 'PlayCallLimit', label: 'Playcall Limit' },
        { field: 'PlayerPlaycallPermission', label: 'Player Playcall Permission' },
        { field: 'AbilityEditControls', label: 'Ability Edit Controls' }
      ])
    ]
  },
  {
    title: 'Your Program',
    note: "Your school's own season settings.",
    parts: [
      {
        table: 'team',
        row: 0,
        fields: [
          { field: 'SeasonExperience', label: 'Season Experience' },
          { field: 'IsCPUProgressPlayersEnabled', label: 'Auto Progress Players' },
          { field: 'IsCPUProgressTalentsEnabled', label: 'User Coach Auto-Progression' },
          { field: 'IsWeeklyTrainingEnabled', label: 'Weekly Training' },
          { field: 'IsScoutCollegePlayersEnabled', label: 'Scout College Players' },
          { field: 'IsInjuryManagementEnabled', label: 'Injury Management' },
          { field: 'IsCPUCutPlayersEnabled', label: 'Preseason Cut Days' },
          { field: 'IsManualAdvancementEnabled', label: 'League Advancement' },
          { field: 'IsCPUDraftPlayersEnabled', label: 'Draft Players' },
          { field: 'IsTutorialPopupEnabled', label: 'Tutorial Pop-ups' },
          { field: 'IsPodcastEnabled', label: 'Podcast' },
          { field: 'IsBreakingNewsEnabled', label: 'Breaking News' },
          { field: 'IsManagePracticeRepsEnabled', label: 'Manage Practice Reps' },
          { field: 'IsAIAssistManageOverallBudgetEnabled', label: 'CPU Manage Overall Budget' },
          { field: 'IsAIAssistManageSupportStaffEnabled', label: 'CPU Manage Support Staff' },
          { field: 'IsAIAssistManageFacilitiesSpendingEnabled', label: 'CPU Manage Facilities Spending' },
          { field: 'RecruitingBoardAssistance', label: 'Recruiting Board Assistance' },
          { field: 'LocksmithAssistance', label: 'Locksmith Assistance' },
          { field: 'ScholarshipOfferAssistance', label: 'Scholarship Offer Assistance' },
          { field: 'VisitAssistance', label: 'Visit Assistance' }
        ]
      }
    ]
  }
];

const GROUPS: { key: SettingsGroup['key']; title: string; sections: SectionSpec[] }[] = [
  { key: 'gameplay', title: 'Gameplay', sections: GAMEPLAY },
  { key: 'xp', title: 'XP', sections: XP },
  { key: 'league', title: 'League', sections: LEAGUE }
];

/** Enum members that are bookkeeping, not choices. */
const PSEUDO_MEMBERS = new Set(['COUNT', 'Count', 'MAX', 'Yard']);

const OPTION_LABELS: Record<string, string> = {
  ALL_AMERICAN: 'All-American',
  CPU_ONLY: 'CPU Only',
  EVERY_FOUR_WEEKS: 'Every four weeks',
  END_OF_SEASON: 'End of season',
  FULL_CONTROL: 'Full Control',
  COMMISHONLY: 'Commissioner only',
  ANY_PLAYER: 'Any player',
  NO_PLAYER: 'No player',
  ACCELERATEDCLOCK_OFF: 'Off',
  MINIMUM_ROSTER_SIZE_OFF: 'Off',
  PLAYER_CUT_LIMIT_UNLIMITED: 'Unlimited',
  PLAYER_MOVE_LIMIT_UNLIMITED: 'Unlimited',
  PLAYER_CUT_RESTRICTION_OFF: 'Off'
};

function optionLabel(member: string): string {
  if (OPTION_LABELS[member]) return OPTION_LABELS[member];
  let s = member.replace(/^(ACCELERATEDCLOCK_|MINIMUM_ROSTER_SIZE_|PLAYER_CUT_LIMIT_|PLAYER_MOVE_LIMIT_|PLAYER_CUT_RESTRICTION_)/, '');
  s = s.replace(/_SEC$/, ' sec').replace(/_/g, ' ');
  if (/^[A-Z0-9 ]+$/.test(s) && /[A-Z]/.test(s)) s = s.charAt(0) + s.slice(1).toLowerCase();
  return s;
}

type Tables = Map<TableKey, { table: any; rows: number[] }>;

/** All the setting tables, read fresh (they are tiny) and keyed for the specs. */
async function settingTables(franchise: any, teamRow: number): Promise<Tables> {
  const out: Tables = new Map();
  const byName = async (name: string): Promise<any> => {
    const table = tablesByName(franchise, name).find((t) => (t.header?.recordCapacity ?? 0) > 0);
    if (!table) return null;
    await table.readRecords();
    return table;
  };
  const liveRows = (table: any): number[] =>
    (table?.records ?? []).map((r: any, i: number) => (r.isEmpty ? -1 : i)).filter((i: number) => i >= 0);

  const leagueT = await byName('LeagueSetting');
  if (!leagueT || !liveRows(leagueT).length) throw new Error('This save carries no league settings row.');
  out.set('league', { table: leagueT, rows: [liveRows(leagueT)[0]] });
  const leagueRec = leagueT.records[liveRows(leagueT)[0]];

  const skill = await byName('SkillSlider');
  if (skill) out.set('skill', { table: skill, rows: liveRows(skill) });
  const st = await byName('SpecialTeamSlider');
  if (st) out.set('st', { table: st, rows: liveRows(st) });
  const penalty = await byName('PenaltySlider');
  if (penalty) out.set('penalty', { table: penalty, rows: liveRows(penalty).slice(0, 1) });
  const xp = await byName('ProgressionXPSlider');
  if (xp) out.set('xp', { table: xp, rows: liveRows(xp).slice(0, 1) });

  // The league's own game-options row, by reference rather than by index.
  const goRef = refFromRecord(leagueRec, 'GameOptionSlider');
  if (!isNullRef(goRef)) {
    const go = await tableById(franchise, goRef.tableId);
    if (go) {
      if (!go.recordsRead) await go.readRecords();
      out.set('gameopt', { table: go, rows: [goRef.row] });
    }
  }

  // The user's TeamSetting row.
  const teamTable = mainTable(franchise, 'Team');
  await teamTable.readRecords(['TeamSettingRef']);
  const tsRef = refFromRecord(teamTable.records?.[teamRow], 'TeamSettingRef');
  if (!isNullRef(tsRef)) {
    const ts = await tableById(franchise, tsRef.tableId);
    if (ts) {
      if (!ts.recordsRead) await ts.readRecords();
      out.set('team', { table: ts, rows: [tsRef.row] });
    }
  }
  return out;
}

function fieldKind(rec: any, field: string): SettingField['kind'] | null {
  const f = rec?._fields?.[field];
  if (!f) return null;
  if (f.offset?.enum) return 'enum';
  const v = val(rec, field);
  if (f.offset?.type === 'bool' || typeof v === 'boolean') return 'bool';
  return 'int';
}

function intRange(rec: any, field: string): { min: number; max: number } {
  const off = rec._fields[field].offset ?? {};
  const min = Number.isFinite(Number(off.minValue)) ? Number(off.minValue) : 0;
  const max = Number.isFinite(Number(off.maxValue)) && Number(off.maxValue) > 0 ? Number(off.maxValue) : 100;
  return { min, max };
}

function enumValue(rec: any, field: string, member: string): number | null {
  const m = enumMembers(rec, field).find((x) => x.name === member);
  return m ? m.value : null;
}

/** Resolve a spec part to its record, or null when the save lacks the table/row. */
function partRecord(tables: Tables, key: TableKey, row: number): { rec: any; rowIndex: number } | null {
  const t = tables.get(key);
  const rowIndex = t?.rows[row];
  if (rowIndex === undefined) return null;
  const rec = t!.table.records?.[rowIndex];
  return rec && !rec.isEmpty ? { rec, rowIndex } : null;
}

function fieldEntry(rec: any, rowIndex: number, key: TableKey, spec: FieldSpec): SettingField | null {
  const kind = fieldKind(rec, spec.field);
  if (!kind) return null;
  const raw = val(rec, spec.field);
  const entry: SettingField = {
    id: `${key}:${rowIndex}:${spec.field}`,
    label: spec.label,
    kind,
    value: kind === 'bool' ? raw === true : kind === 'enum' ? String(raw ?? '') : Number(raw) || 0
  };
  if (kind === 'int') Object.assign(entry, intRange(rec, spec.field));
  if (kind === 'enum') {
    entry.options = enumMembers(rec, spec.field)
      .filter((m) => !PSEUDO_MEMBERS.has(m.name))
      .map((m) => ({ id: m.name, name: optionLabel(m.name) }));
    // The live value may read back under an alias of the same number.
    const cur = enumValue(rec, spec.field, String(raw ?? ''));
    const canon = entry.options.find((o) => enumValue(rec, spec.field, o.id) === cur);
    if (canon) entry.value = canon.id;
  }
  if (spec.locked) entry.locked = true;
  if (spec.note) entry.note = spec.note;
  return entry;
}

export async function buildDynastySettingsForm(franchise: any, teamRow: number, savePath: string): Promise<DynastySettingsForm> {
  const tables = await settingTables(franchise, teamRow);
  const groups: SettingsGroup[] = GROUPS.map((g) => ({
    key: g.key,
    title: g.title,
    sections: g.sections
      .map((s): SettingsSection => {
        const fields: SettingField[] = [];
        for (const part of s.parts) {
          const hit = partRecord(tables, part.table, part.row);
          if (!hit) continue;
          for (const spec of part.fields) {
            const e = fieldEntry(hit.rec, hit.rowIndex, part.table, spec);
            if (e) fields.push(e);
          }
        }
        return { title: s.title, note: s.note, fields };
      })
      .filter((s) => s.fields.length)
  }));
  const target = editedPathFor(savePath);
  return { groups, targetFileName: basename(target), targetExists: existsSync(target) };
}

/** The editable ids and their specs, from the same tables the form reads. */
function editableIndex(tables: Tables): Map<string, { rec: any; spec: FieldSpec }> {
  const out = new Map<string, { rec: any; spec: FieldSpec }>();
  for (const g of GROUPS) {
    for (const s of g.sections) {
      for (const part of s.parts) {
        const hit = partRecord(tables, part.table, part.row);
        if (!hit) continue;
        for (const spec of part.fields) {
          if (!hit.rec._fields?.[spec.field]) continue;
          out.set(`${part.table}:${hit.rowIndex}:${spec.field}`, { rec: hit.rec, spec });
        }
      }
    }
  }
  return out;
}

export async function applyDynastySettings(
  franchise: any,
  savePath: string,
  req: { teamRow: number } & DynastySettingsChanges,
  backupDir: string
): Promise<{ editedPath: string; changed: number }> {
  const tables = await settingTables(franchise, req.teamRow);
  const index = editableIndex(tables);
  const entries = Object.entries(req.values ?? {});
  if (!entries.length) throw new Error('Nothing to change.');

  // ---- validate everything first ----
  const plan: { rec: any; field: string; value: number | boolean | string }[] = [];
  for (const [id, value] of entries) {
    const hit = index.get(id);
    if (!hit) throw new Error(`Unknown setting: ${id}`);
    if (hit.spec.locked) throw new Error(`${hit.spec.label} is read-only.`);
    const kind = fieldKind(hit.rec, hit.spec.field)!;
    if (kind === 'bool') {
      if (typeof value !== 'boolean') throw new Error(`${hit.spec.label} must be on or off.`);
    } else if (kind === 'enum') {
      const ok = typeof value === 'string' && !PSEUDO_MEMBERS.has(value) && enumValue(hit.rec, hit.spec.field, value) !== null;
      if (!ok) throw new Error(`${hit.spec.label}: unknown option ${String(value)}.`);
    } else {
      const { min, max } = intRange(hit.rec, hit.spec.field);
      if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
        throw new Error(`${hit.spec.label} must be ${min}–${max}.`);
      }
    }
    plan.push({ rec: hit.rec, field: hit.spec.field, value });
  }

  // ---- apply ----
  for (const p of plan) p.rec[p.field] = p.value;

  const written = await writeEditedSave(franchise, savePath, backupDir, async (check) => {
    const wIndex = editableIndex(await settingTables(check, req.teamRow));
    for (const [id, value] of entries) {
      const hit = wIndex.get(id);
      if (!hit) throw new Error('The written save did not read back with the settings.');
      const got = val(hit.rec, hit.spec.field);
      const kind = fieldKind(hit.rec, hit.spec.field);
      const same =
        kind === 'enum'
          ? enumValue(hit.rec, hit.spec.field, String(got ?? '')) === enumValue(hit.rec, hit.spec.field, String(value))
          : kind === 'bool'
            ? (got === true) === value
            : Number(got) === value;
      if (!same) throw new Error(`The written save did not read back with ${hit.spec.label}.`);
    }
  });
  return { ...written, changed: plan.length };
}
