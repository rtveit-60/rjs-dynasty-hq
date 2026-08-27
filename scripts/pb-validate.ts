/**
 * Validate playbook geometry against known-truth plays.
 * Usage: node scripts/pb-validate.ts [bookFilter] [playFilter]
 */
import path from 'node:path';
import {
  GAME_ROOT_DEFAULT,
  loadLayout,
  readTocPayload,
  parseSuperbundleToc,
  parseBundle,
  readRawCasBytes,
  readCasAsset,
} from './fb/frostbite.ts';
import { buildPlaybook } from './fb/playbook.ts';

const bookFilter = process.argv[2] ?? 'air_raid_offense';
const playFilter = (process.argv[3] ?? 'four_verticals').toLowerCase();

const layout = loadLayout(GAME_ROOT_DEFAULT);
const payload = readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32/playbooks.toc'));
const toc = parseSuperbundleToc(payload);
const be = toc.bundles.find((b) => b.name.includes(`${bookFilter}_playbooks_brt`) && !b.name.includes('blueprint'));
if (!be) throw new Error(`no bundle for ${bookFilter}`);
const bundle = parseBundle(payload, be, (loc) => readRawCasBytes(layout, loc));
const side = bookFilter.includes('defense') ? 'defense' : 'offense';
const master = bundle.assets.find((a) => a.name.endsWith(`/college_${bookFilter.replace(`_${side}`, '')}_${side}`) || a.name.endsWith(`/${bookFilter}`));
if (!master) throw new Error('master gamesheet not found');
const ebx = await readCasAsset(layout, master.location!, master.originalSize);
const book = buildPlaybook(ebx);

console.log(`formations: ${book.formations.length}, plays: ${book.playCount}`);
console.log('families:', [...new Set(book.formations.map((f) => f.family))].join(', '));

// find the play
for (const f of book.formations) {
  const play = f.plays.find((p) => p.name.toLowerCase().replace(/[^a-z0-9]/g, '_').includes(playFilter));
  if (!play) continue;
  console.log(`\n== ${f.family} / ${f.name} / "${play.name}" ==`);
  console.log('personnel:', f.personnel.join(', '));
  console.log('base alignment (x,y):', f.alignment.map((a) => `(${a.x},${a.y})`).join(' '));
  play.routes.forEach((r, i) => {
    const a = f.alignment[i];
    const desc = r.points.map((p) => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`).join(' → ');
    console.log(`  P${i} start(${a?.x},${a?.y}) [${r.points.length}pt] ${desc}`);
  });
  break;
}
