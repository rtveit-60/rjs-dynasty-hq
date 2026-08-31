/**
 * Extract the game's state-silhouette textures into resources/game-icons/
 * as state-<slug>.png (state-indiana.png, state-northcarolina.png, …).
 *
 * The art lives in Win32/imageassetlibrarysb under global/states — one
 * 512x512 BC7 texture per state (plus a USA map). The in-game team screens
 * composite the stadium mark on top at runtime; no per-team variant exists,
 * so the app shows the game's own silhouette for the school's state.
 *
 * Note the game's own filename typo: st_tennesse — normalized to tennessee.
 *
 * Output is deliberately gitignored (EA's art never enters the repo; the
 * renderer simply omits the graphic when a texture is absent). Run once per
 * machine, and after title updates (needs python3 + Pillow for BC7):
 *   node scripts/extract-state-icons.ts
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
const BC7_FORMAT = 0x42;
const FIXUPS: Record<string, string> = { tennesse: 'tennessee' };

function ddsBc7(w: number, h: number, data: Buffer): Buffer {
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
  hdr.writeUInt32LE(98, 128);
  hdr.writeUInt32LE(3, 132);
  hdr.writeUInt32LE(1, 140);
  return Buffer.concat([hdr, data]);
}

const layout = loadLayout(GAME_ROOT_DEFAULT);
const payload = readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32/imageassetlibrarysb.toc'));
const toc = parseSuperbundleToc(payload);
fs.mkdirSync(OUT_DIR, { recursive: true });

const bundles = toc.bundles.filter((b) => /\/st_[a-z]+_assetlibrary_states_brt$/.test(b.name));
if (!bundles.length) throw new Error('no global/states bundles found');
console.log(`${bundles.length} state textures`);

const ddsFiles: string[] = [];
for (const bundle of bundles) {
  const raw = bundle.name.match(/\/st_([a-z]+)_assetlibrary_states_brt$/)![1];
  const slug = FIXUPS[raw] ?? raw;
  const parsed = parseBundle(payload, bundle, (loc) => readRawCasBytes(layout, loc));
  const res = parsed.assets.find((a) => a.kind === 'res' && a.location);
  const chunk = parsed.assets.find((a) => a.kind === 'chunk' && a.location);
  if (!res || !chunk) {
    console.error(`${slug}: bundle has no texture res+chunk — skipped`);
    continue;
  }
  const header = await readCasAsset(layout, res.location!, res.originalSize);
  const format = header.readUInt32LE(0x0c);
  const width = header.readUInt16LE(0x16);
  const height = header.readUInt16LE(0x18);
  if (format !== BC7_FORMAT) {
    console.error(`${slug}: pixel format 0x${format.toString(16)} is not BC7 — skipped`);
    continue;
  }
  const pixels = await readCasAsset(layout, chunk.location!, chunk.originalSize);
  const ddsPath = path.join(OUT_DIR, `state-${slug}.dds`);
  fs.writeFileSync(ddsPath, ddsBc7(width, height, pixels));
  ddsFiles.push(ddsPath);
}

if (ddsFiles.length) {
  const py = [
    'import sys',
    'from PIL import Image',
    'for p in sys.argv[1:]:',
    '    im = Image.open(p); im.load()',
    "    im.save(p[:-4] + '.png')",
  ].join('\n');
  const r = spawnSync('python', ['-c', py, ...ddsFiles], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('python/Pillow conversion failed (dev dependency: python3 + Pillow>=11):');
    console.error(r.stderr || r.stdout);
    process.exit(1);
  }
  for (const f of ddsFiles) fs.rmSync(f);
  console.log(`wrote ${ddsFiles.length} PNGs into ${OUT_DIR}`);
}
console.log('done');
