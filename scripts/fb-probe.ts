/**
 * Probe: enumerate Frostbite containers in the CFB 27 install.
 * Usage: node scripts/fb-probe.ts [superbundle=Win32/playbooks] [filter]
 */
import path from 'node:path';
import {
  GAME_ROOT_DEFAULT,
  loadLayout,
  readTocPayload,
  parseSuperbundleToc,
  parseBundle,
  readRawCasBytes,
} from './fb/frostbite.ts';

const sbName = process.argv[2] ?? 'Win32/playbooks';
const filter = (process.argv[3] ?? '').toLowerCase();

const layout = loadLayout(GAME_ROOT_DEFAULT);
console.log(`layout head: ${layout.head}`);
console.log(`superbundles (${layout.superBundles.length}):`);
for (const sb of layout.superBundles) console.log(`  ${sb}`);
console.log(`install chunks (${layout.installChunks.size}):`);
for (const [idx, ic] of layout.installChunks) {
  console.log(`  [${idx}] ${ic.name} -> ${ic.installBundle}`);
}

const tocPath = path.join(layout.gameRoot, 'Data', `${sbName}.toc`);
console.log(`\n== ${sbName} ==`);
const payload = readTocPayload(tocPath);
const toc = parseSuperbundleToc(payload);
console.log(`bundles: ${toc.bundles.length}, chunks: ${toc.chunks.length}`);
for (const b of toc.bundles.slice(0, 1000)) {
  if (filter && !b.name.toLowerCase().includes(filter)) continue;
  console.log(`  [flag ${b.loadFlag}] ${b.name} @${b.offset} +${b.size}`);
}

// Parse a bundle fully as a smoke test (first match of the filter, else first bundle)
const detail = filter ? toc.bundles.find((b) => b.name.toLowerCase().includes(filter)) : toc.bundles[0];
if (detail) {
  const b = detail;
  console.log(`\n== bundle detail: ${b.name} ==`);
  const parsed = parseBundle(payload, b, (loc) => readRawCasBytes(layout, loc));
  for (const a of parsed.assets.slice(0, 60)) {
    const loc = a.location
      ? `ic${a.location.ident.installChunkIndex}/cas_${a.location.ident.casIndex} @${a.location.offset} +${a.location.size}${a.location.ident.isPatch ? ' PATCH' : ''}`
      : '(no location)';
    console.log(
      `  ${a.kind.padEnd(5)} ${a.name} orig=${a.originalSize}${a.resType !== undefined ? ` resType=0x${a.resType.toString(16)}` : ''} ${loc}`,
    );
  }
  if (parsed.assets.length > 60) console.log(`  ... ${parsed.assets.length - 60} more`);
}
