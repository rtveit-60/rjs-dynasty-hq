/**
 * Coach prestige regression harness.
 *
 *   node --max-old-space-size=8192 scripts/prestige-check.ts [before] [after]
 *
 * 1. Rules: builds snapshots from two saves of one dynasty (default: the 2026
 *    week-0 and week-5 Virginia samples), baselines the ledger on the first,
 *    assesses the second under every tier and prints what each tier would
 *    charge — totals, the ten biggest hits with their reasons, the user's
 *    staff — plus the Off tier proving it charges nothing while still
 *    advancing the ledger. Idempotence: assessing the same snapshot twice
 *    yields no new entries.
 * 2. Write: on a scratch copy (never samples/, never the saves folder) deducts
 *    from three coaches in one write, proves the source bytes never changed,
 *    the `_RJ` sibling reads back with the new scores, the floor at zero
 *    holds, and bad payloads are rejected whole.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyPrestigeAdjustments } from '../src/main/coach-editor.ts';
import { editedPathFor } from '../src/main/editor.ts';
import { ensureCoachSchema } from '../src/main/parser/coach-schema.ts';
import { extractSnapshot } from '../src/main/parser/extract.ts';
import { loadFranchise, mainTable, val } from '../src/main/parser/franchise.ts';
import {
  PRESTIGE_TIER_SPECS,
  assessPrestige,
  lostWrites,
  prestigeLetterForScore,
  type PrestigeLedger
} from '../src/shared/prestige.ts';

const before = process.argv[2] ?? 'samples/DYNASTY-AUG29-07h16m53-AUTOSAVE';
const after = process.argv[3] ?? 'samples/DYNASTY-VIRGINIA-MIDSEASON';

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
async function rejects(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    check(label, false, 'was accepted');
  } catch (err) {
    check(label, true, err instanceof Error ? err.message : String(err));
  }
}

// ---- 1. rules --------------------------------------------------------------------
console.log(`\n=== rules: ${path.basename(before)} → ${path.basename(after)}`);
const frA = await loadFranchise(before);
const snapA = await extractSnapshot(frA, { schoolTeamRow: null, fileName: path.basename(before) });
const frB = await loadFranchise(after);
const snapB = await extractSnapshot(frB, { schoolTeamRow: null, fileName: path.basename(after) });
const teams = new Map(snapB.teams.map((t) => [t.row, t.longName]));
console.log(
  `  ${snapA.season?.seasonYear} wk${snapA.season?.week} → ${snapB.season?.seasonYear} wk${snapB.season?.week}; carousel ${snapA.carousel.length}/${snapB.carousel.length}; played ${snapA.games.filter((g) => g.status !== 'unplayed').length}/${snapB.games.filter((g) => g.status !== 'unplayed').length}`
);
check('carousel carries prestige scores', snapB.carousel.every((c) => typeof c.prestigeScore === 'number'));

const base = assessPrestige(null, snapA, PRESTIGE_TIER_SPECS.balanced);
check('baseline charges nothing', !!base && base.entries.length === 0);
const ledgerA = base!.next;

const offRun = assessPrestige(ledgerA, snapB, null);
check('Off charges nothing', !!offRun && offRun.entries.length === 0);
check(
  'Off still advances the ledger',
  !!offRun && offRun.next.week === snapB.season!.week && offRun.next.processedGames.length > ledgerA.processedGames.length
);

for (const spec of Object.values(PRESTIGE_TIER_SPECS)) {
  const run = assessPrestige(ledgerA, snapB, spec)!;
  const byCause: Record<string, { n: number; pts: number }> = {};
  for (const e of run.entries) {
    const c = (byCause[e.cause] ??= { n: 0, pts: 0 });
    c.n++;
    c.pts += e.points;
  }
  const perCoach = new Map<number, { name: string; role: string; team: string; pts: number; score: number; user: boolean }>();
  for (const e of run.entries) {
    const p = perCoach.get(e.coachRow) ?? {
      name: e.coach,
      role: e.role,
      team: teams.get(e.teamRow) ?? String(e.teamRow),
      pts: 0,
      score: run.next.coaches[e.coachRow]?.score ?? 0,
      user: e.user
    };
    p.pts += e.points;
    perCoach.set(e.coachRow, p);
  }
  console.log(`\n--- ${spec.label}: ${run.entries.length} entries, ${perCoach.size} coaches`);
  for (const [cause, c] of Object.entries(byCause)) console.log(`    ${cause.padEnd(13)} n=${String(c.n).padStart(3)} pts=${c.pts}`);
  const top = [...perCoach.values()].sort((a, b) => b.pts - a.pts).slice(0, 10);
  for (const p of top) {
    const to = Math.max(0, p.score - p.pts);
    console.log(
      `    ${p.role} ${p.name.padEnd(22)} ${p.team.padEnd(20)} ${String(p.score).padStart(5)} → ${String(to).padStart(5)}  (−${p.pts})  ${prestigeLetterForScore(p.score)} → ${prestigeLetterForScore(to)}${p.user ? '  [user]' : ''}`
    );
  }
  const worst = run.entries.filter((e) => e.cause === 'loss').sort((a, b) => b.points - a.points)[0];
  if (worst) console.log(`    heaviest loss: ${worst.coach} −${worst.points}: ${worst.detail}`);
  const again = assessPrestige(run.next, snapB, spec)!;
  check(`${spec.label}: idempotent on the same snapshot`, again.entries.length === 0, `${again.entries.length} new`);
  check(`${spec.label}: every loss entry names a real loser`, run.entries.filter((e) => e.cause === 'loss').every((e) => teams.has(e.teamRow)));
}

// Losing coaches on the balanced tier must be charged, winners never.
{
  const run = assessPrestige(ledgerA, snapB, PRESTIGE_TIER_SPECS.balanced)!;
  const losers = new Set<number>();
  const winners = new Set<number>();
  const seen = new Set(ledgerA.processedGames);
  for (const g of snapB.games) {
    if (g.status === 'unplayed') continue;
    if (seen.has(`g${snapB.season!.seasonYear}w${g.week}-${g.homeRow}-${g.awayRow}`)) continue;
    (g.status === 'home' ? losers : winners).add(g.awayRow);
    (g.status === 'home' ? winners : losers).add(g.homeRow);
  }
  const chargedTeams = new Set(run.entries.filter((e) => e.cause === 'loss').map((e) => e.teamRow));
  check('every charged team lost a new game', [...chargedTeams].every((t) => losers.has(t)));
  const unbeaten = [...winners].filter((t) => !losers.has(t));
  check('unbeaten teams are never charged', unbeaten.every((t) => !chargedTeams.has(t)), `${unbeaten.length} unbeaten`);
  // Lost-write detection: a coach whose live score sits at the pre-write value is re-billed; one at the written value is not.
  const c0 = snapB.carousel.find((c) => c.role === 'HC' && (c.prestigeScore ?? 0) > 300)!;
  const ledger: PrestigeLedger = {
    ...run.next,
    written: {
      [c0.coachRow]: { before: c0.prestigeScore! + 2, after: c0.prestigeScore! - 60, seasonYear: 2026, week: 5 },
      [snapB.carousel[0].coachRow]: {
        before: (snapB.carousel[0].prestigeScore ?? 0) + 60,
        after: snapB.carousel[0].prestigeScore ?? 0,
        seasonYear: 2026,
        week: 5
      }
    }
  };
  const lost = lostWrites(ledger, snapB);
  check('lost write detected when the live score sits at the pre-write value', lost.some((l) => l.coachRow === c0.coachRow && l.points === 62));
  check('absorbed write is not re-billed', !lost.some((l) => l.coachRow === snapB.carousel[0].coachRow));
}

// ---- 2. write --------------------------------------------------------------------
console.log('\n=== write');
const dir = mkdtempSync(path.join(os.tmpdir(), 'prestige-check-'));
const work = path.join(dir, 'DYNASTY-PRESTIGECHECK');
copyFileSync(after, work);
const sha = (p: string) => createHash('sha1').update(readFileSync(p)).digest('hex');
const sourceHash = sha(work);
const fr = await loadFranchise(work);
const ct = mainTable(fr, 'Coach');
await ensureCoachSchema(fr, ct);
await ct.readRecords();
const picks: { row: number; score: number }[] = [];
for (let i = 0; i < ct.records.length && picks.length < 3; i++) {
  const r = ct.records[i];
  if (r.isEmpty || String(val(r, 'Position')) !== 'HeadCoach') continue;
  const s = Number(val(r, 'CoachPrestigeScore'));
  if (s >= 100) picks.push({ row: i, score: s });
}
const low = (() => {
  for (let i = 0; i < ct.records.length; i++) {
    const r = ct.records[i];
    if (!r.isEmpty && String(val(r, 'Position')) === 'HeadCoach' && Number(val(r, 'CoachPrestigeScore')) < 40) return { row: i, score: Number(val(r, 'CoachPrestigeScore')) };
  }
  return null;
})();
const deductions = [
  { coachRow: picks[0].row, points: 25 },
  { coachRow: picks[1].row, points: 61 },
  ...(low ? [{ coachRow: low.row, points: 500 }] : [{ coachRow: picks[2].row, points: 7 }])
];
const { editedPath, applied } = await applyPrestigeAdjustments(fr, work, deductions, dir);
check('writes the _RJ sibling', editedPath === editedPathFor(work), path.basename(editedPath));
check('source bytes unchanged', sha(work) === sourceHash);
check('reports before/after per coach', applied.length === deductions.length);
check('first deduction lands', applied[0].after === picks[0].score - 25, `${applied[0].before} → ${applied[0].after}`);
if (low) check('floors at zero', applied[2].before === low.score && applied[2].after === 0, `${low.score} → ${applied[2].after}`);
const check2 = await loadFranchise(editedPath);
const t2 = mainTable(check2, 'Coach');
await ensureCoachSchema(check2, t2);
await t2.readRecords();
check(
  'edited copy reads back with the new scores',
  applied.every((a) => Number(val(t2.records[a.coachRow], 'CoachPrestigeScore')) === a.after)
);
check(
  'letters untouched (the game re-grades)',
  applied.every((a) => String(val(t2.records[a.coachRow], 'CoachPrestige')) === String(val(ct.records[a.coachRow], 'CoachPrestige')))
);
await rejects('rejects an empty batch', () => applyPrestigeAdjustments(fr, work, [], dir));
await rejects('rejects a non-positive amount', () => applyPrestigeAdjustments(fr, work, [{ coachRow: picks[0].row, points: 0 }], dir));
await rejects('rejects a duplicate row', () =>
  applyPrestigeAdjustments(fr, work, [{ coachRow: picks[0].row, points: 5 }, { coachRow: picks[0].row, points: 5 }], dir)
);
await rejects('rejects a non-coach row', () => applyPrestigeAdjustments(fr, work, [{ coachRow: 999999, points: 5 }], dir));

console.log(`\n${failures ? `${failures} FAILURE${failures === 1 ? '' : 'S'}` : 'ALL PASS'}`);
process.exit(failures ? 1 : 0);
