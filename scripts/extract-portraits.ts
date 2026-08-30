/**
 * Extract player portraits from the installed game for the players in a save.
 *
 * Every player's portrait asset is named by Player.GenericHeadAssetName
 * ("Generic_0877_P_T0042_H_6_3" or "Unique_SyPape_6133"), which lowercases
 * into an imageassetlibrary bundle:
 *   win32/.../nilpp_<lower(name)>_assetlibrary_nil_playerportraits_brt
 * Each bundle is a texture-header res (BC7, 512x512) plus a pixel chunk —
 * the same layout extract-game-icons.ts decodes. PLYR_PORTRAIT is NOT a
 * reliable key (unique players' ids often differ from their asset id); it is
 * only used to NAME the output file, because the app's portrait://<id>
 * protocol resolves portraits by that id.
 *
 * Output PNGs are for the user's own machine (EA's art never enters the
 * repo). Conversion needs python3 + Pillow (BC7 decode), dev/power-user only
 * until an in-app decoder lands.
 *
 * Usage:
 *   node scripts/extract-portraits.ts <save> <outDir> [--team <TeamIndex>] [--recruits] [--all] [--size <px>]
 * Default scope is --team of the save's user-controlled program; --recruits
 * adds the whole recruiting class (marked by a live IdealRecruitingPitch —
 * recruits draw from the generic pool, verified pid→asset is one-to-one).
 * Every named coach is always included (Coach.GenericHeadAssetName →
 * nilcp bundle, incl. generated coaches from the generic coach pool), written
 * as c<Coach.Portrait>.png — their own namespace, since coach portrait ids
 * overlap player ids.
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
  readCasAsset
} from './fb/frostbite.ts';
import { loadFranchise, mainTable, val } from '../src/main/parser/franchise.ts';
import { ensureCoachSchema } from '../src/main/parser/coach-schema.ts';

const args = process.argv.slice(2);
const savePath = args[0];
const outDir = args[1];
if (!savePath || !outDir) {
  console.error('usage: node scripts/extract-portraits.ts <save> <outDir> [--team <TeamIndex>] [--all] [--size <px>]');
  process.exit(1);
}
const all = args.includes('--all');
const wantRecruits = args.includes('--recruits');
const teamArg = args.includes('--team') ? Number(args[args.indexOf('--team') + 1]) : null;
const size = args.includes('--size') ? Number(args[args.indexOf('--size') + 1]) : 256;

const BC7_FORMAT = 0x42;

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

// ---- 1. The save: who needs a portrait, keyed how ----
const fr = await loadFranchise(savePath);
const player = mainTable(fr, 'Player');
await player.readRecords([
  'FirstName',
  'LastName',
  'PLYR_PORTRAIT',
  'GenericHeadAssetName',
  'TeamIndex',
  'IdealRecruitingPitch'
]);

const coach = mainTable(fr, 'Coach');
const coachReadable = await ensureCoachSchema(fr, coach);
if (coachReadable) {
  await coach.readRecords([
    'FirstName',
    'LastName',
    'TeamIndex',
    'IsUserControlled',
    'Portrait',
    'GenericHeadAssetName'
  ]);
}

let teamIndex = teamArg;
if (teamIndex === null && !all) {
  if (coachReadable) {
    for (const rec of coach.records) {
      if (rec.isEmpty) continue;
      if (val(rec, 'IsUserControlled') === true) {
        teamIndex = Number(val(rec, 'TeamIndex'));
        break;
      }
    }
  }
  if (teamIndex === null) {
    console.error('no user-controlled team found — pass --team <TeamIndex> or --all');
    process.exit(1);
  }
  console.log(`scope: user team (TeamIndex ${teamIndex}); pass --all for the whole league`);
}

interface Want {
  /** Output file stem: the player's portrait id, or c<id> for coaches. */
  file: string;
  /** Bundle key: nilpp_/nilcp_ + lowercased asset name. */
  key: string;
  name: string;
}
const wants: Want[] = [];
for (const rec of player.records as any[]) {
  if (rec.isEmpty) continue;
  const name = `${String(val(rec, 'FirstName') ?? '').trim()} ${String(val(rec, 'LastName') ?? '').trim()}`.trim();
  if (!name) continue;
  if (!all) {
    const onTeam = Number(val(rec, 'TeamIndex')) === teamIndex;
    const isRecruit = !/^Invalid/.test(String(val(rec, 'IdealRecruitingPitch') ?? 'Invalid'));
    if (!(onTeam || (wantRecruits && isRecruit))) continue;
  }
  const asset = String(val(rec, 'GenericHeadAssetName') ?? '').trim();
  const pid = Number(val(rec, 'PLYR_PORTRAIT'));
  if (!asset || !Number.isInteger(pid) || pid < 0) continue;
  wants.push({ file: String(pid), key: `nilpp_${asset.toLowerCase()}`, name });
}
console.log(`players in scope with a portrait asset: ${wants.length}`);

