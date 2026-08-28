/**
 * Bulk-scan superbundle CHUNKS (the unnamed blobs) for text fingerprints.
 * This is how data that no named asset points at — franchise tables, the AD
 * goal wording, city names — gets located.
 *
 * Usage:
 *   node scripts/fb-scan-chunks.ts [--sb=<filter>] [--needles=a,b,c] [--cap=64] [--hex]
 *
 * Searches each decompressed chunk for every needle, in ASCII and UTF-16LE.
 * Prints a context excerpt per hit plus the chunk's guid/location so a later
 * script can extract the same chunk directly.
 */
import path from 'node:path';
import {
  GAME_ROOT_DEFAULT,
  loadLayout,
  readTocPayload,
  parseSuperbundleToc,
  readRawCasBytes,
  decompressCasBlocksUnknownSize,
} from './fb/frostbite.ts';

const arg = (name: string, dflt: string) =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${dflt}`).split('=').slice(1).join('=');

const sbFilter = arg('sb', '').toLowerCase();
const needles = arg('needles', 'South Bend,Hot Seat').split(',').map((s) => s.trim()).filter(Boolean);
const capMb = Number(arg('cap', '64'));
const showHex = process.argv.includes('--hex');

const layout = loadLayout(GAME_ROOT_DEFAULT);

/** ASCII + UTF-16LE byte patterns for one needle. */
function patterns(needle: string): { label: string; buf: Buffer }[] {
  return [
    { label: 'ascii', buf: Buffer.from(needle, 'latin1') },
    { label: 'utf16', buf: Buffer.from(needle, 'utf16le') },
  ];
}

const printable = (b: number) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : b === 0 ? '' : '.');

function context(buf: Buffer, at: number, utf16: boolean): string {
  const from = Math.max(0, at - 70);
  const to = Math.min(buf.length, at + 130);
  const slice = buf.subarray(from, to);
  if (utf16) {
    let s = '';
    for (let i = 0; i + 1 < slice.length; i += 2) {
      const c = slice.readUInt16LE(i);
      s += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : c === 0 ? '¦' : '.';
    }
    return s;
  }
  return [...slice].map(printable).join('');
}

let scanned = 0;
let bytes = 0;
let skippedBig = 0;
let failed = 0;
let hits = 0;
const seenGuids = new Set<string>();
const t0 = Date.now();

for (const sb of layout.superBundles) {
  if (sbFilter && !sb.toLowerCase().includes(sbFilter)) continue;
  let toc;
  try {
    toc = parseSuperbundleToc(readTocPayload(path.join(layout.gameRoot, 'Data', `${sb}.toc`)));
  } catch (e: any) {
    console.log(`! ${sb}: ${e?.message}`);
    continue;
  }
  if (!toc.chunks.length) continue;
  console.log(`\n== ${sb}: ${toc.chunks.length} chunks ==`);

  for (const chunk of toc.chunks) {
    if (seenGuids.has(chunk.guid)) continue;
    seenGuids.add(chunk.guid);
    if (chunk.location.size > capMb * 1024 * 1024) {
      skippedBig++;
      continue;
    }
    let data: Buffer;
    try {
      const raw = readRawCasBytes(layout, chunk.location);
      data = await decompressCasBlocksUnknownSize(layout, raw);
    } catch {
      failed++;
      continue;
    }
    scanned++;
    bytes += data.length;
    if (scanned % 250 === 0) {
      console.log(
        `  …${scanned} chunks, ${(bytes / 1e9).toFixed(2)} GB decompressed, ${Math.round((Date.now() - t0) / 1000)}s`,
      );
    }
    for (const needle of needles) {
      for (const { label, buf } of patterns(needle)) {
        let at = data.indexOf(buf);
        let per = 0;
        while (at >= 0 && per < 3) {
          hits++;
          per++;
          console.log(
            `HIT [${needle}|${label}] ${sb} guid=${chunk.guid} @${at} (chunk ${data.length}b, cas ic${chunk.location.ident.installChunkIndex}/cas_${chunk.location.ident.casIndex} off ${chunk.location.offset} sz ${chunk.location.size})`,
          );
          console.log(`    …${context(data, at, label === 'utf16')}…`);
          if (showHex) {
            const s = data.subarray(Math.max(0, at - 16), at + 48);
            console.log(`    ${[...s].map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);
          }
          at = data.indexOf(buf, at + buf.length);
        }
      }
    }
  }
}

console.log(
  `\nscanned ${scanned} chunks (${(bytes / 1e9).toFixed(2)} GB decompressed), skipped ${skippedBig} over ${capMb}MB, ${failed} failed, ${hits} hits, ${Math.round((Date.now() - t0) / 1000)}s`,
);
