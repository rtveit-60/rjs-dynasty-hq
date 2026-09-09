/**
 * The player rating fields the scouting board can filter on, with the position
 * groups each one actually matters to. Shared so the main process validates
 * against the same list the UI offers.
 */
export interface RatingDef {
  /** Save field name, e.g. "SpeedRating". */
  field: string;
  /** Column label, e.g. "SPD". */
  label: string;
  /** Menu name, e.g. "Speed". */
  name: string;
  /** Position groups this is commonly scouted for; empty = every position. */
  groups: string[];
  /**
   * Added to the raw save value to get the real one. Weight is stored as
   * pounds - 160, so comparing raw would be off by 160.
   */
  offset?: number;
  /** How to render the value; heights print as feet and inches. */
  kind?: 'rating' | 'height' | 'weight';
  /** Bounds and starting point for the threshold input. */
  min?: number;
  max?: number;
  dflt?: number;
}

const ALL: string[] = [];

export const RATINGS: RatingDef[] = [
  // Measurables first — they apply to every position and are the most common
  // thing to screen on before looking at a single rating.
  { field: 'Height', label: 'HT', name: 'Height (inches)', groups: ALL, kind: 'height', min: 58, max: 86, dflt: 74 },
  { field: 'Weight', label: 'WT', name: 'Weight (lb)', groups: ALL, kind: 'weight', offset: 160, min: 150, max: 400, dflt: 250 },

  { field: 'SpeedRating', label: 'SPD', name: 'Speed', groups: ALL },
  { field: 'AccelerationRating', label: 'ACC', name: 'Acceleration', groups: ALL },
  { field: 'AgilityRating', label: 'AGI', name: 'Agility', groups: ALL },
  { field: 'ChangeOfDirectionRating', label: 'COD', name: 'Change of Direction', groups: ALL },
  { field: 'StrengthRating', label: 'STR', name: 'Strength', groups: ALL },
  { field: 'AwarenessRating', label: 'AWR', name: 'Awareness', groups: ALL },
  { field: 'JumpingRating', label: 'JMP', name: 'Jumping', groups: ALL },
  { field: 'StaminaRating', label: 'STA', name: 'Stamina', groups: ALL },
  { field: 'InjuryRating', label: 'INJ', name: 'Injury', groups: ALL },
  { field: 'ToughnessRating', label: 'TGH', name: 'Toughness', groups: ALL },

  { field: 'ThrowPowerRating', label: 'THP', name: 'Throw Power', groups: ['QB'] },
  { field: 'ThrowAccuracyShortRating', label: 'SAC', name: 'Short Accuracy', groups: ['QB'] },
  { field: 'ThrowAccuracyMidRating', label: 'MAC', name: 'Medium Accuracy', groups: ['QB'] },
  { field: 'ThrowAccuracyDeepRating', label: 'DAC', name: 'Deep Accuracy', groups: ['QB'] },
  { field: 'ThrowOnTheRunRating', label: 'RUN', name: 'Throw on the Run', groups: ['QB'] },
  { field: 'ThrowUnderPressureRating', label: 'TUP', name: 'Throw Under Pressure', groups: ['QB'] },
  { field: 'PlayActionRating', label: 'PAC', name: 'Play Action', groups: ['QB'] },
  { field: 'BreakSackRating', label: 'BSK', name: 'Break Sack', groups: ['QB'] },

  { field: 'CarryingRating', label: 'CAR', name: 'Carrying', groups: ['RB', 'WR', 'TE'] },
  { field: 'BreakTackleRating', label: 'BTK', name: 'Break Tackle', groups: ['RB', 'WR', 'TE'] },
  { field: 'TruckingRating', label: 'TRK', name: 'Trucking', groups: ['RB', 'TE'] },
  { field: 'JukeMoveRating', label: 'JKM', name: 'Juke Move', groups: ['RB', 'WR'] },
  { field: 'SpinMoveRating', label: 'SPM', name: 'Spin Move', groups: ['RB'] },
  { field: 'StiffArmRating', label: 'SFA', name: 'Stiff Arm', groups: ['RB', 'WR'] },
  { field: 'BCVisionRating', label: 'BCV', name: 'Ball Carrier Vision', groups: ['RB'] },

  { field: 'CatchingRating', label: 'CTH', name: 'Catching', groups: ['WR', 'TE', 'RB', 'DB'] },
  { field: 'CatchInTrafficRating', label: 'CIT', name: 'Catch in Traffic', groups: ['WR', 'TE'] },
  { field: 'SpectacularCatchRating', label: 'SPC', name: 'Spectacular Catch', groups: ['WR', 'TE'] },
  { field: 'ShortRouteRunningRating', label: 'SRR', name: 'Short Route Running', groups: ['WR', 'TE', 'RB'] },
  { field: 'MediumRouteRunningRating', label: 'MRR', name: 'Medium Route Running', groups: ['WR', 'TE'] },
  { field: 'DeepRouteRunningRating', label: 'DRR', name: 'Deep Route Running', groups: ['WR', 'TE'] },
  { field: 'ReleaseRating', label: 'RLS', name: 'Release', groups: ['WR', 'TE'] },

  { field: 'RunBlockRating', label: 'RBK', name: 'Run Block', groups: ['OL', 'TE'] },
  { field: 'RunBlockPowerRating', label: 'RBP', name: 'Run Block Power', groups: ['OL', 'TE'] },
  { field: 'RunBlockFinesseRating', label: 'RBF', name: 'Run Block Finesse', groups: ['OL', 'TE'] },
  { field: 'PassBlockRating', label: 'PBK', name: 'Pass Block', groups: ['OL', 'TE'] },
  { field: 'PassBlockPowerRating', label: 'PBP', name: 'Pass Block Power', groups: ['OL'] },
  { field: 'PassBlockFinesseRating', label: 'PBF', name: 'Pass Block Finesse', groups: ['OL'] },
  { field: 'ImpactBlockingRating', label: 'IBL', name: 'Impact Blocking', groups: ['OL', 'TE', 'RB'] },
  { field: 'LeadBlockRating', label: 'LBK', name: 'Lead Block', groups: ['OL', 'RB'] },

  { field: 'BlockSheddingRating', label: 'BSH', name: 'Block Shedding', groups: ['DL', 'LB'] },
  { field: 'PowerMovesRating', label: 'PMV', name: 'Power Moves', groups: ['DL', 'LB'] },
  { field: 'FinesseMovesRating', label: 'FMV', name: 'Finesse Moves', groups: ['DL', 'LB'] },
  { field: 'TackleRating', label: 'TAK', name: 'Tackle', groups: ['DL', 'LB', 'DB'] },
  { field: 'HitPowerRating', label: 'POW', name: 'Hit Power', groups: ['DL', 'LB', 'DB'] },
  { field: 'PursuitRating', label: 'PUR', name: 'Pursuit', groups: ['DL', 'LB', 'DB'] },
  { field: 'PlayRecognitionRating', label: 'PRC', name: 'Play Recognition', groups: ['DL', 'LB', 'DB'] },

  { field: 'ManCoverageRating', label: 'MCV', name: 'Man Coverage', groups: ['DB', 'LB'] },
  { field: 'ZoneCoverageRating', label: 'ZCV', name: 'Zone Coverage', groups: ['DB', 'LB'] },
  { field: 'PressRating', label: 'PRS', name: 'Press', groups: ['DB'] },

  { field: 'KickPowerRating', label: 'KPW', name: 'Kick Power', groups: ['ST'] },
  { field: 'KickAccuracyRating', label: 'KAC', name: 'Kick Accuracy', groups: ['ST'] },
  { field: 'KickReturnRating', label: 'KRT', name: 'Kick Return', groups: ['ST', 'WR', 'RB', 'DB'] },
  { field: 'LongSnapRating', label: 'LSN', name: 'Long Snap', groups: ['ST'] }
];

