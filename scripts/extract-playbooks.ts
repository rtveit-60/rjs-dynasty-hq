/**
 * Build-time playbook extractor (dev tool, like scripts/fetch-logos.ts).
 *
 * Reads the CFB 27 install's Frostbite archives and writes, for the app to bundle offline:
 *   resources/playbooks/books/<slug>.json.gz   — every offense (team) + defense (scheme) book,
 *                                                 gzipped (all 199 books ≈ 4 MB total)
 *   resources/playbooks/manifest.json          — id→slug maps + book directory
 *
 * The app never touches game files: it resolves the save's TEAM_OFFPLAYBOOK / TEAM_DEFPLAYBOOK
 * ids (and DefaultOffensive/DefensiveScheme enums) against the manifest, then reads the gzip.
 *
 * Playbook id model (verified against the save; see docs/RESEARCH.md):
 *   - Offense books are TEAM-specific; TEAM_OFFPLAYBOOK is an index (≈200-401) into the game's
 *     team-book enum. Harvested here from teams that run their own book, plus a small alias table.
 *   - Defense books are SCHEME archetypes; TEAM_DEFPLAYBOOK 500-508 are the nine base books, and
 *     DefaultDefensiveScheme resolves the same nine. Variants fall back to their scheme family.
 *
 * Usage: node scripts/extract-playbooks.ts [gameRoot] [sampleSaveForHarvest]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  GAME_ROOT_DEFAULT,
  loadLayout,
  readTocPayload,
  parseSuperbundleToc,
  parseBundle,
  readRawCasBytes,
  readCasAsset,
  type GameLayout,
  type SuperbundleToc,
} from './fb/frostbite.ts';
import { buildPlaybook } from './fb/playbook.ts';
import { loadFranchise, mainTable, val, decodePlaybookRow } from '../src/main/parser/franchise.ts';
import { ensureCoachSchema } from '../src/main/parser/coach-schema.ts';

const gameRoot = process.argv[2] ?? GAME_ROOT_DEFAULT;
const sampleSave = process.argv[3] ?? 'samples/DYNASTY-DUKETOND-AUTOSAVE';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'resources', 'playbooks');
const booksDir = path.join(outDir, 'books');
fs.mkdirSync(booksDir, { recursive: true });

// Save scheme enum -> archetype book slug (fallback when an id isn't in the harvested map,
// and the label for the scheme family). Verified against the sample save; books use the game's
// own separators (mixed -/_, &).
const OFFENSE_ARCHETYPES: Record<string, string> = {
  OFF_AIR_RAID: 'air_raid',
  OFF_MULTIPLE_OFFENSE: 'multiple',
  OFF_OPTION: 'option',
  OFF_PISTOL: 'pistol',
  OFF_POWER_SPREAD: 'power_spread',
  OFF_PRO_STYLE: 'pro_style',
  OFF_RUN_AND_SHOOT: 'run_&_shoot',
  OFF_SPREAD: 'spread',
  OFF_SPREAD_OPTION: 'spread_option',
  OFF_VEER_AND_SHOOT: 'veer_&_shoot',
};
const DEFENSE_ARCHETYPES: Record<string, string> = {
  DEF_3_2_6: '3-2-6',
  DEF_3_3_5: '3-3-5',
  DEF_3_3_5_TITE: '3-3-5_tite',
  DEF_3_4_MULTIPLE: '3-4_multiple',
  DEF_4_2_5: '4-2-5',
  DEF_4_3_MULTIPLE: '4-3_multiple',
  DEF_BASE3_4: '3-4',
  DEF_BASE4_3: '4-3',
  DEF_MULTIPLE_DEFENSE: 'multiple',
};

// Teams whose LongName doesn't normalize to their book slug.
const OFFENSE_TEAM_ALIASES: Record<string, string> = {
  California: 'cal',
  "Hawai'i": 'hawaii',
  'Miami University': 'miami_(oh)',
  'Middle Tennessee': 'mid_tenn_state',
  'Sam Houston': 'sam_houston_state',
  'Southern Mississippi': 'southern_miss',
  'Texas A&M': 'texas_a&m',
};

// Verified defense id → base scheme book (TEAM_DEFPLAYBOOK 500-508).
const DEFENSE_BASE_IDS: Record<number, string> = {
  500: '3-2-6',
  501: '3-3-5',
  502: '3-3-5_tite',
  503: '3-4',
  504: '3-4_multiple',
  505: '4-3',
  506: '4-3_multiple',
  507: '4-2-5',
  508: 'multiple',
};

function teamSlug(longName: string): string {
  return longName.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Title-case a book slug into a display name, honoring the game's odd separators. */
