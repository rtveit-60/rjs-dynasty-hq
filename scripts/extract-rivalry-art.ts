/**
 * Extract rivalry logos and rivalry trophies from the installed game into
 * resources/game-icons/ (gitignored — EA's art never enters the repo), keyed
 * by the save's own stable Rivalry.AssetName so the renderer joins on data it
 * already has:
 *   rivalry-<asset-slug>.png   the series logo (rylgs_256_<team>vs<team>)
 *   trophy-<asset-slug>.png    the series trophy (rvlt_<trophy>)
 *
 * Joins:
 * - Logos are mechanical: the imageassetlibrary keys logo bundles by the two
 *   schools' names ("rylgs_256_virginiavsvirginiatech"); both orders are tried
 *   with the save's team names (normalized to lowercase alphanumerics).
 * - Trophies are name-matched between two game-data name sets (the rivalry's
 *   Name/SecondaryName from the save and the rvlt_* bundle keys), with
 *   team-abbreviation qualifiers on shared trophy names (shillelagh_nd_usc)
 *   checked against the two schools. Genuinely ambiguous or unmatched series
 *   simply get no trophy file — the UI shows nothing rather than a guess.
 *   Odd pairings verified by eye land in TROPHY_FIXUPS (AssetName → rvlt key).
 *
 * Usage: node scripts/extract-rivalry-art.ts [save] [--report]
 *   --report prints the full match table (for QA) without extracting.
 * Run after title updates. Same trademark posture as field art: per-machine.
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
  readCasAsset
} from './fb/frostbite.ts';
import { classifyTexture, texturePng } from './fb/texture.ts';
import { loadFranchise, tablesByName, readTable, refFromRecord, isNullRef, val } from '../src/main/parser/franchise.ts';

const args = process.argv.slice(2);
const savePath = args.find((a) => !a.startsWith('--')) ?? 'samples/DYNASTY-VIRGINIA-MIDSEASON';
const reportOnly = args.includes('--report');
const OUT_DIR = 'resources/game-icons';

/**
 * Rivalry AssetName → rvlt bundle key, for pairings the name matcher can't
 * settle alone. Every entry was verified by eye against the extracted render —
 * the art carries its own identity (engraved school names, event names, or
 * the trophy the series is named for).
 */
const TROPHY_FIXUPS: Record<string, string> = {
  Air_Force_Army_Game: 'commanderinchiefs_af_a_trophy',
  Air_Force_Navy_Game: 'commanderinchiefs_af_n_trophy',
  Army_Navy_Game: 'commanderinchiefs_a_n_trophy',
  Alabama_Auburn_Game: 'jamesefoytrophy',
  Arizona_Arizona_State_Game: 'territorialcuptrophy',
  Arkansas_Texas_A_M_Game: 'southwestclassictrophy',
  Boston_College_Notre_Dame_Game: 'irelandtrophy',
  BYU_Utah_Game: 'beehiveboot_byu_u_trophy',
  BYU_Utah_State_Game: 'beehiveboot_byu_us_trophy',
  California_Stanford_Game: 'axetrophy',
  Cincinnati_Miami_University_Game: 'victorybell_c_m_trophy',
  Colorado_State_Wyoming_Game: 'bronzeboottrophy',
  Georgia_Georgia_Tech_Game: 'governorscup_g_gt_trophy',
  Kansas_Kansas_State_Game: 'governorscup_k_ks_trophy',
  LSU_Tulane_Game: 'tigerragtrophy',
  Michigan_Northwestern_Game: 'georgejewitttrophy',
  Minnesota_Wisconsin_Game: 'paulbunyanaxetrophy',
  Missouri_South_Carolina_Game: 'mayorscup_m_sc_trophy',
  Nevada_UNLV_Game: 'fremontcannontrophy',
  Oklahoma_Texas_Game: 'goldenhattrophy',
  Ole_Miss_Mississippi_State_Game: 'goldeneggtrophy',
  Utah_State_Wyoming_Game: 'bridgerrifletrophy',
  Utah_Utah_State_Game: 'beehiveboot_u_us_trophy'
};

/**
 * Keys that must never be used: EA ships these as the identical generic gold
 * "RIVALRY TROPHY" placeholder render (list derived by hashing every
 * extracted rvlt PNG and collecting the duplicate cluster — re-derive the
 * same way after title updates). Real art or nothing.
 */
const TROPHY_BLOCKLIST = new Set([
  '5bitsofbrokenchairtrophy',
  'anniversaryawardtrophy',
  'bourbonbarreltrophy',
  'buttbowltrophy',
  'chancellorsspurstrophy',
  'defaultrivalrytrophy',
  'floridacuptrophy',
  'goldcowbelltrophy',
  'goldenscrewdrivertrophy',
  'jamesbonhamtrophy',
  'jeffersoneppestrophy',
  'kitcarsonrifletrophy',
  'lamarhunttrophy',
  'makalatrophy',
  'okefenokeeoartrophy',
  'oldwagonwheeltrophy',
  'olschoolbelltrophy',
  'paddlewheeltrophy',
  'paintbuckettrophy',
  'platypustrophy',
  'riogranderivalrytrophy',
  'rivalryseriestrophy',
  'seminolewarcanoetrophy',
  'temptrophy',
  'thompsoncuptrophy',
  'tigersoonerpeacepipetrophy',
  'victorybarreltrophy',
  'williamstrophy',
  'woodenboottrophy'
]);