export const RATING_BY_FIELD = new Map(RATINGS.map((r) => [r.field, r]));

/** Display form for a value already converted to real units. */
export function formatRatingValue(field: string, value: number): string {
  const def = RATING_BY_FIELD.get(field);
  if (!def || !Number.isFinite(value)) return '—';
  if (def.kind === 'height') return `${Math.floor(value / 12)}'${value % 12}"`;
  return String(value);
}

const byName = (a: RatingDef, b: RatingDef) => a.name.localeCompare(b.name);

/** 0 = scouted for this position, 1 = applies to everyone, 2 = another position. */
const tierFor = (r: RatingDef, group: string) =>
  r.groups.includes(group) ? 0 : r.groups.length === 0 ? 1 : 2;

/** Ratings for a position group: relevant first, alphabetical within each tier. */
export function ratingsFor(group: string): RatingDef[] {
  if (!group || group === 'ALL') return [...RATINGS].sort(byName);
  return [...RATINGS].sort((a, b) => tierFor(a, group) - tierFor(b, group) || byName(a, b));
}

/**
 * The same list split into labelled sections for a <select>. Alphabetical
 * inside each section — a flat A-Z over 56 ratings buries Speed under S.
 * `displayAs` names the section in the caller's vocabulary (e.g. "EDGE"
 * while the catalog groups it under DL).
 */
export function ratingGroupsFor(group: string, displayAs?: string): { label: string; items: RatingDef[] }[] {
  if (!group || group === 'ALL') return [{ label: '', items: [...RATINGS].sort(byName) }];
  const tiers: RatingDef[][] = [[], [], []];
  for (const r of RATINGS) tiers[tierFor(r, group)].push(r);
  return [
    { label: `Scouted for ${displayAs ?? group}`, items: tiers[0].sort(byName) },
    { label: 'Measurables & athleticism', items: tiers[1].sort(byName) },
    { label: 'Other positions', items: tiers[2].sort(byName) }
  ].filter((t) => t.items.length);
}

export type ScoutOp = 'gte' | 'lte';

export interface ScoutCriterion {
  field: string;
  op: ScoutOp;
  value: number;
}

/** One recruit that satisfied every criterion, with the values it was judged on. */
export interface ScoutHit {
  playerRow: number;
  values: Record<string, number>;
}
