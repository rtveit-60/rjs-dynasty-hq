/**
 * Developer tool (not shipped): download a logo PNG for every bowl in the save
 * into resources/bowl-logos/<AssetName>.png, which electron-builder bundles and
 * the app serves over the bowl:// protocol.
 *
 * Source is Wikipedia's article image for each bowl, rendered to PNG by the
 * MediaWiki thumbnailer. Same posture as the bundled team logos — see the
 * trademark note in CLAUDE.md.
 *
 * Usage: node scripts/fetch-bowl-logos.ts [--force]
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = 'resources/bowl-logos';
const MANIFEST = 'src/renderer/src/lib/bowl-logos.ts';
const WIDTH = 512;
const UA = 'RJsDynastyHQ-devtool/1.0 (bowl logo fetch; contact: repo owner)';

/** Save AssetName -> candidate Wikipedia titles, best first. */
const TITLES: Record<string, string[]> = {
  Rose_Bowl: ['Rose Bowl Game'],
  Sugar_Bowl: ['Sugar Bowl'],
  Orange_Bowl: ['Orange Bowl'],
  Peach_Bowl: ['Peach Bowl'],
  Cotton_Bowl: ['Cotton Bowl Classic'],
  Fiesta_Bowl: ['Fiesta Bowl'],
  Citrus_Bowl: ['Citrus Bowl (game)', 'Citrus Bowl'],
  Gator_Bowl: ['Gator Bowl'],
  Alamo_Bowl: ['Alamo Bowl'],
  Sun_Bowl: ['Sun Bowl (game)', 'Sun Bowl'],
  Texas_Bowl: ['Texas Bowl'],
  Music_City_Bowl: ['Music City Bowl'],
  Duke_s_Mayo_Bowl: ["Duke's Mayo Bowl"],
  Pop_Tarts_Bowl: ['Pop-Tarts Bowl'],
  Holiday_Bowl: ['Holiday Bowl'],
  Hawaii_Bowl: ['Hawaii Bowl'],
  Las_Vegas_Bowl: ['Las Vegas Bowl'],
  Liberty_Bowl: ['Liberty Bowl'],
  Military_Bowl: ['Military Bowl'],
  Armed_Forces_Bowl: ['Armed Forces Bowl'],
  Camellia_Bowl: ['Salute to Veterans Bowl', 'Camellia Bowl'],
  Independence_Bowl: ['Independence Bowl'],
  First_Responder_Bowl: ['First Responder Bowl'],
  Frisco_Bowl: ['Frisco Bowl'],
  Myrtle_Beach_Bowl: ['Myrtle Beach Bowl'],
  New_Orleans_Bowl: ['New Orleans Bowl'],
  New_Mexico_Bowl: ['New Mexico Bowl'],
  Arizona_Bowl: ['Arizona Bowl'],
  Boca_Raton_Bowl: ['Boca Raton Bowl'],
  Birmingham_Bowl: ['Birmingham Bowl'],
  Fenway_Bowl: ['Fenway Bowl'],
  Gasparilla_Bowl: ['Gasparilla Bowl'],
  Famous_Idaho_Potato_Bowl: ['Famous Idaho Potato Bowl'],
  '68Ventures_Bowl': ['68 Ventures Bowl'],
  Guaranteed_Rate_Bowl: ['Rate Bowl'],
  Reliaquest_Bowl: ['ReliaQuest Bowl'],
  Cure_Bowl: ['Cure Bowl'],
  Bahamas_Bowl: ['Xbox Bowl', 'Bahamas Bowl']
  // No CFP entry: the playoff rounds use the official CFP vector mark in
  // src/renderer/src/lib/cfp-mark.ts, which follows the theme's ink.
};

/**
 * Bowls whose Wikipedia article carries no logo file. These come straight from
 * the bowl's own site or its conference CDN instead. Full-resolution originals —
 * the downscale pass below caps them at MAX_EDGE.
 */
const OVERRIDES: Record<string, string> = {
  Holiday_Bowl: 'https://holidaybowl.com/wp-content/uploads/Holiday-Bowl-Logo.png',
  Camellia_Bowl:
    'https://dxbhsrqyrr690.cloudfront.net/sidearm.nextgen.sites/fba.sidearmsports.com/images/2024/10/14/IS4S_Salute_to_Veterans_Bowl.png',
  Guaranteed_Rate_Bowl:
    'https://dxbhsrqyrr690.cloudfront.net/sidearm.nextgen.sites/fba.sidearmsports.com/images/2024/10/17/Rate_Bowl_CMYK-logo.png',
  // The save labels this slot "Xbox Bowl", which replaced the Bahamas Bowl.
  Bahamas_Bowl:
    'https://xboxbowl.wpenginepowered.com/wp-content/uploads/2025/12/Xbox-Bowl-Logo-Default%402.png'
};

const JUNK =
  /commons.logo|wikinews|wiktionary|wikisource|wikiquote|edit.|ambox|question.book|padlock|symbol|flag.of|folder|portal|wikimedia|increase|decrease|pog\b|location.dot|disambig|text.document|wiki.letter|sound.icon|gnome|nuvola|magnify|kellanova|stub|merge|split|crystal/i;

