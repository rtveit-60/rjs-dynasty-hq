/**
 * BCn decoder verification harness: proves src/main/textures/bcn.ts decodes
 * byte-for-byte identically to Pillow (a reference implementation of the
 * BCn specs) across
 *   - every playcall diagram texture in the install (real BC7 + BC7-sRGB),
 *   - a sweep of stadium field art (real BC1, BC3, BC7, and mip-chain
 *     top-slice handling),
 *   - a synthetic fuzz sweep with uniform coverage of all 8 BC7 block modes
 *     plus random BC1/BC3 blocks (both color modes, both alpha modes).
 *
 * Dev-only: this is the ONE place Python/Pillow is still used — as the
 * oracle. The extraction tools themselves no longer need it.
 *
 *   node scripts/bc-check.ts
 */
import fs from 'node:fs';
import os from 'node:os';
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
import { classifyTexture, ddsWrap, decodeToRgba, type TexInfo } from './fb/texture.ts';

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-check-'));
const cases: { name: string; tex: TexInfo }[] = [];

// ---- real textures ---------------------------------------------------------
const layout = loadLayout(GAME_ROOT_DEFAULT);

async function collect(sbToc: string, matcher: RegExp, cap: number, label: string) {
  const payload = readTocPayload(path.join(layout.gameRoot, 'Data', sbToc));
  const toc = parseSuperbundleToc(payload);
  let n = 0;
  for (const bundle of toc.bundles) {
    if (n >= cap) break;
    const m = bundle.name.match(matcher);
    if (!m) continue;
    let parsed;
    try {
      parsed = parseBundle(payload, bundle, (loc) => readRawCasBytes(layout, loc));
    } catch {
      continue;
    }
    const res = parsed.assets.find((a) => a.kind === 'res' && a.location);
    const chunk = parsed.assets.find((a) => a.kind === 'chunk' && a.location);
    if (!res || !chunk) continue;
    const header = await readCasAsset(layout, res.location!, res.originalSize);
    const pixels = await readCasAsset(layout, chunk.location!, chunk.originalSize);
    const tex = classifyTexture(
      header.readUInt32LE(0x0c),
      header.readUInt16LE(0x16),
      header.readUInt16LE(0x18),
      pixels
    );
    if (!tex) continue;
    cases.push({ name: `${label}:${bundle.name.split('/').pop()}`, tex });
    n++;
  }
}

await collect(
  'Win32/imageassetlibrarysb.toc',
  /ingame\/playcall\/(?:concepts|playtype)\/assets\/.*_assetlibrary/,
  200,
  'playcall'
);
await collect(
  'Win32/stadiumswappables_sb.toc',
  /teams\/[a-z0-9_]+\/2022\/(?:endzones|midfield)\/.*_stadium_swappables_brt$/,
  60,
  'field'
);

// ---- synthetic fuzz --------------------------------------------------------
// Seeded LCG so runs are reproducible; byte 0 is forced to a chosen BC7 mode
// (bit m set, lower bits cleared) for uniform coverage of all 8 modes.
let seed = 0x1234abcd;
const rand = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
};
const randomBytes = (n: number): Buffer => {
  const b = Buffer.alloc(n);
  for (let i = 0; i < n; i++) b[i] = rand() & 0xff;
  return b;
};

function fuzzBc7(): TexInfo {
  const blocks = 4096; // 64x64 blocks = 256x256 px
  const data = Buffer.alloc(blocks * 16);
  for (let i = 0; i < blocks; i++) {
    const block = randomBytes(16);
    const mode = i % 8;
    block[0] = (block[0] & ~((1 << (mode + 1)) - 1)) | (1 << mode);
    block.copy(data, i * 16);
  }
  return { dxgi: 98, width: 256, height: 256, data };
}

function fuzzBcn(dxgi: 71 | 77, blockBytes: number): TexInfo {
  const blocks = 4096;
  return { dxgi, width: 256, height: 256, data: randomBytes(blocks * blockBytes) };
}

cases.push({ name: 'fuzz:bc7-all-modes', tex: fuzzBc7() });
cases.push({ name: 'fuzz:bc1', tex: fuzzBcn(71, 8) });
cases.push({ name: 'fuzz:bc3', tex: fuzzBcn(77, 16) });

// ---- decode both ways and compare ------------------------------------------
console.log(`${cases.length} textures (${work})`);
for (let i = 0; i < cases.length; i++) {
  fs.writeFileSync(path.join(work, `${i}.dds`), ddsWrap(cases[i].tex));
}

const py = [
  'import sys',
  'from PIL import Image',
  'for p in sys.argv[1:]:',
  '    im = Image.open(p); im.load()',
  "    open(p[:-4] + '.rgba', 'wb').write(im.convert('RGBA').tobytes())",
].join('\n');
for (let i = 0; i < cases.length; i += 50) {
  const batch = cases.slice(i, i + 50).map((_, j) => path.join(work, `${i + j}.dds`));
  const r = spawnSync('python', ['-c', py, ...batch], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('Pillow oracle failed (this harness needs python3 + Pillow>=11):');
    console.error(r.stderr || r.stdout);
    process.exit(1);
  }
}

const modeCounts = new Array(9).fill(0);
let pass = 0;
let fail = 0;
const formats = new Map<number, number>();
for (let i = 0; i < cases.length; i++) {
  const { name, tex } = cases[i];
  formats.set(tex.dxgi, (formats.get(tex.dxgi) ?? 0) + 1);
  if (tex.dxgi >= 98) {
    for (let b = 0; b < tex.data.length; b += 16) {
      const first = tex.data[b];
      let m = 0;
      while (m < 8 && ((first >> m) & 1) === 0) m++;
      modeCounts[m]++;
    }
  }
  const mine = decodeToRgba(tex);
  const ref = fs.readFileSync(path.join(work, `${i}.rgba`));
  if (mine.equals(ref)) {
    pass++;
    continue;
  }
  fail++;
  let at = -1;
  for (let j = 0; j < Math.min(mine.length, ref.length); j++) {
    if (mine[j] !== ref[j]) {
      at = j;
      break;
    }
  }
  const px = (at / 4) | 0;
  console.error(
    `MISMATCH ${name} (dxgi ${tex.dxgi} ${tex.width}x${tex.height}): first diff byte ${at} ` +
      `(px ${px % tex.width},${(px / tex.width) | 0}) mine=${mine[at]} ref=${ref[at]}`
  );
}

console.log(
  `BC7 block modes seen: ${modeCounts
    .slice(0, 8)
    .map((c, m) => `m${m}=${c}`)
    .join(' ')}${modeCounts[8] ? ` invalid=${modeCounts[8]}` : ''}`
);
console.log(`formats: ${[...formats].map(([d, c]) => `dxgi${d}×${c}`).join(' ')}`);
fs.rmSync(work, { recursive: true, force: true });
if (fail) {
  console.error(`FAIL: ${fail}/${pass + fail}`);
  process.exit(1);
}
console.log(`PASS: ${pass}/${pass} byte-identical to Pillow`);
