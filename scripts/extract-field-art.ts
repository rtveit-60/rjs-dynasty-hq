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
 * absent). Run once per machine, and after title updates (decoding is in-process TypeScript):
 *   node scripts/extract-field-art.ts
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
const KINDS: Record<string, string> = { ez_north: 'ezn', ez_south: 'ezs', midfield_color: 'mid' };

const layout = loadLayout(GAME_ROOT_DEFAULT);
const payload = readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32/stadiumswappables_sb.toc'));
const toc = parseSuperbundleToc(payload);
fs.mkdirSync(OUT_DIR, { recursive: true });

let written = 0;
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
  const tex = classifyTexture(format, width, height, pixels);
  if (!tex) {
    console.error(
      `${outBase}: format 0x${format.toString(16)} with ${pixels.length}b for ${width}x${height} — skipped`
    );
    skipped++;
    continue;
  }
  fs.writeFileSync(path.join(OUT_DIR, `${outBase}.png`), texturePng(tex));
  written++;
}

console.log(`${teams.size} teams, ${written} textures decoded, ${skipped} skipped`);
console.log('slugs:', [...teams].sort().join(' '));
console.log('done');