/** Words too generic to prove a file belongs to a given bowl. */
const STOPWORDS = new Set(['bowl', 'game', 'the', 'and', 'classic', 'college', 'football', 'national']);

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** Wikipedia throttles bursts — go slowly and back off when asked to. */
async function politeFetch(url: string | URL, attempt = 0): Promise<Response> {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (r.status === 429 && attempt < 5) {
    const wait = Number(r.headers.get('retry-after')) * 1000 || 2000 * 2 ** attempt;
    console.log(`  …rate limited, waiting ${Math.round(wait / 1000)}s`);
    await sleep(wait);
    return politeFetch(url, attempt + 1);
  }
  return r;
}

async function api(params: Record<string, string>): Promise<any> {
  const u = new URL('https://en.wikipedia.org/w/api.php');
  for (const [k, v] of Object.entries({ format: 'json', ...params })) u.searchParams.set(k, v);
  const r = await politeFetch(u);
  if (!r.ok) throw new Error(`api ${r.status}`);
  await sleep(350);
  return r.json();
}

/**
 * Score an image file name for "is this the bowl's logo?". Wikipedia articles
 * carry maintenance icons and action photos too, so a candidate must be a
 * vector/PNG that actually names the bowl — otherwise we would happily bundle a
 * map-marker dot or a photo of a running back.
 */
function score(file: string, title: string): number {
  const f = file.toLowerCase().replace(/^file:/, '').replace(/[^a-z0-9.]+/g, '_');
  if (JUNK.test(f)) return -1;
  // Logos are vector or flat PNG; a JPEG on these pages is a photograph.
  if (!/\.(svg|png)$/.test(f)) return -1;

  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const named = words.some((w) => f.includes(w));
  // Must identify the bowl somehow, or it is not this bowl's logo.
  if (!named && !/_bowl|bowl_/.test(f)) return -1;

  let s = 0;
  if (/logo/.test(f)) s += 10;
  if (f.endsWith('.svg')) s += 3;
  for (const w of words) if (f.includes(w)) s += 4;
  if (/bowl/.test(f)) s += 2;
  if (/trophy|stadium|players?|coach|_vs_|helmet/.test(f)) s -= 8;
  if (/\b(19|20)\d\d/.test(f) && !/logo/.test(f)) s -= 5;
  return s;
}

async function logoFor(titles: string[]): Promise<{ url: string; file: string; title: string } | null> {
  for (const title of titles) {
    let data: any;
    try {
      data = await api({ action: 'query', prop: 'images', imlimit: '80', titles: title, redirects: '1' });
    } catch {
      continue;
    }
    const pages: any = data?.query?.pages ?? {};
    const page: any = Object.values(pages)[0];
    if (!page || page.missing !== undefined || !page.images) continue;
    const ranked = page.images
      .map((i: any) => ({ file: i.title as string, s: score(i.title, page.title) }))
      .filter((x: any) => x.s > 0)
      .sort((a: any, b: any) => b.s - a.s);
    if (!ranked.length) continue;

    for (const cand of ranked.slice(0, 3)) {
      try {
        const info = await api({
          action: 'query',
          prop: 'imageinfo',
          iiprop: 'url',
          iiurlwidth: String(WIDTH),
          titles: cand.file
        });
        const ip: any = Object.values(info?.query?.pages ?? {})[0];
        const url = ip?.imageinfo?.[0]?.thumburl ?? ip?.imageinfo?.[0]?.url;
        if (url) return { url, file: cand.file, title: page.title };
      } catch {
        // try next candidate
      }
    }
  }
  return null;
}

const force = process.argv.includes('--force');
mkdirSync(OUT_DIR, { recursive: true });

const missing: string[] = [];
let got = 0;
for (const [asset, titles] of Object.entries(TITLES)) {
  const dest = join(OUT_DIR, `${asset}.png`);
  if (!force && existsSync(dest)) {
    console.log(`= ${asset} (have)`);
    got++;
    continue;
  }
  const override = OVERRIDES[asset];
  const hit = override ? { url: override, file: override, title: asset } : await logoFor(titles);
  if (!hit) {
    console.log(`! ${asset} — no logo found`);
    missing.push(asset);
    continue;
  }
  try {
    const r = await politeFetch(hit.url);
    if (!r.ok) throw new Error(`http ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 900) throw new Error(`too small (${buf.length}b)`);
    writeFileSync(dest, buf);
    got++;
    console.log(`+ ${asset}  <- ${hit.file}  (${(buf.length / 1024).toFixed(0)}kb)`);
  } catch (e: any) {
    console.log(`! ${asset} — download failed: ${e.message}`);
    missing.push(asset);
  }
}

console.log(`\n${got}/${Object.keys(TITLES).length} logos in ${OUT_DIR}`);
if (missing.length) console.log(`missing: ${missing.join(', ')}`);

// Emit the manifest the renderer checks before asking for bowl://<asset>, so a
// bowl without art renders nothing instead of a broken image.
const have = readdirSync(OUT_DIR)
  .filter((f) => /\.(png|svg|webp)$/i.test(f))
  .map((f) => f.replace(/\.[^.]+$/, ''))
  .sort();
writeFileSync(
  MANIFEST,
  `// Generated by scripts/fetch-bowl-logos.ts — do not edit by hand.\n` +
    `// Bowls with a bundled logo in resources/bowl-logos, served over bowl://.\n` +
    `export const BOWL_LOGOS: ReadonlySet<string> = new Set([\n` +
    have.map((h) => `  '${h}'`).join(',\n') +
    `\n]);\n`,
  'utf8'
);
console.log(`manifest: ${MANIFEST} (${have.length} entries)`);