const norm = (s: string): string => s.normalize('NFD').toLowerCase().replace(/[^a-z0-9]+/g, '');
const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// ---- 1. The save: rivalry rows + team names ----
const fr = await loadFranchise(savePath);
const teamTable = await readTable(tablesByName(fr, 'Team').sort((a: any, b: any) => (b.header?.recordCapacity ?? 0) - (a.header?.recordCapacity ?? 0))[0]);
const teamName = (row: number): { display: string; long: string; short: string } => {
  const rec = teamTable.records?.[row];
  const display = String(val(rec, 'DisplayName') ?? '').trim();
  return {
    display,
    long: String(val(rec, 'LongName') ?? '').trim() || display,
    short: String(val(rec, 'ShortName') ?? '').trim()
  };
};

const rt = tablesByName(fr, 'Rivalry')[0];
await readTable(rt);
interface Riv {
  asset: string;
  name: string;
  secondary: string;
  t1: { display: string; long: string; short: string };
  t2: { display: string; long: string; short: string };
}
const rivalries: Riv[] = [];
for (const rec of rt.records as any[]) {
  if (rec.isEmpty) continue;
  const asset = String(val(rec, 'AssetName') ?? '').trim();
  const t1 = refFromRecord(rec, 'Team1');
  const t2 = refFromRecord(rec, 'Team2');
  if (!asset || isNullRef(t1) || isNullRef(t2)) continue;
  rivalries.push({
    asset,
    name: String(val(rec, 'Name') ?? '').trim(),
    secondary: String(val(rec, 'SecondaryName') ?? '').trim(),
    t1: teamName(t1.row),
    t2: teamName(t2.row)
  });
}
console.log(`rivalries in save: ${rivalries.length}`);

