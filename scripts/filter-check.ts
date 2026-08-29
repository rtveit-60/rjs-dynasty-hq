/**
 * Developer test: exercise the recruiting board's filters against a real save
 * and assert that every row a filter returns actually satisfies it.
 *
 * Usage: node scripts/filter-check.ts [save] [school]
 */
import type { ClassRecruit } from '../src/shared/types.ts';
import { extractSnapshot } from '../src/main/parser/extract.ts';
import { loadFranchise } from '../src/main/parser/franchise.ts';
import { extractRecruitCard } from '../src/main/parser/recruit-card.ts';
import { scoutRecruits } from '../src/main/parser/recruit-scout.ts';
import { RATING_BY_FIELD, type ScoutCriterion } from '../src/shared/ratings.ts';
import {
  RECRUIT_POS_OPTIONS,
  recruitPos,
  recruitPosPool,
  recruitPositionsFor
} from '../src/renderer/src/lib/format.ts';

const savePath = process.argv[2] ?? 'samples/DYNASTY-DUKETOND-AUTOSAVE';
const schoolFilter = (process.argv[3] ?? 'notre').toLowerCase();

const franchise = await loadFranchise(savePath);
let snap = await extractSnapshot(franchise, { schoolTeamRow: null, fileName: savePath });
const school = snap.teams.find(
  (t) =>
    t.longName.toLowerCase().includes(schoolFilter) ||
    (t.headCoach ?? '').toLowerCase().includes(schoolFilter),
);
if (!school) throw new Error(`no team matching ${schoolFilter}`);
snap = await extractSnapshot(franchise, { schoolTeamRow: school.row, fileName: savePath });

const all = snap.school?.recruiting?.recruits ?? [];
console.log(`${school.longName}: ${all.length} recruits\n`);

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

