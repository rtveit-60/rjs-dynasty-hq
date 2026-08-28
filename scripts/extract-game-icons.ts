/**
 * Extract UI icon textures from the installed game into resources/game-icons/.
 *
 * The icons live in Win32/imageassetlibrarysb: each icon bundle carries an ebx
 * manifest, a 184-byte texture-header res (width/height at 0x16/0x18, pixel
 * format at 0x0C — 0x42 = BC7), and a chunk with the block-compressed pixels.
 * We wrap the chunk in a DDS header and let Pillow (python3 + PIL, dev-only
 * dependency) decode BC7 to PNG.
 *
 * Output is deliberately gitignored: these are EA's own textures, extracted
 * from the user's install for personal use — the public repo ships only this
 * script and an SVG fallback. Run once per machine (and after title updates):
 *   node scripts/extract-game-icons.ts
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

/** output name -> unique substring of the icon's bundle name. */
const ICONS: Record<string, string> = {
  'pipeline-pin': 'dynas_general_pipeline_empty',
};

const OUT_DIR = 'resources/game-icons';
const BC7_FORMAT = 0x42;

function ddsBc7(w: number, h: number, data: Buffer): Buffer {
  const hdr = Buffer.alloc(148);
  hdr.write('DDS ', 0, 'latin1');
  hdr.writeUInt32LE(124, 4); // header size
  hdr.writeUInt32LE(0x81007, 8); // caps|height|width|pixelformat|linearsize
  hdr.writeUInt32LE(h, 12);
  hdr.writeUInt32LE(w, 16);
  hdr.writeUInt32LE(data.length, 20);
  hdr.writeUInt32LE(1, 28); // mip count
  hdr.writeUInt32LE(32, 76); // pixelformat size
  hdr.writeUInt32LE(0x4, 80); // fourcc flag
  hdr.write('DX10', 84, 'latin1');
  hdr.writeUInt32LE(0x1000, 108); // caps: texture
  hdr.writeUInt32LE(98, 128); // DXGI_FORMAT_BC7_UNORM
  hdr.writeUInt32LE(3, 132); // texture2d
  hdr.writeUInt32LE(1, 140); // array size
  return Buffer.concat([hdr, data]);
}

const layout = loadLayout(GAME_ROOT_DEFAULT);
const payload = readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32/imageassetlibrarysb.toc'));
const toc = parseSuperbundleToc(payload);
fs.mkdirSync(OUT_DIR, { recursive: true });

const ddsFiles: string[] = [];
for (const [outName, needle] of Object.entries(ICONS)) {
  const bundle = toc.bundles.find((b) => b.name.includes(needle));
  if (!bundle) {
    console.error(`${outName}: no bundle matching "${needle}" — skipped`);
    continue;
  }
  const parsed = parseBundle(payload, bundle, (loc) => readRawCasBytes(layout, loc));
  const res = parsed.assets.find((a) => a.kind === 'res' && a.location);
  const chunk = parsed.assets.find((a) => a.kind === 'chunk' && a.location);
  if (!res || !chunk) {
    console.error(`${outName}: bundle has no texture res+chunk — skipped`);
    continue;
  }
  const header = await readCasAsset(layout, res.location!, res.originalSize);
  const format = header.readUInt32LE(0x0c);
  const width = header.readUInt16LE(0x16);
  const height = header.readUInt16LE(0x18);
  if (format !== BC7_FORMAT) {
    console.error(`${outName}: pixel format 0x${format.toString(16)} is not BC7 — skipped (extend the script)`);
    continue;
  }
  const pixels = await readCasAsset(layout, chunk.location!, chunk.originalSize);
  const ddsPath = path.join(OUT_DIR, `${outName}.dds`);
  fs.writeFileSync(ddsPath, ddsBc7(width, height, pixels));
  ddsFiles.push(ddsPath);
  console.log(`${outName}: ${width}x${height} BC7, ${pixels.length} bytes`);
}

if (ddsFiles.length) {
  const py = [
    'import sys',
    'from PIL import Image',
    'for p in sys.argv[1:]:',
    '    im = Image.open(p); im.load()',
    "    im.save(p[:-4] + '.png')",
    "    print('wrote', p[:-4] + '.png', im.size)",
  ].join('\n');
  const r = spawnSync('python', ['-c', py, ...ddsFiles], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('python/Pillow conversion failed (dev dependency: python3 + Pillow>=11):');
    console.error(r.stderr || r.stdout);
    process.exit(1);
  }
  process.stdout.write(r.stdout);
  for (const f of ddsFiles) fs.rmSync(f);
}
console.log('done');
