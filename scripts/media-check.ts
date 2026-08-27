/**
 * Media engine harness: builds a baseline feed from the older sample save, then
 * diffs to the newer autosave to verify incremental event detection.
 * Usage: node scripts/media-check.ts [teamRow]
 */
import { generateMedia, sortEvents } from '../src/main/media/engine.ts';
import { extractSnapshot } from '../src/main/parser/extract.ts';
import { loadFranchise } from '../src/main/parser/franchise.ts';

const teamRow = Number(process.argv[2] ?? 85);
const OLD = 'samples/DYNASTY-DUKETOND';
const NEW = 'samples/DYNASTY-DUKETOND-AUTOSAVE';

const show = (label: string, events: import('../src/shared/types.ts').MediaEvent[]) => {
  console.log(`\n=== ${label}: ${events.length} stories ===`);
  const byType: Record<string, number> = {};
  for (const e of events) byType[e.type] = (byType[e.type] ?? 0) + 1;
  console.log('types:', JSON.stringify(byType));
  for (const e of sortEvents(events).slice(0, 10)) {
    console.log(`\n[${e.outlet.toUpperCase()}] wk${e.week} p${e.priority}${e.aboutUser ? ' *user*' : ''}`);
    console.log(`  ${e.headline}`);
    console.log(`  — ${e.dek}`);
    for (const p of e.body) console.log(`  ${p}`);
  }
};

console.log('parsing old save…');
const oldFr = await loadFranchise(OLD);
const oldSnap = await extractSnapshot(oldFr, { schoolTeamRow: teamRow, fileName: OLD });
console.log(`old: ${oldSnap.season?.seasonYear} wk ${oldSnap.season?.week}, games played: ${oldSnap.games.filter((g) => g.status !== 'unplayed').length}`);

const baseline = generateMedia(null, oldSnap);
show('BASELINE (first run on old save)', baseline.events);

console.log('\nparsing new save…');
const newFr = await loadFranchise(NEW);
const newSnap = await extractSnapshot(newFr, { schoolTeamRow: teamRow, fileName: NEW });
console.log(`new: ${newSnap.season?.seasonYear} wk ${newSnap.season?.week}, games played: ${newSnap.games.filter((g) => g.status !== 'unplayed').length}`);

const incremental = generateMedia(baseline.state, newSnap);
show('INCREMENTAL (old → new diff)', incremental.events);
