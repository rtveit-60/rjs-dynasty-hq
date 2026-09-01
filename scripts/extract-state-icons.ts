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
 * renderer simply omits the graphic when a texture is absent). Decoding is
 * the app's own TypeScript (no Python needed). Run once per machine, and
 * after title updates:
 *   node scripts/extract-state-icons.ts
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

const OUT_DIR = 'resources/game-icons';
const FIXUPS: Record<string, string> = { tennesse: 'tennessee' };

const layout = loadLayout(GAME_ROOT_DEFAULT);
const payload = readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32/imageassetlibrarysb.toc'));
const toc = parseSuperbundleToc(payload);
fs.mkdirSync(OUT_DIR, { recursive: true });

const bundles = toc.bundles.filter((b) => /\/st_[a-z]+_assetlibrary_states_brt$/.test(b.name));
if (!bundles.length) throw new Error('no global/states bundles found');
console.log(`${bundles.length} state textures`);

let written = 0;
let failed = 0;
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
  const pixels = await readCasAsset(layout, chunk.location!, chunk.originalSize);
  const tex = classifyTexture(
    header.readUInt32LE(0x0c),
    header.readUInt16LE(0x16),
    header.readUInt16LE(0x18),
    pixels
  );
  if (!tex || tex.dxgi < 98) {
    console.error(`${slug}: not a BC7 texture — skipped`);
    continue;
  }
  try {
    fs.writeFileSync(path.join(OUT_DIR, `state-${slug}.png`), texturePng(tex, `state-${slug}`));
    written++;
  } catch (err) {
    failed++;
    console.error(err instanceof Error ? err.message : String(err));
  }
}

console.log(`wrote ${written} PNGs into ${OUT_DIR}${failed ? `, ${failed} failed` : ''}`);
if (failed) process.exitCode = 1;
console.log('done');
