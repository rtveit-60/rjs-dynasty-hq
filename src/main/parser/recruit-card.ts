/**
 * On-demand detail for a single recruit. Kept out of the snapshot because the
 * class runs to several thousand players and each carries 59 rating fields —
 * far too much to serialise on every save write.
 */
import type { AbilitySlot, RecruitCard } from '../../shared/types.ts';
import { PHYSICAL_ABILITY_SLOTS } from '../../shared/physical-abilities.ts';
import { mainTable, val } from './franchise.ts';

/** Ratings worth showing, per position group. Order is the display order. */
export const COMMON: [string, string][] = [
  ['SpeedRating', 'SPD'],
  ['AccelerationRating', 'ACC'],
  ['AgilityRating', 'AGI'],
  ['StrengthRating', 'STR'],
  ['AwarenessRating', 'AWR'],
  ['StaminaRating', 'STA'],
  ['InjuryRating', 'INJ'],
  ['ToughnessRating', 'TGH']
];

export const BY_GROUP: Record<string, [string, string][]> = {
  QB: [
    ['ThrowPowerRating', 'THP'],
    ['ThrowAccuracyShortRating', 'SAC'],
    ['ThrowAccuracyMidRating', 'MAC'],
    ['ThrowAccuracyDeepRating', 'DAC'],
    ['ThrowOnTheRunRating', 'RUN'],
    ['ThrowUnderPressureRating', 'TUP'],
    ['PlayActionRating', 'PAC'],
    ['BreakSackRating', 'BSK']
  ],
  BACK: [
    ['CarryingRating', 'CAR'],
    ['BreakTackleRating', 'BTK'],
    ['TruckingRating', 'TRK'],
    ['JukeMoveRating', 'JKM'],
    ['SpinMoveRating', 'SPM'],
    ['StiffArmRating', 'SFA'],
    ['BCVisionRating', 'BCV'],
    ['CatchingRating', 'CTH']
  ],
  RECV: [
    ['CatchingRating', 'CTH'],
    ['CatchInTrafficRating', 'CIT'],
    ['SpectacularCatchRating', 'SPC'],
    ['ShortRouteRunningRating', 'SRR'],
    ['MediumRouteRunningRating', 'MRR'],
    ['DeepRouteRunningRating', 'DRR'],
    ['ReleaseRating', 'RLS'],
    ['JumpingRating', 'JMP']
  ],
  OL: [
    ['RunBlockRating', 'RBK'],
    ['RunBlockPowerRating', 'RBP'],
    ['RunBlockFinesseRating', 'RBF'],
    ['PassBlockRating', 'PBK'],
    ['PassBlockPowerRating', 'PBP'],
    ['PassBlockFinesseRating', 'PBF'],
    ['ImpactBlockingRating', 'IBL'],
    ['LeadBlockRating', 'LBK']
  ],
  DL: [
    ['BlockSheddingRating', 'BSH'],
    ['PowerMovesRating', 'PMV'],
    ['FinesseMovesRating', 'FMV'],
    ['TackleRating', 'TAK'],
    ['HitPowerRating', 'POW'],
    ['PursuitRating', 'PUR'],
    ['PlayRecognitionRating', 'PRC'],
    ['JumpingRating', 'JMP']
  ],
  LB: [
    ['TackleRating', 'TAK'],
    ['HitPowerRating', 'POW'],
    ['BlockSheddingRating', 'BSH'],
    ['PursuitRating', 'PUR'],
    ['PlayRecognitionRating', 'PRC'],
    ['ZoneCoverageRating', 'ZCV'],
    ['ManCoverageRating', 'MCV'],
    ['PowerMovesRating', 'PMV']
  ],
  DB: [
    ['ManCoverageRating', 'MCV'],
    ['ZoneCoverageRating', 'ZCV'],
    ['PressRating', 'PRS'],
    ['PlayRecognitionRating', 'PRC'],
    ['CatchingRating', 'CTH'],
    ['JumpingRating', 'JMP'],
    ['TackleRating', 'TAK'],
    ['PursuitRating', 'PUR']
  ],
  ST: [
    ['KickPowerRating', 'KPW'],
    ['KickAccuracyRating', 'KAC'],
    ['KickReturnRating', 'KRT'],
    ['LongSnapRating', 'LSN']
  ]
};