// ---- 2. The install: logo + trophy bundles ----
const layout = loadLayout(GAME_ROOT_DEFAULT);
const toc = parseSuperbundleToc(
  readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32', 'imageassetlibrarysb.toc'))
);
const logoBundles = new Map<string, any>();
const trophyBundles = new Map<string, any>();
for (const b of toc.bundles) {
  const n = String(b.name);
  const lg = /\/rylgs_256_([a-z0-9_']+)_assetlibrary_rivalrylogos_brt$/.exec(n);
  if (lg) logoBundles.set(lg[1], b);
  const tr = /\/rvlt_([a-z0-9_']+)_assetlibrary_rivalrytrophies_brt$/.exec(n);
  if (tr) trophyBundles.set(tr[1], b);
}
console.log(`library: ${logoBundles.size} rivalry logos, ${trophyBundles.size} trophies`);

// ---- 3. Joins ----
/** Library spellings that differ from every save name for a school. */
const LOGO_NAME_VARIANTS: Record<string, string[]> = {
  california: ['cal'],
  miami: ['miamifl'],
  ulmonroe: ['louisianamonroe'],
  usf: ['southflorida']
};

function logoKeyFor(r: Riv): string | null {
  const variantsFor = (t: { display: string; long: string }): string[] => {
    const base = [norm(t.long), norm(t.display)];
    return [...new Set(base.flatMap((n) => [n, ...(LOGO_NAME_VARIANTS[n] ?? [])]))];
  };
  for (const a of variantsFor(r.t1)) {
    for (const b of variantsFor(r.t2)) {
      for (const key of [`${a}vs${b}`, `${b}vs${a}`]) if (logoBundles.has(key)) return key;
    }
  }
  return null;
}

/** Trophy key parts: base name + trailing short team qualifiers, with the
 * literal trophy/award token dropped first (governorscup_k_ks_trophy →
 * base "governorscup", quals ["k","ks"]). */
function trophyParts(key: string): { base: string; quals: string[] } {
  const toks = key.split('_').filter(Boolean);
  if (toks.length && /^(trophy|award)$/.test(toks[toks.length - 1])) toks.pop();
  const quals: string[] = [];
  while (toks.length > 1 && toks[toks.length - 1].length <= 4) {
    quals.unshift(toks.pop()!);
  }
  const base = toks.join('').replace(/trophy$|award$/g, '');
  return { base, quals };
}

/** All the handles a qualifier may address a school by. */
function teamHandles(t: { display: string; long: string; short: string }): string[] {
  const initials = (s: string) =>
    s
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((w) => w[0].toLowerCase())
      .join('');
  return [
    norm(t.long),
    norm(t.display),
    norm(t.short),
    initials(t.long),
    initials(t.display)
  ].filter(Boolean);
}

/** Each qualifier must address a different one of the two schools. */
function qualsMatch(quals: string[], r: Riv): boolean {
  if (!quals.length) return true;
  if (quals.length > 2) return false;
  const h1 = teamHandles(r.t1);
  const h2 = teamHandles(r.t2);
  const hits = (q: string, hs: string[]) => hs.some((n) => n === q || (q.length >= 2 && n.startsWith(q)));
  if (quals.length === 1) return hits(quals[0], h1) || hits(quals[0], h2);
  return (
    (hits(quals[0], h1) && hits(quals[1], h2)) ||
    (hits(quals[0], h2) && hits(quals[1], h1))
  );
}

function trophyKeyFor(r: Riv): string | null {
  if (TROPHY_FIXUPS[r.asset]) return TROPHY_FIXUPS[r.asset];
  const texts = [norm(r.name), norm(r.secondary)].filter(Boolean);
  if (!texts.length) return null;
  const candidates: { key: string; score: number }[] = [];
  for (const key of trophyBundles.keys()) {
    if (TROPHY_BLOCKLIST.has(key)) continue;
    const { base, quals } = trophyParts(key);
    if (base.length < 4) continue;
    for (const t of texts) {
      // Containment either way: "battleforthecommonwealthcup" ⊇ "commonwealthcup",
      // "bedlam" ⊆ "bedlambell".
      const hit = t.includes(base) || base.includes(t);
      if (!hit) continue;
      if (!qualsMatch(quals, r)) continue;
      candidates.push({ key, score: base.length + (quals.length ? 10 : 0) });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  // Ambiguity guard: two distinct keys with the same top score → no pick.
  if (candidates.length > 1 && candidates[0].score === candidates[1].score && candidates[0].key !== candidates[1].key) {
    return null;
  }
  return candidates[0].key;
}

const matches = rivalries.map((r) => ({ r, logo: logoKeyFor(r), trophy: trophyKeyFor(r) }));
const withLogo = matches.filter((m) => m.logo).length;
const withTrophy = matches.filter((m) => m.trophy).length;
console.log(`matched: ${withLogo} logos, ${withTrophy} trophies (of ${rivalries.length} series)`);

if (reportOnly) {
  for (const m of matches) {
    console.log(
      `${m.r.asset}\n   "${m.r.name}"${m.r.secondary ? ` / "${m.r.secondary}"` : ''} (${m.r.t1.display} vs ${m.r.t2.display})\n   logo=${m.logo ?? '—'} trophy=${m.trophy ?? '—'}`
    );
  }
  const used = new Set(matches.map((m) => m.trophy).filter(Boolean));
  console.log(`\nunused trophy bundles (${trophyBundles.size - used.size}):`);
  for (const k of trophyBundles.keys()) if (!used.has(k)) console.log(`   ${k}`);
  const usedLogos = new Set(matches.map((m) => m.logo).filter(Boolean));
  console.log(`\nunused logo bundles (${logoBundles.size - usedLogos.size}):`);
  for (const k of logoBundles.keys()) if (!usedLogos.has(k)) console.log(`   ${k}`);
  process.exit(0);
}

// ---- 4. Extraction ----
fs.mkdirSync(OUT_DIR, { recursive: true });
const payload = readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32', 'imageassetlibrarysb.toc'));
let written = 0;
let skipped = 0;
async function extractBundle(bundle: any, outBase: string): Promise<void> {
  const outPath = path.join(OUT_DIR, `${outBase}.png`);
  if (fs.existsSync(outPath)) return;
  let parsed;
  try {
    parsed = parseBundle(payload, bundle, (loc: any) => readRawCasBytes(layout, loc));
  } catch {
    skipped++;
    return;
  }
  const res = parsed.assets.find((a: any) => a.kind === 'res' && a.location);
  const chunk = parsed.assets.find((a: any) => a.kind === 'chunk' && a.location);
  if (!res || !chunk) {
    skipped++;
    return;
  }
  const header = await readCasAsset(layout, res.location!, res.originalSize);
  const format = header.readUInt32LE(0x0c);
  const width = header.readUInt16LE(0x16);
  const height = header.readUInt16LE(0x18);
  const pixels = await readCasAsset(layout, chunk.location!, chunk.originalSize);
  const tex = classifyTexture(format, width, height, pixels);
  if (!tex) {
    console.error(`${outBase}: format 0x${format.toString(16)} ${width}x${height} with ${pixels.length}b — skipped`);
    skipped++;
    return;
  }
  fs.writeFileSync(outPath, texturePng(tex, outBase));
  written++;
}

for (const m of matches) {
  const s = slug(m.r.asset);
  if (m.logo) await extractBundle(logoBundles.get(m.logo), `rivalry-${s}`);
  if (m.trophy) await extractBundle(trophyBundles.get(m.trophy), `trophy-${s}`);
}
console.log(`written ${written}, skipped ${skipped} → ${OUT_DIR}`);
