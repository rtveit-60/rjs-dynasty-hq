import path from 'node:path';
import zlib from 'node:zlib';
import {
  GAME_ROOT_DEFAULT, loadLayout, readTocPayload, parseSuperbundleToc,
  readRawCasBytes, decompressCasBlocksUnknownSize
} from './fb/frostbite.ts';
const layout = loadLayout(GAME_ROOT_DEFAULT);
const seen = new Set<string>();
const idHits = new Map<string, number>();
const ladders: string[] = [];

function u32seq(vals: number[]): Buffer {
  const b = Buffer.alloc(vals.length * 4);
  vals.forEach((v, i) => b.writeUInt32LE(v, i * 4));
  return b;
}
const needles: { label: string; buf: Buffer }[] = [
  { label: 'u32 50,55,60,65', buf: u32seq([50, 55, 60, 65]) },
  { label: 'u32 65,60,55,50', buf: u32seq([65, 60, 55, 50]) },
  { label: 'u8 50,55,60,65', buf: Buffer.from([50, 55, 60, 65]) },
  { label: 'u32 45,50,55,60,65', buf: u32seq([45, 50, 55, 60, 65]) }
];
const ID_RX = /[A-Za-z_][A-Za-z0-9_]{2,50}(?:Hour|hour|Budget|budget)[A-Za-z0-9_]{0,40}/g;

function scan(buf: Buffer, sb: string, guid: string, kind: string): void {
  const s = buf.toString('latin1');
  for (const m of s.matchAll(ID_RX)) {
    idHits.set(m[0], (idHits.get(m[0]) ?? 0) + 1);
  }
  for (const n of needles) {
    let at = buf.indexOf(n.buf);
    let count = 0;
    while (at >= 0 && count < 2) {
      ladders.push(`${n.label} @ ${sb} ${guid.slice(0, 8)} (${kind}) off ${at}`);
      count++;
      at = buf.indexOf(n.buf, at + 1);
    }
  }
}
for (const sb of layout.superBundles) {
  let toc;
  try { toc = parseSuperbundleToc(readTocPayload(path.join(layout.gameRoot, 'Data', `${sb}.toc`))); } catch { continue; }
  for (const chunk of toc.chunks) {
    if (seen.has(chunk.guid)) continue;
    seen.add(chunk.guid);
    if (chunk.location.size > 96 * 1024 * 1024) continue;
    let data: Buffer;
    try { data = await decompressCasBlocksUnknownSize(layout, readRawCasBytes(layout, chunk.location)); } catch { continue; }
    scan(data, sb, chunk.guid, 'raw');
    if (data.length >= 4 && data[0] === 0x78) {
      try { scan(zlib.inflateSync(data), sb, chunk.guid, 'inflated'); } catch {}
    }
  }
}
console.log('== hour/budget identifiers (count) ==');
for (const [id, n] of [...idHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ${id} x${n}`);
console.log('== value ladders ==');
for (const l of ladders.slice(0, 20)) console.log('  ' + l);
console.log(`ladder hits total: ${ladders.length}`);