export const GROUP_OF: Record<string, string> = {
  QB: 'QB',
  HB: 'BACK', FB: 'BACK', RB: 'BACK',
  WR: 'RECV', TE: 'RECV',
  LT: 'OL', LG: 'OL', C: 'OL', RG: 'OL', RT: 'OL', OL: 'OL',
  LE: 'DL', RE: 'DL', DT: 'DL', DL: 'DL', EDGE: 'DL',
  LOLB: 'LB', MLB: 'LB', ROLB: 'LB', LB: 'LB',
  CB: 'DB', FS: 'DB', SS: 'DB', S: 'DB', DB: 'DB',
  K: 'ST', P: 'ST'
};

/**
 * The at-a-glance cut: the skills a position lives on, shown highlighted when
 * a board row expands. Tight editorial pick per role — the full sheet stays in
 * the profile. TE splits from WR here because blocking matters to one of them.
 */
export const GLANCE: Record<string, [string, string][]> = {
  QB: [
    ['ThrowPowerRating', 'THP'],
    ['ThrowAccuracyShortRating', 'SAC'],
    ['ThrowAccuracyMidRating', 'MAC'],
    ['ThrowAccuracyDeepRating', 'DAC'],
    ['ThrowUnderPressureRating', 'TUP'],
    ['ThrowOnTheRunRating', 'RUN'],
    ['SpeedRating', 'SPD'],
    ['AwarenessRating', 'AWR']
  ],
  BACK: [
    ['SpeedRating', 'SPD'],
    ['AccelerationRating', 'ACC'],
    ['AgilityRating', 'AGI'],
    ['CarryingRating', 'CAR'],
    ['BreakTackleRating', 'BTK'],
    ['TruckingRating', 'TRK'],
    ['JukeMoveRating', 'JKM'],
    ['BCVisionRating', 'BCV'],
    ['CatchingRating', 'CTH']
  ],
  RECV: [
    ['SpeedRating', 'SPD'],
    ['AccelerationRating', 'ACC'],
    ['CatchingRating', 'CTH'],
    ['ShortRouteRunningRating', 'SRR'],
    ['MediumRouteRunningRating', 'MRR'],
    ['DeepRouteRunningRating', 'DRR'],
    ['CatchInTrafficRating', 'CIT'],
    ['SpectacularCatchRating', 'SPC'],
    ['ReleaseRating', 'RLS']
  ],
  TE: [
    ['SpeedRating', 'SPD'],
    ['CatchingRating', 'CTH'],
    ['ShortRouteRunningRating', 'SRR'],
    ['MediumRouteRunningRating', 'MRR'],
    ['CatchInTrafficRating', 'CIT'],
    ['SpectacularCatchRating', 'SPC'],
    ['RunBlockRating', 'RBK'],
    ['ImpactBlockingRating', 'IBL']
  ],
  OL: [
    ['StrengthRating', 'STR'],
    ['RunBlockRating', 'RBK'],
    ['RunBlockPowerRating', 'RBP'],
    ['RunBlockFinesseRating', 'RBF'],
    ['PassBlockRating', 'PBK'],
    ['PassBlockPowerRating', 'PBP'],
    ['PassBlockFinesseRating', 'PBF'],
    ['ImpactBlockingRating', 'IBL']
  ],
  DL: [
    ['SpeedRating', 'SPD'],
    ['StrengthRating', 'STR'],
    ['PowerMovesRating', 'PMV'],
    ['FinesseMovesRating', 'FMV'],
    ['BlockSheddingRating', 'BSH'],
    ['TackleRating', 'TAK'],
    ['PursuitRating', 'PUR'],
    ['HitPowerRating', 'POW']
  ],
  LB: [
    ['SpeedRating', 'SPD'],
    ['TackleRating', 'TAK'],
    ['HitPowerRating', 'POW'],
    ['BlockSheddingRating', 'BSH'],
    ['PursuitRating', 'PUR'],
    ['PlayRecognitionRating', 'PRC'],
    ['ZoneCoverageRating', 'ZCV'],
    ['ManCoverageRating', 'MCV']
  ],
  DB: [
    ['SpeedRating', 'SPD'],
    ['AccelerationRating', 'ACC'],
    ['ManCoverageRating', 'MCV'],
    ['ZoneCoverageRating', 'ZCV'],
    ['PressRating', 'PRS'],
    ['PlayRecognitionRating', 'PRC'],
    ['JumpingRating', 'JMP'],
    ['CatchingRating', 'CTH'],
    ['TackleRating', 'TAK']
  ],
  ST: [
    ['KickPowerRating', 'KPW'],
    ['KickAccuracyRating', 'KAC']
  ]
};

