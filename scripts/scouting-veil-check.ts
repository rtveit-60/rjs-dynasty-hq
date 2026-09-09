/**
 * Scouting veil regression harness (Setup > Scouting veil).
 *
 * Proves, on a real save: the extractor's scouting fields (scoutsDone /
 * scouted on board targets and class recruits) come from the user's own
 * target rows and never leak off the board; the shared veil rule hides
 * exactly the unscouted high-school recruits and nothing else; and the media
 * engine keeps a gem note out of a commit story for an unscouted recruit when
 * the veil is on.
 *
 * Usage: node scripts/scouting-veil-check.ts [save] [teamRow]
 */
import { loadFranchise } from '../src/main/parser/franchise.ts';
import { extractSnapshot } from '../src/main/parser/extract.ts';
import { generateMedia } from '../src/main/media/engine.ts';
import { writeArticle } from '../src/main/media/articles.ts';
import { makeLedger } from '../src/main/media/voices.ts';
import { INTEL_FULL, SCOUTS_MAX, isFullyScouted, scoutsDoneFor, veilHides } from '../src/shared/scouting.ts';

const savePath = process.argv[2] ?? 'samples/DYNASTY-VIRGINIA-MIDSEASON';
const teamRow = Number(process.argv[3] ?? 133);

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

console.log('== 1. Intel arithmetic (shared/scouting.ts)');
check('0 intel = 0 passes', scoutsDoneFor(0) === 0);
check('one bit = 0 passes (below the first fifth)', scoutsDoneFor(1) === 0);
check('7 bits = 2 passes (floor of 7·5/14)', scoutsDoneFor(0b1111111) === 2);
check('13 bits = 4 passes, never reported as full', scoutsDoneFor(INTEL_FULL >> 1) === SCOUTS_MAX - 1);
check('all 14 bits = 5 passes', scoutsDoneFor(INTEL_FULL) === SCOUTS_MAX);
check('isFullyScouted only at all 14 bits', isFullyScouted(INTEL_FULL) && !isFullyScouted(INTEL_FULL - 1) && !isFullyScouted(0));
check('high bits above 14 are ignored', scoutsDoneFor(1 << 20) === 0 && !isFullyScouted(1 << 20));

console.log('== 2. Veil rule');
const hs = { scouted: false, scoutsDone: 2, isTransfer: false };
check('veil off hides nothing', !veilHides(false, hs));
check('veil on hides an unscouted high-school recruit', veilHides(true, hs));
check('veil on shows a fully scouted recruit', !veilHides(true, { ...hs, scouted: true, scoutsDone: 5 }));
check('veil on leaves portal transfers open', !veilHides(true, { ...hs, isTransfer: true }));
check('non-recruits (null) are never hidden', !veilHides(true, null) && !veilHides(true, undefined));

console.log(`== 3. Extractor on ${savePath} (team row ${teamRow})`);
const franchise = await loadFranchise(savePath);
const snapshot = await extractSnapshot(franchise, { schoolTeamRow: teamRow, fileName: savePath });
const school = snapshot.school;
check('school scope resolved', !!school, school?.team.longName);
const targets = school?.board?.targets ?? [];
const cls = school?.recruiting?.recruits ?? [];
check('board has targets', targets.length > 0, `${targets.length}`);
check(
  'every target: scoutsDone within 0..5 and scouted ⇔ 5 passes',
  targets.every((t) => t.scoutsDone >= 0 && t.scoutsDone <= SCOUTS_MAX && t.scouted === (t.scoutsDone === SCOUTS_MAX))
);
check('board holds both scouted and unscouted prospects (sample assumption)',
  targets.some((t) => t.scouted) && targets.some((t) => !t.scouted),
  `${targets.filter((t) => t.scouted).length} scouted / ${targets.length}`);
const byRow = new Map(cls.map((r) => [r.row, r]));
check(
  'class recruit mirrors its board target',
  targets.every((t) => {
    const r = byRow.get(t.recruitRow);
    return !!r && r.onBoard && r.scoutsDone === t.scoutsDone && r.scouted === t.scouted;
  })
);
check('off-board recruits carry no intel', cls.every((r) => r.onBoard || (r.scoutsDone === 0 && !r.scouted)));
check(
  'target isTransfer matches the class (Recruit.Class)',
  targets.every((t) => byRow.get(t.recruitRow)?.isTransfer === t.isTransfer)
);
const hidden = cls.filter((r) => veilHides(true, r)).length;
const open = cls.length - hidden;
check('veil on: exactly the unscouted high-school recruits hide',
  hidden === cls.filter((r) => !r.isTransfer && !r.scouted).length,
  `${hidden} hidden, ${open} open of ${cls.length}`);

console.log('== 4. Media gem note honors the veil (commit story, synthetic event)');
// A baseline pass seeds few commit stories, so the writer is exercised
// directly: one committed gem recruit, with and without the user's scouting.
const gemPhrase = 'call him a gem';
const season = snapshot.season!;
const ctxBase = {
  snapshot,
  teamsByRow: new Map(snapshot.teams.map((t) => [t.row, t])),
  userRow: school!.team.row,
  userName: school!.team.longName,
  seasonYear: season.seasonYear,
  week: season.week,
  weekType: season.weekType
};
const gemRecruit = cls.find((r) => r.committedTo && r.quality === 'GEM' && !r.isTransfer);
check('sample has a committed high-school gem to write about', !!gemRecruit, gemRecruit?.name);
const storyFor = (recruit: typeof cls[number], hideUnscouted: boolean): string => {
  const ledger = makeLedger(null, season.seasonYear);
  const ev = writeArticle(
    { kind: 'commit', id: `veil-${recruit.row}`, recruit, flipFrom: null, seeded: false, ctx: { ...ctxBase, hideUnscouted } },
    ledger
  );
  return ev ? JSON.stringify(ev) : '';
};
if (gemRecruit) {
  const unscouted = { ...gemRecruit, scouted: false, scoutsDone: 1 };
  const scouted = { ...gemRecruit, scouted: true, scoutsDone: SCOUTS_MAX };
  const portal = { ...gemRecruit, scouted: false, scoutsDone: 0, isTransfer: true };
  check('veil off: gem note written for an unscouted gem', storyFor(unscouted, false).includes(gemPhrase));
  check('veil on: no gem note for an unscouted gem', !storyFor(unscouted, true).includes(gemPhrase));
  check('veil on: gem note kept once the user has scouted them', storyFor(scouted, true).includes(gemPhrase));
  check('veil on: a portal gem stays open', storyFor(portal, true).includes(gemPhrase));
}
const open1 = generateMedia(null, snapshot, null, { hideUnscouted: false }).events;
const veiled1 = generateMedia(null, snapshot, null, { hideUnscouted: true }).events;
check('full pass: same story count with or without the veil', open1.length === veiled1.length, `${open1.length}`);

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL SCOUTING VEIL CHECKS PASSED');
process.exit(failed ? 1 : 0);
