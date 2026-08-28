/**
 * Locate the game's FTC data containers inside superbundle chunks and list the
 * tables each one holds.
 *
 * An FTC container starts with 'DB' and carries a directory of 8-byte entries:
 * a reversed 4-char table tag plus a big-endian offset. These hold the data the
 * save only references — city names, stadiums, trophies, coach contract goals.
 *
 * Usage: node scripts/fb-find-ftc.ts [--sb=<filter>] [--tag=XXXX] [--cap=64]
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

const arg = (n: string, d: string) =>
  (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split('=').slice(1).join('=');
const sbFilter = arg('sb', '').toLowerCase();
const wantTag = arg('tag', '').toUpperCase();
const capMb = Number(arg('cap', '64'));

const rev = (s: string) => s.split('').reverse().join('');

/** Parse the table directory if this blob looks like an FTC container. */
export function ftcTables(buf: Buffer): { tag: string; off: number }[] | null {
  if (buf.length < 0x20 || buf.subarray(0, 2).toString('latin1') !== 'DB') return null;
  const out: { tag: string; off: number }[] = [];
  let p = 0x18;
  while (p + 8 <= buf.length) {
    const raw = buf.subarray(p, p + 4).toString('latin1');
    if (!/^[A-Z0-9]{4}$/.test(raw)) break;
    const off = buf.readUInt32BE(p + 4);
    if (off > buf.length) break;
    out.push({ tag: rev(raw), off });
    p += 8;
  }
  return out.length >= 4 ? out : null;
}

const layout = loadLayout(GAME_ROOT_DEFAULT);
const seen = new Set<string>();
let containers = 0;
let scanned = 0;

for (const sb of layout.superBundles) {
  if (sbFilter && !sb.toLowerCase().includes(sbFilter)) continue;
  let toc;
  try {
    toc = parseSuperbundleToc(readTocPayload(path.join(layout.gameRoot, 'Data', `${sb}.toc`)));
  } catch {
    continue;
  }
  for (const chunk of toc.chunks) {
    if (seen.has(chunk.guid)) continue;
    seen.add(chunk.guid);
    if (chunk.location.size > capMb * 1024 * 1024) continue;
    let data: Buffer;
    try {
      data = await decompressCasBlocksUnknownSize(layout, readRawCasBytes(layout, chunk.location));
    } catch {
      continue;
    }
    scanned++;
    const tables = ftcTables(data);
    if (!tables) continue;
    if (wantTag && !tables.some((t) => t.tag === wantTag)) continue;
    containers++;
    console.log(
      `\nFTC ${sb} guid=${chunk.guid} (${data.length}b, ${tables.length} tables, cas ic${chunk.location.ident.installChunkIndex}/cas_${chunk.location.ident.casIndex})`,
    );
    console.log('  ' + tables.map((t, i) => `${i}:${t.tag}`).join('  '));
  }
}
console.log(`\n${containers} FTC container(s) across ${scanned} chunks scanned`);
