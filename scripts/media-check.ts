/**
 * Media engine harness: builds a baseline feed from the older sample save, then
 * diffs to the newer autosave to verify incremental event detection.
 * Usage: node scripts/media-check.ts [teamRow]
 */
import { generateMedia, sortEvents } from '../src/main/media/engine.ts';
import { extractSnapshot } from '../src/main/parser/extract.ts';
import { extractLeagueLeaders } from '../src/main/parser/league.ts';
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

const oldLeaders = await extractLeagueLeaders(oldFr);
const baseline = generateMedia(null, oldSnap, oldLeaders);
show('BASELINE (first run on old save)', baseline.events);

console.log('\nparsing new save…');
const newFr = await loadFranchise(NEW);
const newSnap = await extractSnapshot(newFr, { schoolTeamRow: teamRow, fileName: NEW });
console.log(`new: ${newSnap.season?.seasonYear} wk ${newSnap.season?.week}, games played: ${newSnap.games.filter((g) => g.status !== 'unplayed').length}`);

const newLeaders = await extractLeagueLeaders(newFr);
const incremental = generateMedia(baseline.state, newSnap, newLeaders);
show('INCREMENTAL (old → new diff)', incremental.events);

// Idempotence: running again over the same snapshot must add nothing new,
// and the variety ledger must survive the state round-trip.
const again = generateMedia(incremental.state, newSnap, newLeaders);
const knownIds = new Set(incremental.events.map((e) => e.id));
const dupes = again.events.filter((e) => !knownIds.has(e.id));
console.log(`\nidempotence: second pass produced ${dupes.length} unseen events (want 0)`);
console.log(`ledger entries used this cycle: ${Object.keys(incremental.state?.variety?.used ?? {}).length}`);
const heads = incremental.events.filter((e) => e.format !== 'post').map((e) => e.headline);
console.log(`headline uniqueness: ${new Set(heads).size}/${heads.length} unique`);

// Press corps: 100+ profiles across the article desks and the posting voices,
// every article bylined, quick write-ups multi-paragraph.
const { REPORTERS } = await import('../src/main/media/press.ts');
const { PERSONALITIES } = await import('../src/main/media/ecosystem.ts');
const corps = REPORTERS.length + Object.keys(PERSONALITIES).length;
console.log(`press corps: ${REPORTERS.length} desk reporters + ${Object.keys(PERSONALITIES).length} posting voices = ${corps} (want 100+)`);
if (corps < 100) throw new Error('press corps under 100 profiles');
const arts = [...baseline.events, ...incremental.events].filter((e) => e.format !== 'post');
const bylined = arts.filter((e) => e.byline?.name).length;
const multiPara = arts.filter((e) => e.body.length >= 2).length;
console.log(`articles bylined: ${bylined}/${arts.length}; multi-paragraph: ${multiPara}/${arts.length}`);
const badLines = [...baseline.events, ...incremental.events].filter(
  (e) => /[“”]/.test(e.headline) || e.body.some((p) => /[“”]/.test(p))
);
console.log(`fabricated-quote scan (curly quotes anywhere): ${badLines.length} hits (want 0)`);
if (badLines.length) for (const e of badLines.slice(0, 5)) console.log('  !!', e.headline);
