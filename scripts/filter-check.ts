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
import { POSITION_GROUPS } from '../src/renderer/src/lib/format.ts';

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
  o: { q?: string; group?: string; minStars?: number; edgeOnly?: boolean; openOnly?: boolean; boardOnly?: boolean },
): ClassRecruit[] {
  const needle = (o.q ?? '').trim().toLowerCase();
  const group = o.group ?? 'ALL';
  const minStars = o.minStars ?? 0;
  return pool.filter((r) => {
    if (minStars && r.stars < minStars) return false;
    if (group !== 'ALL' && !(POSITION_GROUPS[group] ?? []).includes(r.position)) return false;
    if (o.edgeOnly && !r.edges.length) return false;
    if (o.openOnly && r.committedTo) return false;
    if (o.boardOnly && !r.onBoard) return false;
    if (needle) {
      const hay = `${r.name} ${r.position} ${spaceOut(r.homeState)} ${spaceOut(r.pipeline)}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

// ---- 1. Every position group returns only its own positions ----
console.log('position groups:');
const seenPositions = new Set(all.map((r) => r.position));
for (const [group, positions] of Object.entries(POSITION_GROUPS)) {
  const got = applyFilters(all, { group });
  const bad = got.filter((r) => !positions.includes(r.position));
  const badList = [...new Set(bad.map((r) => r.position))].join(', ');
  check(
    `${group.padEnd(3)} (${String(got.length).padStart(4)} rows) → ${positions.join('/')}`,
    bad.length === 0,
    `${bad.length} wrong: ${badList}`,
  );
}

// ---- 2. No position falls through every group ----
const grouped = new Set(Object.values(POSITION_GROUPS).flat());
const orphans = [...seenPositions].filter((p) => !grouped.has(p));
console.log('\ncoverage:');
check(
  `every position in the class belongs to a group`,
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
    `${r.name} ${r.position} ${spaceOut(r.homeState)} ${spaceOut(r.pipeline)}`.toLowerCase().includes(term.toLowerCase()),
  ));
  check(`"${term}" includes the recruit it came from`, got.some((r) => r.row === sample.row));
}

// ---- 6. Combined filters compose ----
console.log('\ncombinations:');
for (const group of ['QB', 'RB', 'DL', 'DB']) {
  const got = applyFilters(all, { group, minStars: 4, openOnly: true });
  check(
    `${group} + 4★+ + uncommitted (${got.length} rows)`,
    got.every((r) => POSITION_GROUPS[group].includes(r.position) && r.stars >= 4 && !r.committedTo),
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

// ---- 10. Scouting: attribute queries must hold their own thresholds ----
console.log('\nscouting queries:');
const byPlayerRow = new Map(all.map((r) => [r.playerRow, r]));
const queries: { label: string; criteria: ScoutCriterion[] }[] = [
  { label: 'SPD >= 92, ACC >= 90', criteria: [{ field: 'SpeedRating', op: 'gte', value: 92 }, { field: 'AccelerationRating', op: 'gte', value: 90 }] },
  { label: 'THP >= 94', criteria: [{ field: 'ThrowPowerRating', op: 'gte', value: 94 }] },
  { label: 'STR <= 60', criteria: [{ field: 'StrengthRating', op: 'lte', value: 60 }] },
  { label: 'unknown field is ignored', criteria: [{ field: 'NotARating', op: 'gte', value: 50 }] }
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
}

console.log(`\n${failures === 0 ? 'ALL FILTER CHECKS PASSED' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
