import path from 'node:path';
import zlib from 'node:zlib';
import {
  GAME_ROOT_DEFAULT, loadLayout, readTocPayload, parseSuperbundleToc,
  readRawCasBytes, decompressCasBlocksUnknownSize
} from './fb/frostbite.ts';
const layout = loadLayout(GAME_ROOT_DEFAULT);
const RX_FMT = /"slotType":\s*"([A-Za-z]+)",\s*"itemAssetName":\s*"([^"]{1,64})"/g;
const freq = new Map<string, Map<string, number>>();
const seen = new Set<string>();
function harvest(s: string): void {
  for (const block of s.split(/"loadoutElements"/)) {
    let helmet: string | null = null;
    let mask: string | null = null;
    for (const m of block.matchAll(RX_FMT)) {
      if (m[1] === 'HeadWear') helmet = m[2];
      if (m[1] === 'FaceMask') mask = m[2];
    }
    if (helmet && mask) {
      if (!freq.has(helmet)) freq.set(helmet, new Map());
      freq.get(helmet)!.set(mask, (freq.get(helmet)!.get(mask) ?? 0) + 1);
    }
  }
}
for (const sb of layout.superBundles) {
  let toc; try { toc = parseSuperbundleToc(readTocPayload(path.join(layout.gameRoot, 'Data', `${sb}.toc`))); } catch { continue; }
  for (const chunk of toc.chunks) {
    if (seen.has(chunk.guid)) continue;
    seen.add(chunk.guid);
    if (chunk.location.size > 96 * 1024 * 1024) continue;
    let data: Buffer;
    try { data = await decompressCasBlocksUnknownSize(layout, readRawCasBytes(layout, chunk.location)); } catch { continue; }
    if (data.includes('itemAssetName')) harvest(data.toString('latin1'));
    if (data.length >= 4 && data[0] === 0x78) {
      try { const im = zlib.inflateSync(data); if (im.includes('itemAssetName')) harvest(im.toString('latin1')); } catch {}
    }
  }
}
for (const [h, masks] of [...freq.entries()].sort()) {
  const top = [...masks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  console.log(`${h}: ${top.map(([m, n]) => `${m}×${n}`).join('  ')}`);
}