function bookDisplayName(slug: string, side: 'offense' | 'defense'): string {
  if (side === 'defense') {
    // "3-3-5_zone_pressure" -> "3-3-5 Zone Pressure", "hs_multiple_press" -> "HS Multiple Press"
    return slug
      .split('_')
      .map((w) => (/^\d/.test(w) ? w : w === 'hs' ? 'HS' : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ');
  }
  const special: Record<string, string> = {
    cal: 'California',
    'miami_(oh)': 'Miami (OH)',
    'texas_a&m': 'Texas A&M',
    mid_tenn_state: 'Middle Tennessee',
    sam_houston_state: 'Sam Houston',
    southern_miss: 'Southern Miss',
    'run_&_shoot': 'Run & Shoot',
    'veer_&_shoot': 'Veer & Shoot',
    byu: 'BYU',
    tcu: 'TCU',
    smu: 'SMU',
    ucf: 'UCF',
    unlv: 'UNLV',
    usc: 'USC',
    lsu: 'LSU',
    utep: 'UTEP',
    utsa: 'UTSA',
    uab: 'UAB',
    ut_base: 'Tennessee (Base)',
    '5on5': '5-on-5',
    go_go: 'Go-Go',
    hs_gadget: 'HS Gadget',
    high_school: 'High School',
    minigames_off: 'Mini-Games',
    ml_recopen: 'Rec Open',
  };
  if (special[slug]) return special[slug];
  return slug
    .split('_')
    .map((w) => (w.length <= 3 && /^[a-z]+$/.test(w) && !['air', 'the', 'and'].includes(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

const layout: GameLayout = loadLayout(gameRoot);
const payload = readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32/playbooks.toc'));
const toc: SuperbundleToc = parseSuperbundleToc(payload);

function bookSlugs(side: 'offense' | 'defense'): string[] {
  return [
    ...new Set(
      toc.bundles
        .filter((b) => b.name.endsWith(`_${side}_playbooks_brt`))
        .map((b) => b.name.split('/').pop()!.replace(`_${side}_playbooks_brt`, '').replace(/^college_/, '')),
    ),
  ];
}

async function extractOne(slug: string, side: 'offense' | 'defense') {
  const bundleName = `college_${slug}_${side}_playbooks_brt`;
  const be = toc.bundles.find((b) => b.name.endsWith(bundleName));
  if (!be) return null;
  const bundle = parseBundle(payload, be, (loc) => readRawCasBytes(layout, loc));
  const master = bundle.assets.find(
    (a) => a.name.endsWith(`/college_${slug}_${side}`) || a.name.endsWith(`/${slug}_${side}`),
  );
  if (!master?.location) return null;
  const ebx = await readCasAsset(layout, master.location, master.originalSize);
  const model = buildPlaybook(ebx);
  const json = JSON.stringify({ formations: model.formations });
  const gz = zlib.gzipSync(json, { level: 9 });
  fs.writeFileSync(path.join(booksDir, `${side[0]}_${slug}.json.gz`), gz);
  return { formationCount: model.formations.length, playCount: model.playCount, bytes: gz.length };
}

// ---- extract every book -----------------------------------------------------

const books: Record<string, { side: string; name: string; formationCount: number; playCount: number }> = {};
let totalBytes = 0;
for (const side of ['offense', 'defense'] as const) {
  const slugs = bookSlugs(side);
  console.log(`${side}: ${slugs.length} books`);
  for (const slug of slugs) {
    const r = await extractOne(slug, side);
    if (!r) {
      console.warn(`  ! ${slug}: no master — skipped`);
      continue;
    }
    books[`${side[0]}_${slug}`] = {
      side,
      name: bookDisplayName(slug, side),
      formationCount: r.formationCount,
      playCount: r.playCount,
    };
    totalBytes += r.bytes;
  }
}

// ---- harvest coach-playbook-row -> slug from the sample save --------------------
//
// The book a team actually runs is the coach's selection (Coach.OffensivePlaybook /
// DefensivePlaybook — 32-bit refs into a game "playbook" table; the low 17 bits are the
// row that identifies the book). Team.TEAM_OFFPLAYBOOK is only the team's canonical
// default, which a user coach commonly overrides. We anchor each coach-row to a slug via
// each team's default-book slug, preferring teams that natively run their own book so a
// shared row (e.g. a coach who picked another school's book) resolves to that book.

const coachOff: Record<string, string> = {};
const coachDef: Record<string, string> = {};
try {
  const fr = await loadFranchise(sampleSave);

  // team default-book slug maps, keyed by the engine TeamIndex
  const teamTables = fr.getAllTablesByName('Team');
  let team: any = null;
  for (const t of teamTables) {
    await t.readRecords();
    if (!team || t.header.recordCapacity > team.header.recordCapacity) team = t;
  }
  const offBookSet = new Set(bookSlugs('offense'));
  const offById: Record<number, string> = {};
  const teamByIndex = new Map<number, { name: string; off: number; def: number }>();
  for (let i = 0; i < team.header.recordCapacity; i++) {
    const rec = team.records[i];
    let longName: string;
    try {
      longName = rec['LongName'];
    } catch {
      continue;
    }
    if (!longName) continue;
    const off = Number(rec['TEAM_OFFPLAYBOOK']);
    const def = Number(rec['TEAM_DEFPLAYBOOK']);
    const slug = OFFENSE_TEAM_ALIASES[longName] ?? teamSlug(longName);
    if (offBookSet.has(slug) && Number.isInteger(off)) offById[off] = slug;
    teamByIndex.set(Number(rec['TeamIndex']), { name: longName, off, def });
  }

  const coachTable = mainTable(fr, 'Coach');
  await ensureCoachSchema(fr, coachTable);
  await coachTable.readRecords([
    'Position',
    'TeamIndex',
    'OffensivePlaybook',
    'DefensivePlaybook',
  ]);
  coachTable.records.forEach((rec: any) => {
    if (rec.isEmpty || String(val(rec, 'Position')) !== 'HeadCoach') return;
    const t = teamByIndex.get(Number(val(rec, 'TeamIndex')));
    if (!t) return;
    const offRow = decodePlaybookRow(val(rec, 'OffensivePlaybook'));
    const defRow = decodePlaybookRow(val(rec, 'DefensivePlaybook'));
    const offSlug = offById[t.off];
    const defSlug = DEFENSE_BASE_IDS[t.def];
    if (offRow != null && offSlug) {
      const native = teamSlug(t.name) === offSlug;
      if (native || !(String(offRow) in coachOff)) coachOff[String(offRow)] = offSlug;
    }
    if (defRow != null && defSlug && !(String(defRow) in coachDef)) coachDef[String(defRow)] = defSlug;
  });
  console.log(
    `harvested ${Object.keys(coachOff).length} offense + ${Object.keys(coachDef).length} defense coach-row anchors from ${path.basename(sampleSave)}`,
  );
} catch (err) {
  console.warn(`! coach-map harvest failed (${err}); playbooks will rely on the scheme fallback`);
}

const manifest = {
  generatedFrom: path.basename(sampleSave),
  coachOffense: coachOff,
  coachDefense: coachDef,
  archetypes: { ...OFFENSE_ARCHETYPES, ...DEFENSE_ARCHETYPES },
  books,
};
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest));

console.log(
  `\nWrote ${Object.keys(books).length} books (${(totalBytes / 1048576).toFixed(1)} MB gzipped) + manifest.json to ${outDir}`,
);
