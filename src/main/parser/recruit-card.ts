/**
 * On-demand detail for a single recruit. Kept out of the snapshot because the
 * class runs to several thousand players and each carries 59 rating fields —
 * far too much to serialise on every save write.
 */
import type { AbilitySlot, RecruitCard } from '../../shared/types.ts';
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
  ...new Set([...COMMON, ...Object.values(BY_GROUP).flat()].map(([f]) => f))
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

/** Mental + physical ability slots from an already-read Player record. */
export function abilitiesFromRecord(rec: any): { mental: AbilitySlot[]; physical: AbilitySlot[] } {
  const mental: AbilitySlot[] = [];
  for (let i = 1; i <= 3; i++) {
    const name = String(val(rec, `MentalAbility${i}`) ?? '');
    const rank = String(val(rec, `MentalAbilityRank${i}`) ?? '');
    if (!name || name === 'None') continue;
    mental.push({ name, rank: rank === 'None' ? '' : rank });
  }
  // The save keeps only a tier for each physical slot — no name is stored.
  const physical: AbilitySlot[] = [];
  for (let i = 1; i <= 5; i++) {
    const rank = String(val(rec, `PhysicalAbility${i}`) ?? '');
    if (!rank || rank === 'None') continue;
    physical.push({ name: '', rank });
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
    const ratings = ratingsFromRecord(rec);
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
      ratings,
      mental,
      physical
    };
  } catch {
    return null;
  }
}
