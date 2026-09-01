/**
 * Extract each team's authentic field paint from the game's stadium
 * swappables — the painted end zones (north/south) and the midfield art —
 * into resources/game-icons/ as:
 *   field-<slug>-ezn.png   field-<slug>-ezs.png   field-<slug>-mid.png
 * (slug = the game's own team folder name with underscores dashed:
 *  teams/notre_dame/2022/... -> field-notre-dame-*.png)
 *
 * Textures are BC7 (0x42) or BC7-sRGB (0x43); end zones ship 2048x256.
 * Output is deliberately gitignored (EA's art never enters the repo — the
 * field graphic falls back to drawn team-color end zones when art is
 * absent). Run once per machine, and after title updates (python3+Pillow):
 *   node scripts/extract-field-art.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  GAME_ROOT_DEFAULT,
  loadLayout,
  readTocPayload,
  parseSuperbundleToc,
  parseBundle,
  readRawCasBytes,
  readCasAsset,
} from './fb/frostbite.ts';

const OUT_DIR = 'resources/game-icons';
const KINDS: Record<string, string> = { ez_north: 'ezn', ez_south: 'ezs', midfield_color: 'mid' };

function ddsBc7(w: number, h: number, dxgi: number, data: Buffer): Buffer {
  const hdr = Buffer.alloc(148);
  hdr.write('DDS ', 0, 'latin1');
  hdr.writeUInt32LE(124, 4);
  hdr.writeUInt32LE(0x81007, 8);
  hdr.writeUInt32LE(h, 12);
  hdr.writeUInt32LE(w, 16);
  hdr.writeUInt32LE(data.length, 20);
  hdr.writeUInt32LE(1, 28);
  hdr.writeUInt32LE(32, 76);
  hdr.writeUInt32LE(0x4, 80);
  hdr.write('DX10', 84, 'latin1');
  hdr.writeUInt32LE(0x1000, 108);
  hdr.writeUInt32LE(dxgi, 128);
  hdr.writeUInt32LE(3, 132);
  hdr.writeUInt32LE(1, 140);
  return Buffer.concat([hdr, data]);
}

const layout = loadLayout(GAME_ROOT_DEFAULT);
const payload = readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32/stadiumswappables_sb.toc'));
const toc = parseSuperbundleToc(payload);
fs.mkdirSync(OUT_DIR, { recursive: true });

const ddsFiles: string[] = [];
let skipped = 0;
const teams = new Set<string>();
for (const bundle of toc.bundles) {
  const m = bundle.name.match(
    /teams\/([a-z0-9_]+)\/2022\/(?:endzones|midfield)\/[a-z0-9_]*_(ez_north|ez_south|midfield_color)_stadium_swappables_brt$/
  );
  if (!m) continue;
  const slug = m[1].replace(/_/g, '-');
  const kind = KINDS[m[2]];
  teams.add(slug);
  const outBase = `field-${slug}-${kind}`;
  if (fs.existsSync(path.join(OUT_DIR, `${outBase}.png`))) continue;
  let parsed;
  try {
    parsed = parseBundle(payload, bundle, (loc) => readRawCasBytes(layout, loc));
  } catch {
    skipped++;
    continue;
  }
  const res = parsed.assets.find((a) => a.kind === 'res' && a.location);
  const chunk = parsed.assets.find((a) => a.kind === 'chunk' && a.location);
  if (!res || !chunk) {
    skipped++;
    continue;
  }
  const header = await readCasAsset(layout, res.location!, res.originalSize);
  const format = header.readUInt32LE(0x0c);
  const width = header.readUInt16LE(0x16);
  const height = header.readUInt16LE(0x18);
  const pixels = await readCasAsset(layout, chunk.location!, chunk.originalSize);
  // BC7 carries its format id; everything else is inferred from bytes/pixel
  // (BC1 packs half a byte per pixel, BC3 a full byte).
  let dxgi: number | null = null;
  let data = pixels;
  const bc3 = width * height;
  const bc1 = bc3 / 2;
  if (format === 0x42) dxgi = 98;
  else if (format === 0x43) dxgi = 99;
  else if (pixels.length === bc1) dxgi = 71;
  else if (pixels.length === bc3) dxgi = 77;
  else if (pixels.length > bc3 && pixels.length < bc3 * 1.4) {
    // full mip chain — keep the top mip only
    dxgi = 77;
    data = pixels.subarray(0, bc3);
  } else if (pixels.length > bc1 && pixels.length < bc1 * 1.4) {
    dxgi = 71;
    data = pixels.subarray(0, bc1);
  }
  if (dxgi === null) {
    console.error(
      `${outBase}: format 0x${format.toString(16)} with ${pixels.length}b for ${width}x${height} — skipped`
    );
    skipped++;
    continue;
  }
  const p = path.join(OUT_DIR, `${outBase}.dds`);
  fs.writeFileSync(p, ddsBc7(width, height, dxgi, data));
  ddsFiles.push(p);
}

console.log(`${teams.size} teams, ${ddsFiles.length} textures to decode, ${skipped} skipped`);
const py = [
  'import sys',
  'from PIL import Image',
  'for p in sys.argv[1:]:',
  '    im = Image.open(p); im.load()',
  "    im.save(p[:-4] + '.png')",
].join('\n');
for (let i = 0; i < ddsFiles.length; i += 50) {
  const batch = ddsFiles.slice(i, i + 50);
  const r = spawnSync('python', ['-c', py, ...batch], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('python/Pillow conversion failed (dev dependency: python3 + Pillow>=11):');
    console.error(r.stderr || r.stdout);
    process.exit(1);
  }
  for (const f of batch) fs.rmSync(f);
}
console.log('slugs:', [...teams].sort().join(' '));
console.log('done');
