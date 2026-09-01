/**
 * Extract the game's playcall diagram art — the X's-and-O's concept diagrams
 * and play-type icons the in-game playcall screens draw — into
 * resources/game-icons/ as pcc-<group>-<slug>.png / pcpt-<side>-<slug>.png,
 * and regenerate src/shared/play-concepts.ts: the concept catalog with
 * display names taken from the game's own OffensivePlayConcepts /
 * DefensivePlayConcepts enums in the Core-Schemas XML (slug↔enum joined by
 * normalized name; nothing is invented — unmatched art ships unlabeled and
 * the catalog only lists what matched).
 *
 * Two honest limits, documented in RESEARCH: the game bakes art per CONCEPT
 * (~120 diagrams), not per play — play tiles in-game are rendered live from
 * the same gamesheet geometry the app already extracts; and the play records'
 * type id (field 3) has no statically readable mapping to these concepts
 * (it's defined in locked gameplay EBX), so plays cannot be badged with
 * concept art without guessing.
 *
 * Art output is gitignored (EA textures never enter the repo); the generated
 * catalog module is committed. Run once per machine / after title updates:
 *   node scripts/extract-playcall-art.ts
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
  decompressCasBlocksUnknownSize,
} from './fb/frostbite.ts';
import { classifyTexture, texturePng } from './fb/texture.ts';

const OUT_DIR = 'resources/game-icons';
const CATALOG_OUT = 'src/shared/play-concepts.ts';

const layout = loadLayout(GAME_ROOT_DEFAULT);

// ---- 1) art textures -------------------------------------------------------
const payload = readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32/imageassetlibrarysb.toc'));
const toc = parseSuperbundleToc(payload);
fs.mkdirSync(OUT_DIR, { recursive: true });

const targets: { out: string; bundle: (typeof toc.bundles)[number] }[] = [];
for (const b of toc.bundles) {
  const m = b.name.match(
    /ingame\/playcall\/(concepts|playtype)\/assets\/(?:([a-z]+)\/)?(pcc|pcpt)_([a-z0-9_]+)_assetlibrary/
  );
  if (!m) continue;
  const slug = m[4].replace(/_/g, '-');
  targets.push({ out: `${m[3]}-${slug}`, bundle: b });
}
console.log(`${targets.length} playcall art bundles`);

let decoded = 0;
for (const { out, bundle } of targets) {
  if (fs.existsSync(path.join(OUT_DIR, `${out}.png`))) continue;
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
  const format = header.readUInt32LE(0x0c);
  const width = header.readUInt16LE(0x16);
  const height = header.readUInt16LE(0x18);
  const pixels = await readCasAsset(layout, chunk.location!, chunk.originalSize);
  const tex = classifyTexture(format, width, height, pixels);
  if (!tex) {
    console.error(`${out}: unhandled format 0x${format.toString(16)} (${pixels.length}b ${width}x${height})`);
    continue;
  }
  try {
    fs.writeFileSync(path.join(OUT_DIR, `${out}.png`), texturePng(tex, out));
    decoded++;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
  }
}
if (decoded) console.log(`decoded ${decoded} new textures`);

// ---- 2) concept catalog from the game's own enums --------------------------
const globalsToc = parseSuperbundleToc(
  readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32', 'globals.toc'))
);
let xml = '';
for (const chunk of globalsToc.chunks) {
  if (!chunk.guid.startsWith('9b964b0c')) continue;
  const data = await decompressCasBlocksUnknownSize(layout, readRawCasBytes(layout, chunk.location));
  xml = data.toString('latin1');
  break;
}
if (!xml.includes('<FranTkData')) throw new Error('Core-Schemas chunk not found');

function enumMembers(name: string): { name: string; value: number }[] {
  const at = xml.indexOf(`<enum name="${name}"`);
  if (at < 0) throw new Error(`enum ${name} not found`);
  const block = xml.slice(at, xml.indexOf('</enum>', at));
  const seen = new Map<number, string>();
  for (const m of block.matchAll(/<attribute name="([^"]+)" idx="\d+" value="(\d+)"/g)) {
    const v = Number(m[2]);
    // range markers (RUN_FIRST, PASS_LAST, First, Last, NumConcepts) alias real
    // members — keep the descriptive name (the one containing lowercase).
    if (/^[A-Z_]+$/.test(m[1]) || /^(First|Last|NumConcepts)$/.test(m[1])) continue;
    if (!seen.has(v)) seen.set(v, m[1]);
  }
  return [...seen.entries()].map(([value, name2]) => ({ name: name2, value }));
}

const GROUPS: Record<string, string> = {
  Run: 'Run',
  Option: 'Option',
  Quick_Pass: 'Quick Pass',
  Medium_Pass: 'Medium Pass',
  Deep_Pass: 'Deep Pass',
  Playaction_Pass: 'Play Action',
  Screen_Pass: 'Screen',
};

interface CatalogEntry {
  slug: string; // art file basename, e.g. "pcc-pass-omaha"
  name: string; // display name from the enum, e.g. "Omaha"
  group: string; // e.g. "Quick Pass" / "Defense"
}

const artFiles = new Set(
  fs.readdirSync(OUT_DIR).filter((f) => f.startsWith('pcc-')).map((f) => f.replace(/\.png$/, ''))
);
const catalog: CatalogEntry[] = [];
let unmatchedEnum = 0;

/** Spelling drift between the two EA identifier sets (enum vs asset slug). */
function normVariants(norm: string): string[] {
  const out = [norm];
  out.push(norm.endsWith('s') ? norm.slice(0, -1) : `${norm}s`);
  const SPECIAL: Record<string, string> = {
    doublemoves: 'doublemove',
    shotplay: 'shot',
    flsescreen: 'flscreen',
    curl: 'curlflat',
    manblitz: 'blitz',
  };
  if (SPECIAL[norm]) out.push(SPECIAL[norm]);
  return out;
}

