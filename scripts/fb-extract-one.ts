/**
 * Probe: extract a single named asset from a superbundle and hexdump its head.
 * Usage: node scripts/fb-extract-one.ts <superbundle> <bundleFilter> <assetFilter> [outFile]
 */
import path from 'node:path';
import fs from 'node:fs';
import {
  GAME_ROOT_DEFAULT,
  loadLayout,
  readTocPayload,
  parseSuperbundleToc,
  parseBundle,
  readRawCasBytes,
  readCasAsset,
} from './fb/frostbite.ts';

const sbName = process.argv[2] ?? 'Win32/playbooks';
const bundleFilter = (process.argv[3] ?? 'air_raid').toLowerCase();
const assetFilter = (process.argv[4] ?? '').toLowerCase();
const outFile = process.argv[5];

const layout = loadLayout(GAME_ROOT_DEFAULT);
const payload = readTocPayload(path.join(layout.gameRoot, 'Data', `${sbName}.toc`));
const toc = parseSuperbundleToc(payload);
const bundleEntry = toc.bundles.find((b) => b.name.toLowerCase().includes(bundleFilter));
if (!bundleEntry) throw new Error(`no bundle matching ${bundleFilter}`);
console.log(`bundle: ${bundleEntry.name}`);
const bundle = parseBundle(payload, bundleEntry, (loc) => readRawCasBytes(layout, loc));
const asset = bundle.assets.find((a) => a.name.toLowerCase().includes(assetFilter));
if (!asset) {
  console.log(`no asset matching "${assetFilter}"; sample:`);
  for (const a of bundle.assets.slice(0, 10)) console.log(`  ${a.kind} ${a.name}`);
  process.exit(1);
}
console.log(`asset: [${asset.kind}] ${asset.name} orig=${asset.originalSize}`);
const data = await readCasAsset(layout, asset.location!, asset.originalSize);
console.log(`extracted ${data.length} bytes`);
if (outFile) {
  fs.writeFileSync(outFile, data);
  console.log(`wrote ${outFile}`);
}
const dumpLen = Math.min(data.length, 0x300);
for (let off = 0; off < dumpLen; off += 16) {
  const slice = data.subarray(off, off + 16);
  const hex = [...slice].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  const ascii = [...slice].map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
  console.log(`${off.toString(16).padStart(6, '0')}  ${hex.padEnd(47)}  ${ascii}`);
}
