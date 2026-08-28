/**
 * Developer tool: average ratings per archetype, grouped by position family.
 *
 * The save stores Madden-lineage archetype identifiers while the game shows its
 * own names. This prints the rating fingerprint of each archetype so an
 * internal id can be matched to a display name by evidence rather than guesswork
 * — see src/shared/archetypes.ts.
 *
 * Usage: node scripts/archetype-profile.ts [save] [family]
 */
import { loadFranchise, mainTable, refFromRecord, isNullRef, val } from '../src/main/parser/franchise.ts';
import { ARCHETYPE_LABELS } from '../src/shared/archetypes.ts';

const savePath = process.argv[2] ?? 'samples/DYNASTY-DUKETOND-AUTOSAVE';
const only = (process.argv[3] ?? '').toUpperCase();

/** Ratings that actually separate archetypes within each family. */
const PROFILE: Record<string, string[]> = {
  QB: ['SpeedRating', 'ThrowPowerRating', 'ThrowAccuracyShortRating', 'ThrowAccuracyDeepRating', 'ThrowOnTheRunRating', 'BreakTackleRating'],
  HB: ['SpeedRating', 'BreakTackleRating', 'TruckingRating', 'JukeMoveRating', 'CatchingRating', 'PassBlockRating', 'CarryingRating'],
  FB: ['SpeedRating', 'RunBlockRating', 'ImpactBlockingRating', 'CatchingRating', 'CarryingRating'],
  WR: ['SpeedRating', 'CatchingRating', 'CatchInTrafficRating', 'DeepRouteRunningRating', 'ShortRouteRunningRating', 'ReleaseRating', 'RunBlockRating', 'JukeMoveRating'],
  TE: ['SpeedRating', 'CatchingRating', 'DeepRouteRunningRating', 'RunBlockRating', 'PassBlockRating', 'ImpactBlockingRating'],
  OT: ['StrengthRating', 'PassBlockRating', 'PassBlockFinesseRating', 'PassBlockPowerRating', 'RunBlockRating', 'RunBlockPowerRating', 'AgilityRating'],
  G: ['StrengthRating', 'PassBlockRating', 'PassBlockPowerRating', 'RunBlockRating', 'RunBlockPowerRating', 'AgilityRating'],
  C: ['StrengthRating', 'PassBlockRating', 'RunBlockRating', 'RunBlockPowerRating', 'AwarenessRating', 'AgilityRating'],
  DE: ['SpeedRating', 'StrengthRating', 'PowerMovesRating', 'FinesseMovesRating', 'BlockSheddingRating', 'TackleRating', 'PursuitRating'],
  DT: ['SpeedRating', 'StrengthRating', 'PowerMovesRating', 'FinesseMovesRating', 'BlockSheddingRating', 'TackleRating'],
  OLB: ['SpeedRating', 'ManCoverageRating', 'ZoneCoverageRating', 'PowerMovesRating', 'BlockSheddingRating', 'TackleRating', 'HitPowerRating'],
  MLB: ['SpeedRating', 'ManCoverageRating', 'ZoneCoverageRating', 'BlockSheddingRating', 'TackleRating', 'PlayRecognitionRating', 'HitPowerRating'],
  CB: ['SpeedRating', 'ManCoverageRating', 'ZoneCoverageRating', 'PressRating', 'CatchingRating', 'TackleRating'],
  S: ['SpeedRating', 'ManCoverageRating', 'ZoneCoverageRating', 'TackleRating', 'HitPowerRating', 'PlayRecognitionRating'],
  KP: ['KickPowerRating', 'KickAccuracyRating', 'SpeedRating']
};

const franchise = await loadFranchise(savePath);
const recT = mainTable(franchise, 'Recruit');
await recT.readRecords(['Player']);
const playerT = mainTable(franchise, 'Player');
const pid = playerT.header?.tableId;
const allFields = [...new Set(Object.values(PROFILE).flat())];
await playerT.readRecords(['Position', 'PlayerType', ...allFields]);

interface Acc { n: number; sums: Record<string, number>; positions: Set<string> }
const byArch = new Map<string, Acc>();
for (const r of recT.records ?? []) {
  if (r.isEmpty) continue;
  const ref = refFromRecord(r, 'Player');
  if (isNullRef(ref) || ref.tableId !== pid) continue;
  const p = playerT.records?.[ref.row];
  if (!p || p.isEmpty) continue;
  const arch = String(val(p, 'PlayerType') ?? '');
  if (!arch) continue;
  const e = byArch.get(arch) ?? { n: 0, sums: {}, positions: new Set<string>() };
  e.n++;
  e.positions.add(String(val(p, 'Position')));
  for (const f of allFields) e.sums[f] = (e.sums[f] ?? 0) + (Number(val(p, f)) || 0);
  byArch.set(arch, e);
}

const short = (f: string) =>
  f.replace('Rating', '').replace('ThrowAccuracy', 'Acc').replace('Throw', 'Thr').replace('Running', '').slice(0, 9);

const families = [...new Set([...byArch.keys()].map((a) => a.split('_')[0]))].sort();
for (const fam of families) {
  if (only && fam !== only) continue;
  const cols = PROFILE[fam] ?? ['SpeedRating', 'StrengthRating', 'AwarenessRating'];
  const members = [...byArch.entries()].filter(([a]) => a.startsWith(`${fam}_`));
  if (!members.length) continue;
  const positions = [...new Set(members.flatMap(([, e]) => [...e.positions]))].sort().join('/');
  console.log(`\n=== ${fam}  (${positions}) ===`);
  console.log('  ' + 'archetype'.padEnd(26) + 'n'.padStart(5) + cols.map((c) => short(c).padStart(11)).join(''));
  for (const [a, e] of members.sort((x, y) => y[1].n - x[1].n)) {
    const label = ARCHETYPE_LABELS[a];
    const row = cols.map((c) => (e.sums[c] / e.n).toFixed(1).padStart(11)).join('');
    console.log('  ' + a.padEnd(26) + String(e.n).padStart(5) + row + (label ? `   → ${label}` : '   (unmapped)'));
  }
}

const total = [...byArch.keys()].length;
const mapped = [...byArch.keys()].filter((a) => ARCHETYPE_LABELS[a]).length;
console.log(`\n${mapped}/${total} archetypes mapped to a CFB 27 name.`);