// Coaches: always all of them — the carousel and profiles are league-wide and
// the whole set is a few hundred bundles.
let coachWants = 0;
if (coachReadable) {
  for (const rec of coach.records as any[]) {
    if (rec.isEmpty) continue;
    const name = `${String(val(rec, 'FirstName') ?? '').trim()} ${String(val(rec, 'LastName') ?? '').trim()}`.trim();
    if (!name) continue;
    const asset = String(val(rec, 'GenericHeadAssetName') ?? '').trim();
    const id = Number(val(rec, 'Portrait'));
    if (!asset || !Number.isInteger(id) || id < 0) continue;
    wants.push({ file: `c${id}`, key: `nilcp_${asset.toLowerCase()}`, name });
    coachWants++;
  }
}
console.log(`coaches with a portrait asset: ${coachWants}`);

// ---- 2. The install: bundle per asset name ----
const layout = loadLayout(GAME_ROOT_DEFAULT);
const payload = readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32', 'imageassetlibrarysb.toc'));
const toc = parseSuperbundleToc(payload);
const bundleByKey = new Map<string, any>();
for (const b of toc.bundles) {
  const m = /\/((?:nilpp|nilcp)_[a-z0-9_']+)_assetlibrary_nil_(?:player|coach)portraits_brt$/.exec(
    String(b.name)
  );
  if (m) bundleByKey.set(m[1], b);
}
console.log(`portrait bundles in the library: ${bundleByKey.size}`);

fs.mkdirSync(outDir, { recursive: true });
const tmpDir = path.join(outDir, '.dds-tmp');
fs.mkdirSync(tmpDir, { recursive: true });

let extracted = 0;
let cached = 0;
let missing = 0;
const ddsToPng: [string, string][] = [];
const doneAsset = new Map<string, string>(); // asset -> dds path (dedupe shared generics)
for (const w of wants) {
  const pngPath = path.join(outDir, `${w.file}.png`);
  if (fs.existsSync(pngPath)) {
    cached++;
    continue;
  }
  const key = w.key;
  const prior = doneAsset.get(w.key);
  if (prior) {
    ddsToPng.push([prior, pngPath]);
    continue;
  }
  let bundle = bundleByKey.get(key);
  if (!bundle) {
    // The save's asset-name field truncates long names with a trailing '-'
    // ("...desormeauxmicha-_581"); recover by matching stem + trailing id.
    const t = /^((?:nilpp|nilcp)_[a-z0-9_']*?)-?_(\d+)$/.exec(key);
    if (t) {
      for (const [k, b] of bundleByKey) {
        if (k.endsWith(`_${t[2]}`) && k.startsWith(t[1])) {
          bundle = b;
          break;
        }
      }
    }
  }
  if (!bundle) {
    missing++;
    if (missing <= 5) console.error(`no bundle for ${w.name}: ${key}`);
    continue;
  }
  try {
    const parsed = parseBundle(payload, bundle, (loc: any) => readRawCasBytes(layout, loc));
    const res = parsed.assets.find((a: any) => a.kind === 'res' && a.location);
    const chunk = parsed.assets.find((a: any) => a.kind === 'chunk' && a.location);
    if (!res || !chunk) throw new Error('no res+chunk');
    const header = await readCasAsset(layout, res.location!, res.originalSize);
    const format = header.readUInt32LE(0x0c);
    if (format !== BC7_FORMAT) throw new Error(`format 0x${format.toString(16)}`);
    const width = header.readUInt16LE(0x16);
    const height = header.readUInt16LE(0x18);
    const pixels = await readCasAsset(layout, chunk.location!, chunk.originalSize);
    const ddsPath = path.join(tmpDir, `${w.file}.dds`);
    fs.writeFileSync(ddsPath, ddsBc7(width, height, pixels));
    doneAsset.set(w.key, ddsPath);
    ddsToPng.push([ddsPath, pngPath]);
    extracted++;
  } catch (err) {
    missing++;
    if (missing <= 5) console.error(`${w.name} (${w.key}): ${err instanceof Error ? err.message : err}`);
  }
}
console.log(`extracted ${extracted} textures (${cached} already on disk, ${missing} not found)`);

// ---- 3. BC7 -> PNG via Pillow, resized for app use ----
if (ddsToPng.length) {
  const py = [
    'import sys',
    'from PIL import Image',
    `SZ = ${size}`,
    'pairs = sys.argv[1:]',
    'for i in range(0, len(pairs), 2):',
    '    src, dst = pairs[i], pairs[i+1]',
    '    im = Image.open(src); im.load()',
    '    im.thumbnail((SZ, SZ))',
    '    im.save(dst)',
    `print('converted', len(pairs)//2)`
  ].join('\n');
  // Windows command-line length caps out — convert in batches.
  for (let i = 0; i < ddsToPng.length; i += 120) {
    const batch = ddsToPng.slice(i, i + 120).flat();
    const r = spawnSync('python', ['-c', py, ...batch], { encoding: 'utf8' });
    if (r.status !== 0) {
      console.error('python/Pillow conversion failed (needs python3 + Pillow>=11):');
      console.error(r.stderr || r.stdout);
      process.exit(1);
    }
    process.stdout.write(r.stdout);
  }
}
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`done -> ${outDir}`);