for (const m of enumMembers('OffensivePlayConcepts')) {
  const gk = Object.keys(GROUPS).find((g) => m.name.startsWith(g + '_'));
  if (!gk) continue;
  const bare = m.name.slice(gk.length + 1); // e.g. "Four_Verticals"
  const norm = bare.toLowerCase().replace(/_/g, '');
  const candidates = normVariants(norm).flatMap((n) => [`pcc-pass-${n}`, `pcc-run-${n}`]);
  const slug = candidates.find((c) => artFiles.has(c));
  if (!slug) {
    unmatchedEnum++;
    console.error(`no art for offensive concept ${m.name} (looked for ${candidates.join(', ')})`);
    continue;
  }
  catalog.push({ slug, name: bare.replace(/_/g, ' '), group: GROUPS[gk] });
}
for (const m of enumMembers('DefensivePlayConcepts')) {
  const norm = m.name.toLowerCase().replace(/_/g, '');
  const slug = normVariants(norm)
    .map((n) => `pcc-defense-${n}`)
    .find((c) => artFiles.has(c));
  if (!slug) {
    unmatchedEnum++;
    console.error(`no art for defensive concept ${m.name}`);
    continue;
  }
  catalog.push({ slug, name: m.name.replace(/_/g, ' '), group: 'Defense' });
}
// RPO trio: slug words are already separated in the asset names themselves.
for (const slug of ['pcc-rpo-rpo-read', 'pcc-rpo-rpo-alert', 'pcc-rpo-rpo-peek']) {
  if (!artFiles.has(slug)) continue;
  const word = slug.split('-').pop()!;
  catalog.push({ slug, name: `RPO ${word[0].toUpperCase()}${word.slice(1)}`, group: 'RPO' });
}

const matchedArt = new Set(catalog.map((c) => c.slug));
const orphanArt = [...artFiles].filter((f) => !matchedArt.has(f));
console.log(
  `catalog: ${catalog.length} concepts (${unmatchedEnum} enum members without art; ${orphanArt.length} art files outside the catalog: ${orphanArt.join(', ')})`
);

const banner = `/**
 * GENERATED by scripts/extract-playcall-art.ts — do not hand-edit.
 *
 * The game's play-concept catalog: display names and grouping from the
 * OffensivePlayConcepts / DefensivePlayConcepts enums in Core-Schemas,
 * joined to the playcall diagram art by normalized name. Each slug is a
 * gameicon://<slug> texture once extract-playcall-art.ts has run on the
 * machine; the UI hides entries whose art is absent.
 */
`;
const body =
  banner +
  `\nexport interface PlayConcept {\n  slug: string;\n  name: string;\n  group: string;\n}\n` +
  `\nexport const PLAY_CONCEPTS: PlayConcept[] = ${JSON.stringify(catalog, null, 2)};\n`;
fs.writeFileSync(CATALOG_OUT, body.replace(/\r\n/g, '\n'));
console.log(`wrote ${CATALOG_OUT}`);