/** The board's own predicate, kept in step with RecruitingView. */
const spaceOut = (raw: string) => raw.replace(/([a-z])([A-Z])/g, '$1 $2');
function applyFilters(
  pool: ClassRecruit[],
  o: { q?: string; pos?: string; minStars?: number; edgeOnly?: boolean; openOnly?: boolean; boardOnly?: boolean },
): ClassRecruit[] {
  const needle = (o.q ?? '').trim().toLowerCase();
  const allowed = recruitPositionsFor(o.pos ?? 'ALL');
  const minStars = o.minStars ?? 0;
  return pool.filter((r) => {
    if (minStars && r.stars < minStars) return false;
    if (allowed.length && !allowed.includes(r.position)) return false;
    if (o.edgeOnly && !r.edges.length) return false;
    if (o.openOnly && r.committedTo) return false;
    if (o.boardOnly && !r.onBoard) return false;
    if (needle) {
      const hay =
        `${r.name} ${recruitPos(r.position)} ${recruitPosPool(r.position)} ${spaceOut(r.homeState)} ${spaceOut(r.pipeline)}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

// ---- 1. Every position option returns only its own positions ----
console.log('position options:');
const seenPositions = new Set(all.map((r) => r.position));
for (const { key, positions } of RECRUIT_POS_OPTIONS) {
  const got = applyFilters(all, { pos: key });
  const bad = got.filter((r) => !positions.includes(r.position));
  const badList = [...new Set(bad.map((r) => r.position))].join(', ');
  check(
    `${key.padEnd(4)} (${String(got.length).padStart(4)} rows) → ${positions.join('/')}`,
    bad.length === 0,
    `${bad.length} wrong: ${badList}`,
  );
}

// ---- 2. No position falls through every option ----
const grouped = new Set(RECRUIT_POS_OPTIONS.flatMap((o) => o.positions));
const orphans = [...seenPositions].filter((p) => !grouped.has(p));
console.log('\ncoverage:');
check(
  `every position in the class belongs to an option`,
  orphans.length === 0,
  `unreachable via filters: ${orphans.join(', ')}`,
);
console.log(`  positions present: ${[...seenPositions].sort().join(', ')}`);

// ---- 3. Star filters ----
console.log('\nstar filters:');
for (const min of [5, 4, 3]) {
  const got = applyFilters(all, { minStars: min });
  check(`${min}★+ (${got.length} rows)`, got.every((r) => r.stars >= min));
}

// ---- 4. Toggles ----
console.log('\ntoggles:');
check('Your Edge returns only recruits with an edge', applyFilters(all, { edgeOnly: true }).every((r) => r.edges.length > 0));
check('Uncommitted returns only uncommitted', applyFilters(all, { openOnly: true }).every((r) => !r.committedTo));
check('On Board returns only board recruits', applyFilters(all, { boardOnly: true }).every((r) => r.onBoard));

// ---- 5. Search ----
console.log('\nsearch:');
const sample = all.find((r) => r.name.includes(' '));
if (sample) {
  const term = sample.name.split(' ')[1] ?? sample.name;
  const got = applyFilters(all, { q: term });
  check(`"${term}" (${got.length} rows) all contain the term`, got.every((r) =>
    `${r.name} ${recruitPos(r.position)} ${recruitPosPool(r.position)} ${spaceOut(r.homeState)} ${spaceOut(r.pipeline)}`
      .toLowerCase()
      .includes(term.toLowerCase()),
  ));
  check(`"${term}" includes the recruit it came from`, got.some((r) => r.row === sample.row));
}
// Searching a main type must surface its side positions: "OT" finds LT and RT.
const otHits = applyFilters(all, { q: 'ot' });
const otSides = new Set(otHits.map((r) => r.position));
check(
  `"ot" reaches tackles on both sides (${otHits.length} rows)`,
  ['LT', 'RT'].every((p) => !seenPositions.has(p) || otSides.has(p)),
  `sides seen: ${[...otSides].join(', ')}`,
);

// ---- 6. Combined filters compose ----
console.log('\ncombinations:');
for (const pos of ['QB', 'HB', 'EDGE', 'CB']) {
  const got = applyFilters(all, { pos, minStars: 4, openOnly: true });
  check(
    `${pos} + 4★+ + uncommitted (${got.length} rows)`,
    got.every((r) => recruitPositionsFor(pos).includes(r.position) && r.stars >= 4 && !r.committedTo),
  );
}

// ---- 7. Row identity: duplicate keys make React reuse the wrong <tr> ----
console.log('\nrow identity:');
const byRow = new Map<number, ClassRecruit[]>();
for (const r of all) byRow.set(r.row, [...(byRow.get(r.row) ?? []), r]);
const dupes = [...byRow.entries()].filter(([, v]) => v.length > 1);
check(
  `every recruit has a unique row id (${byRow.size} ids / ${all.length} recruits)`,
  dupes.length === 0,
  `${dupes.length} duplicated: ${dupes
    .slice(0, 5)
    .map(([row, v]) => `row ${row} → ${v.map((x) => `${x.name}(${x.position})`).join(' + ')}`)
    .join('; ')}`,
);

// ---- 8. Board split (HS vs portal) ----
console.log('\nboard split:');
const hs = all.filter((r) => !r.isTransfer);
const portal = all.filter((r) => r.isTransfer);
check(`hs + portal accounts for every recruit`, hs.length + portal.length === all.length);
check(`portal rows are all transfers (${portal.length})`, portal.every((r) => r.isTransfer));
check(`hs board has no transfers (${hs.length})`, hs.every((r) => !r.isTransfer));

// ---- 9. The expanded card must describe the row it opened from ----
// Regression: `row` indexes the Recruit table but the card reads the Player
// table, so passing the wrong one silently rendered a different prospect.
console.log('\nrecruit cards match their row:');
const spread = [0, 1, 7, 40, 250, 1200, 3000, all.length - 1]
  .filter((i) => i >= 0 && i < all.length)
  .map((i) => all[i]);
for (const r of spread) {
  const card = await extractRecruitCard(franchise, r.playerRow);
  const ok = !!card && card.name === r.name && card.position === r.position;
  check(
    `${r.name} (${r.position})`,
    ok,
    card ? `card says ${card.name} (${card.position})` : 'no card returned',
  );
}

// ---- 9b. Position options mirror the game's own ranking pools ----
// The game files recruits under main types (OT = LT+RT, OLB = LOLB+ROLB…) and
// PositionRank runs per pool. If an option grouped positions the game ranks
// separately, one rank value would appear twice inside it; if it split a real
// pool, the map above would disagree with recruitPosPool. Both are asserted.
console.log('\nposition pools:');
const covered = RECRUIT_POS_OPTIONS.flatMap((o) => o.positions);
check(
  `no save position sits in two options`,
  covered.length === new Set(covered).size,
  covered.filter((p, i) => covered.indexOf(p) !== i).join(', '),
);
const hsRanked = all.filter((r) => !r.isTransfer && r.positionRank > 0);
for (const { key, positions } of RECRUIT_POS_OPTIONS) {
  const pool = hsRanked.filter((r) => positions.includes(r.position));
  if (!pool.length) continue;
  const ranks = pool.map((r) => r.positionRank);
  const collisions = ranks.filter((v, i) => ranks.indexOf(v) !== i);
  check(
    `${key.padEnd(4)} ranks as one pool (${pool.length} ranked)`,
    collisions.length === 0,
    `rank values duplicated: ${[...new Set(collisions)].slice(0, 5).join(', ')}`,
  );
}
check(
  `recruitPosPool agrees with the option map`,
  RECRUIT_POS_OPTIONS.every((o) => o.positions.every((p) => recruitPosPool(p) === o.key)),
);
// Display vocabulary: OL keeps its side, the defensive front shows role names.
console.log('\ndisplay vocabulary:');
const shown = new Map(
  ['LT', 'RT', 'LG', 'RG', 'LE', 'RE', 'MLB', 'LOLB', 'ROLB'].map((p) => [p, recruitPos(p)]),
);
check(
  `OL rows keep their side (LT/RT/LG/RG)`,
  ['LT', 'RT', 'LG', 'RG'].every((p) => shown.get(p) === p),
  [...shown].map(([k, v]) => `${k}→${v}`).join(' '),
);
check(
  `defensive front shows role names (EDGE/MIKE/OLB)`,
  shown.get('LE') === 'EDGE' && shown.get('RE') === 'EDGE' && shown.get('MLB') === 'MIKE' &&
    shown.get('LOLB') === 'OLB' && shown.get('ROLB') === 'OLB',
  [...shown].map(([k, v]) => `${k}→${v}`).join(' '),
);

// ---- 9c. Archetypes ----
console.log('\narchetypes:');
const withArch = all.filter((r) => r.archetype);
check(`every recruit has an archetype (${withArch.length}/${all.length})`, withArch.length === all.length);
const roleByPos = new Map<string, Set<string>>();
for (const r of all) {
  const role = r.archetype.includes('_') ? r.archetype.split('_')[0] : '';
  if (!roleByPos.has(r.position)) roleByPos.set(r.position, new Set());
  roleByPos.get(r.position)!.add(role);
}
const mixed = [...roleByPos.entries()].filter(([, roles]) => roles.size > 1);
check(
  `each position maps to one archetype family`,
  mixed.length === 0,
  mixed.map(([p, s]) => `${p}: ${[...s].join('/')}`).join('; '),
);
console.log(
  `  families: ${[...new Set(all.map((r) => r.archetype.split('_')[0]))].sort().join(', ')}`,
);

// ---- 10. Scouting: attribute queries must hold their own thresholds ----
console.log('\nscouting queries:');
const byPlayerRow = new Map(all.map((r) => [r.playerRow, r]));
const queries: { label: string; criteria: ScoutCriterion[] }[] = [
  { label: 'SPD >= 92, ACC >= 90', criteria: [{ field: 'SpeedRating', op: 'gte', value: 92 }, { field: 'AccelerationRating', op: 'gte', value: 90 }] },
  { label: 'THP >= 94', criteria: [{ field: 'ThrowPowerRating', op: 'gte', value: 94 }] },
  { label: 'STR <= 60', criteria: [{ field: 'StrengthRating', op: 'lte', value: 60 }] },
  { label: 'unknown field is ignored', criteria: [{ field: 'NotARating', op: 'gte', value: 50 }] },
  { label: 'HT >= 78 (6ft 6in+)', criteria: [{ field: 'Height', op: 'gte', value: 78 }] },
  { label: 'WT >= 300', criteria: [{ field: 'Weight', op: 'gte', value: 300 }] },
  { label: 'WT <= 180', criteria: [{ field: 'Weight', op: 'lte', value: 180 }] },
  { label: 'HT >= 76 and WT >= 290', criteria: [{ field: 'Height', op: 'gte', value: 76 }, { field: 'Weight', op: 'gte', value: 290 }] }
];
for (const q of queries) {
  const hits = await scoutRecruits(franchise, q.criteria);
  const known = q.criteria.every((c) => RATING_BY_FIELD.has(c.field));
  if (!known) {
    check(`${q.label} → 0 hits`, hits.length === 0, `got ${hits.length}`);
    continue;
  }
  const bad = hits.filter((h) =>
    q.criteria.some((c) => {
      const v = h.values[c.field];
      return v === undefined || (c.op === 'gte' ? v < c.value : v > c.value);
    }),
  );
  check(`${q.label} (${hits.length} hits) all satisfy the thresholds`, bad.length === 0, `${bad.length} violate`);
  check(
    `${q.label} hits are all recruits`,
    hits.every((h) => byPlayerRow.has(h.playerRow)),
    'some hits are not in the class',
  );
  // Measurables must agree with what the board already shows for that recruit,
  // which proves the pounds-160 offset is applied exactly once.
  const mism = hits.filter((h) => {
    const r = byPlayerRow.get(h.playerRow);
    if (!r) return false;
    const w = h.values['Weight'];
    const ht = h.values['Height'];
    return (w !== undefined && w !== r.weightLb) || (ht !== undefined && ht !== r.heightIn);
  });
  if (hits.some((h) => h.values['Weight'] !== undefined || h.values['Height'] !== undefined)) {
    check(
      `${q.label} measurables match the board`,
      mism.length === 0,
      mism
        .slice(0, 3)
        .map((h) => {
          const r = byPlayerRow.get(h.playerRow)!;
          return `${r.name}: scout ${h.values['Weight'] ?? h.values['Height']} vs board ${h.values['Weight'] !== undefined ? r.weightLb : r.heightIn}`;
        })
        .join('; '),
    );
  }
}

console.log(`\n${failures === 0 ? 'ALL FILTER CHECKS PASSED' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