/** Position → glance list key. Same shape as GROUP_OF except TE stands alone. */
const GLANCE_OF: Record<string, string> = { ...GROUP_OF, TE: 'TE' };

export const CARD_FIELDS = [
  'FirstName',
  'LastName',
  'Position',
  'PlayerType',
  'Height',
  'Weight',
  'OverallRating',
  'TraitDevelopment',
  'PLYR_HOME_TOWN',
  'PLYR_HOME_STATE',
  'MentalAbility1', 'MentalAbility2', 'MentalAbility3',
  'MentalAbilityRank1', 'MentalAbilityRank2', 'MentalAbilityRank3',
  'PhysicalAbility1', 'PhysicalAbility2', 'PhysicalAbility3', 'PhysicalAbility4', 'PhysicalAbility5',
  ...new Set(
    [...COMMON, ...Object.values(BY_GROUP).flat(), ...Object.values(GLANCE).flat()].map(([f]) => f)
  )
];

/** Position-relevant ratings from an already-read Player record, display-ordered. */
export function ratingsFromRecord(rec: any): { label: string; value: number }[] {
  const num = (k: string): number => {
    const v = Number(val(rec, k));
    return Number.isFinite(v) ? v : 0;
  };
  const position = String(val(rec, 'Position') ?? '');
  const group = GROUP_OF[position];
  const spec = group ? (BY_GROUP[group] ?? []) : [];
  return [...spec, ...COMMON]
    .filter(([, label], i, arr) => arr.findIndex(([, l]) => l === label) === i)
    .map(([field, label]) => ({ label, value: num(field) }))
    .filter((r) => r.value > 0);
}

/** The at-a-glance skills for the record's position, display-ordered. */
export function glanceFromRecord(rec: any): { label: string; value: number }[] {
  const position = String(val(rec, 'Position') ?? '');
  const spec = GLANCE[GLANCE_OF[position]] ?? COMMON;
  return spec
    .map(([field, label]) => {
      const v = Number(val(rec, field));
      return { label, value: Number.isFinite(v) ? v : 0 };
    })
    .filter((r) => r.value > 0);
}

/** Mental + physical ability slots from an already-read Player record. */
export function abilitiesFromRecord(rec: any): { mental: AbilitySlot[]; physical: AbilitySlot[] } {
  const mental: AbilitySlot[] = [];
  for (let i = 1; i <= 3; i++) {
    const name = String(val(rec, `MentalAbility${i}`) ?? '');
    const rank = String(val(rec, `MentalAbilityRank${i}`) ?? '');
    if (!name || name === 'None') continue;
    mental.push({ name, rank: rank === 'None' ? '' : rank });
  }
  // The save keeps only a tier per physical slot; which ability the slot IS
  // comes from the archetype's slot table in the game's own data (see
  // scripts/extract-abilities.ts).
  const slotNames = PHYSICAL_ABILITY_SLOTS[String(val(rec, 'PlayerType') ?? '')] ?? [];
  const physical: AbilitySlot[] = [];
  for (let i = 1; i <= 5; i++) {
    const rank = String(val(rec, `PhysicalAbility${i}`) ?? '');
    if (!rank || rank === 'None') continue;
    physical.push({ name: slotNames[i - 1] ?? '', rank });
  }
  return { mental, physical };
}

export async function extractRecruitCard(franchise: any, playerRow: number): Promise<RecruitCard | null> {
  try {
    const table = mainTable(franchise, 'Player');
    await table.readRecords(CARD_FIELDS);
    const rec = table.records?.[playerRow];
    if (!rec || rec.isEmpty) return null;

    const num = (k: string): number => {
      const v = Number(val(rec, k));
      return Number.isFinite(v) ? v : 0;
    };
    const position = String(val(rec, 'Position') ?? '');
    const glance = glanceFromRecord(rec);
    const { mental, physical } = abilitiesFromRecord(rec);

    return {
      row: playerRow,
      name: `${String(val(rec, 'FirstName') ?? '').trim()} ${String(val(rec, 'LastName') ?? '').trim()}`.trim(),
      position,
      archetype: String(val(rec, 'PlayerType') ?? ''),
      heightIn: num('Height'),
      weightLb: num('Weight') + 160,
      overall: num('OverallRating'),
      devTrait: String(val(rec, 'TraitDevelopment') ?? ''),
      homeTown: String(val(rec, 'PLYR_HOME_TOWN') ?? ''),
      homeState: String(val(rec, 'PLYR_HOME_STATE') ?? ''),
      glance,
      mental,
      physical
    };
  } catch {
    return null;
  }
}
