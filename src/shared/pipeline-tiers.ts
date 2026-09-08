/**
 * Pipeline influence tiers: the save's PipelineInfluenceLevel ladder and the
 * InfluenceValue band each tier was observed to cover (RESEARCH "Pipeline
 * editor"). The game's tuning store carries no threshold table for this
 * ladder, so the floors are the lowest value seen at each tier across every
 * school in the sample saves: Niche Interest 2, Respected 30, Popular 90,
 * Household Name 175, Cultural Pillar 300 (293–299 never observed; 300 is
 * treated as the Pillar floor). Unrecognized sits only at 0, so any positive
 * value is at least Niche Interest.
 */
import { PIPELINE_LEVEL_NAMES, PIPELINE_NAMES, PIPELINE_REGIONS } from './pipelines.ts';

export interface PipelineTier {
  /** PipelineInfluenceLevel enum member. */
  level: string;
  /** 0–5, the number on the game's map pin. */
  tier: number;
  /** Lowest InfluenceValue observed at this tier. */
  floor: number;
}

export const PIPELINE_TIERS: PipelineTier[] = [
  { level: 'Unrecognized', tier: 0, floor: 0 },
  { level: 'NicheInterest', tier: 1, floor: 1 },
  { level: 'Respected', tier: 2, floor: 30 },
  { level: 'Popular', tier: 3, floor: 90 },
  { level: 'HouseholdName', tier: 4, floor: 175 },
  { level: 'CulturalPillar', tier: 5, floor: 300 }
];

/** InfluenceValue is a 10-bit int in the save schema. */
export const PIPELINE_VALUE_MAX = 1000;

/** The tier an influence value lands in. */
export function tierForValue(value: number): PipelineTier {
  let hit = PIPELINE_TIERS[0];
  for (const t of PIPELINE_TIERS) if (value >= t.floor) hit = t;
  return hit;
}

export function tierOfLevel(level: string): number {
  return PIPELINE_TIERS.find((t) => t.level === level)?.tier ?? 0;
}

function wordSpace(raw: string): string {
  return raw.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/** The game's display name for a Pipeline member (International → "National"). */
export function pipelineLabel(member: string): string {
  return PIPELINE_NAMES[member] ?? wordSpace(member);
}

/** The game's region blurb for a pipeline not named after a place, else ''. */
export function pipelineRegion(member: string): string {
  return PIPELINE_REGIONS[member] ?? '';
}

/** The game's display name for a PipelineInfluenceLevel member. */
export function levelLabel(level: string): string {
  return PIPELINE_LEVEL_NAMES[level] ?? wordSpace(level);
}
