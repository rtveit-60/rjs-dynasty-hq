/**
 * Probe: search every superbundle for bundles/assets whose name matches a term.
 * Usage: node scripts/fb-find-asset.ts <term> [--assets]
 *
 * Without --assets it only reads each superbundle TOC (fast, bundle names only).
 * With --assets it also parses each bundle's asset list (slow but thorough).
 */
import path from 'node:path';
import {
  GAME_ROOT_DEFAULT,
  loadLayout,
  readTocPayload,
  parseSuperbundleToc,
  parseBundle,
  readRawCasBytes
} from './fb/frostbite.ts';

const term = (process.argv[2] ?? 'goal').toLowerCase();
const deep = process.argv.includes('--assets');

const layout = loadLayout(GAME_ROOT_DEFAULT);
let bundleHits = 0;
let assetHits = 0;

for (const sb of layout.superBundles) {
  const tocPath = path.join(layout.gameRoot, 'Data', `${sb}.toc`);
  let toc;
  try {
    toc = parseSuperbundleToc(readTocPayload(tocPath));
  } catch (e: any) {
    console.log(`! ${sb}: ${e?.message}`);
    continue;
  }

  for (const b of toc.bundles) {
    if (b.name.toLowerCase().includes(term)) {
      console.log(`BUNDLE  ${sb}  ::  ${b.name}`);
      bundleHits++;
    }
  }

  if (!deep) continue;
  for (const b of toc.bundles) {
    let parsed;
    try {
      parsed = parseBundle(readTocPayload(tocPath), b, (loc) => readRawCasBytes(layout, loc));
    } catch {
      continue;
    }
    for (const a of parsed.assets) {
      if (a.name.toLowerCase().includes(term)) {
        console.log(`ASSET   ${sb}  ::  ${b.name}  ::  [${a.kind}] ${a.name}`);
        assetHits++;
      }
    }
  }
}

console.log(`\n"${term}": ${bundleHits} bundle name hit(s)${deep ? `, ${assetHits} asset hit(s)` : ''}`);
