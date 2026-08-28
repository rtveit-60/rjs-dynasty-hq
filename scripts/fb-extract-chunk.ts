/**
 * Extract one superbundle chunk by guid (prefix ok) to a file.
 * Usage: node scripts/fb-extract-chunk.ts <guidPrefix> <outFile> [--sb=<filter>]
 */
import path from 'node:path';
import fs from 'node:fs';
import {
  GAME_ROOT_DEFAULT,
  loadLayout,
  readTocPayload,
  parseSuperbundleToc,
  readRawCasBytes,
  decompressCasBlocksUnknownSize,
} from './fb/frostbite.ts';

const guidPrefix = (process.argv[2] ?? '').toLowerCase();
const outFile = process.argv[3];
const sbFilter = ((process.argv.find((a) => a.startsWith('--sb=')) ?? '').slice(5) || '').toLowerCase();
if (!guidPrefix || !outFile) throw new Error('usage: fb-extract-chunk <guidPrefix> <outFile> [--sb=…]');

const layout = loadLayout(GAME_ROOT_DEFAULT);
for (const sb of layout.superBundles) {
  if (sbFilter && !sb.toLowerCase().includes(sbFilter)) continue;
  let toc;
  try {
    toc = parseSuperbundleToc(readTocPayload(path.join(layout.gameRoot, 'Data', `${sb}.toc`)));
  } catch {
    continue;
  }
  const chunk = toc.chunks.find((c) => c.guid.toLowerCase().startsWith(guidPrefix));
  if (!chunk) continue;
  const raw = readRawCasBytes(layout, chunk.location);
  const data = await decompressCasBlocksUnknownSize(layout, raw);
  fs.writeFileSync(outFile, data);
  console.log(`${sb} guid=${chunk.guid} -> ${outFile} (${data.length} bytes)`);
  const head = data.subarray(0, 96);
  console.log(
    [...head].map((b) => b.toString(16).padStart(2, '0')).join(' ').replace(/((?:\S\S ){16})/g, '$1\n'),
  );
  console.log(JSON.stringify(String(head.toString('latin1').replace(/[^\x20-\x7e]/g, '.'))));
  process.exit(0);
}
throw new Error(`no chunk with guid starting ${guidPrefix}`);
