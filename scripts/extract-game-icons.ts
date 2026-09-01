/**
 * Extract UI icon textures from the installed game into resources/game-icons/.
 *
 * The icons live in Win32/imageassetlibrarysb: each icon bundle carries an ebx
 * manifest, a 184-byte texture-header res (width/height at 0x16/0x18, pixel
 * format at 0x0C — 0x42 = BC7), and a chunk with the block-compressed pixels,
 * decoded by the app's own TypeScript (no Python needed).
 *
 * Output is deliberately gitignored: these are EA's own textures, extracted
 * from the user's install for personal use — the public repo ships only this
 * script and an SVG fallback. Run once per machine (and after title updates):
 *   node scripts/extract-game-icons.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  GAME_ROOT_DEFAULT,
  loadLayout,
  readTocPayload,
  parseSuperbundleToc,
  parseBundle,
  readRawCasBytes,
  readCasAsset,
} from './fb/frostbite.ts';
import { classifyTexture, texturePng } from './fb/texture.ts';

/** output name -> unique substring of the icon's bundle name. */
const ICONS: Record<string, string> = {
  'pipeline-pin': 'dynas_general_pipeline_empty',
};

const OUT_DIR = 'resources/game-icons';

const layout = loadLayout(GAME_ROOT_DEFAULT);
const payload = readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32/imageassetlibrarysb.toc'));
const toc = parseSuperbundleToc(payload);
fs.mkdirSync(OUT_DIR, { recursive: true });

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
  const pixels = await readCasAsset(layout, chunk.location!, chunk.originalSize);
  const tex = classifyTexture(
    header.readUInt32LE(0x0c),
    header.readUInt16LE(0x16),
    header.readUInt16LE(0x18),
    pixels
  );
  if (!tex || tex.dxgi < 98) {
    console.error(`${outName}: not a BC7 texture — skipped (extend the script)`);
    continue;
  }
  fs.writeFileSync(path.join(OUT_DIR, `${outName}.png`), texturePng(tex));
  console.log(`${outName}: ${tex.width}x${tex.height} BC7 -> png`);
}
console.log('done');
