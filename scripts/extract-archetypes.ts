/**
 * Generate src/shared/archetypes.ts from the game's own data.
 *
 * The save stores Madden-lineage archetype identifiers (`QB_FieldGeneral`)
 * while the game displays its own names (`Pocket Passer`). Those names live in
 * the ARCH table of an FTC container inside the Frostbite bundles — see the
 * "Game asset containers" notes in docs/RESEARCH.md.
 *
 * ARCH entries sit at a fixed stride, indexed by the PlayerType enum's numeric
 * value: offset = ARCH_BASE + value * ARCH_STRIDE. So the mapping is derived,
 * not guessed.
 *
 * Usage: node scripts/extract-archetypes.ts [save] [--print]
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  GAME_ROOT_DEFAULT,
  loadLayout,
  readTocPayload,
  parseSuperbundleToc,
  readRawCasBytes,
  decompressCasBlocksUnknownSize,
} from './fb/frostbite.ts';
import { loadFranchise, mainTable } from '../src/main/parser/franchise.ts';

const savePath = process.argv[2]?.startsWith('--')
  ? 'samples/DYNASTY-DUKETOND-AUTOSAVE'
  : (process.argv[2] ?? 'samples/DYNASTY-DUKETOND-AUTOSAVE');
const OUT = 'src/shared/archetypes.ts';
const ARCH_BASE = 88;
const ARCH_STRIDE = 104;

// ---- 1. Find the FTC container holding an ARCH table ----
const rev = (s: string) => s.split('').reverse().join('');

function ftcTables(buf: Buffer): { tag: string; off: number }[] | null {
  if (buf.length < 0x20 || buf.subarray(0, 2).toString('latin1') !== 'DB') return null;
  const out: { tag: string; off: number }[] = [];
  let p = 0x18;
  while (p + 8 <= buf.length) {
    const raw = buf.subarray(p, p + 4).toString('latin1');
    if (!/^[A-Z0-9]{4}$/.test(raw)) break;
    const off = buf.readUInt32BE(p + 4);
    if (off > buf.length) break;
    out.push({ tag: rev(raw), off });
    p += 8;
  }
  return out.length >= 4 ? out : null;
}

const layout = loadLayout(GAME_ROOT_DEFAULT);
let archRegion: Buffer | null = null;
outer: for (const sb of layout.superBundles) {
  let toc;
  try {
    toc = parseSuperbundleToc(readTocPayload(path.join(layout.gameRoot, 'Data', `${sb}.toc`)));
  } catch {
    continue;
  }
  for (const chunk of toc.chunks) {
    if (chunk.location.size > 64 * 1024 * 1024) continue;
    let data: Buffer;
    try {
      data = await decompressCasBlocksUnknownSize(layout, readRawCasBytes(layout, chunk.location));
    } catch {
      continue;
    }
    const tables = ftcTables(data);
    const i = tables?.findIndex((t) => t.tag === 'ARCH') ?? -1;
    if (!tables || i < 0) continue;
    // Table data is addressed from the end of the directory.
    let base = 0x18;
    while (base + 8 <= data.length && /^[A-Z0-9]{4}$/.test(data.subarray(base, base + 4).toString('latin1'))) {
      base += 8;
    }
    archRegion = data.subarray(base + tables[i].off, base + (tables[i + 1]?.off ?? data.length - base));
    console.log(`ARCH found in ${sb} guid=${chunk.guid} (${archRegion.length} bytes)`);
    break outer;
  }
}
if (!archRegion) throw new Error('no FTC container with an ARCH table found');

/** The "POS - Name" string for one archetype value. */
function nameForValue(value: number): { pos: string; name: string } | null {
  const at = ARCH_BASE + value * ARCH_STRIDE;
  if (at < 0 || at >= archRegion!.length) return null;
  let s = '';
  for (let i = at; i < Math.min(at.valueOf() + 60, archRegion!.length); i++) {
    const b = archRegion![i];
    if (b < 0x20 || b >= 0x7f) break;
    s += String.fromCharCode(b);
  }
  // The game retires slots in place rather than renumbering the enum.
  if (s.startsWith('DEPRECIATED') || s.startsWith('DEPRECATED')) return null;
  const m = s.match(/^([A-Z]{1,5}) - (.+)$/);
  return m ? { pos: m[1], name: m[2] } : null;
}

// ---- 2. Walk the PlayerType enum and pair each member with its ARCH name ----
const franchise = await loadFranchise(savePath);
const playerT = mainTable(franchise, 'Player');
await playerT.readRecords(['PlayerType']);
const attr: any = (playerT.schema?.attributes ?? []).find((a: any) => a.name === 'PlayerType');
if (!attr?.enum) throw new Error('PlayerType enum not found in schema');
const members: any[] = attr.enum.members ?? attr.enum._members ?? [];

const SKIP = /(_First_|_Last_|^First_|^Last_|^Count_|^Locked$|^Invalid_$|^Offense_|^Defense_|^DL_|^OL_|^LB_|^DB_|^Returner_)/;
const rows: { id: string; pos: string; name: string }[] = [];
const missing: string[] = [];
for (const m of members) {
  const id = String(m?.name ?? m?._name ?? '');
  const value = Number(m?.value ?? m?._value ?? NaN);
  if (!id || SKIP.test(id) || !Number.isFinite(value)) continue;
  const hit = nameForValue(value);
  if (!hit) {
    missing.push(`${id} (value ${value})`);
    continue;
  }
  rows.push({ id, pos: hit.pos, name: hit.name });
}
rows.sort((a, b) => a.pos.localeCompare(b.pos) || a.id.localeCompare(b.id));

console.log(`mapped ${rows.length} archetypes across ${new Set(rows.map((r) => r.pos)).size} families`);
if (missing.length) {
  console.log(`no ARCH name (retired slot, or beyond the table): ${missing.join(', ')}`);
}
if (process.argv.includes('--print')) {
  let pos = '';
  for (const r of rows) {
    if (r.pos !== pos) {
      pos = r.pos;
      console.log(`\n  ${pos}`);
    }
    console.log(`    ${r.id.padEnd(26)} → ${r.name}`);
  }
}

// ---- 3. Emit the lookup ----
const byPos = new Map<string, typeof rows>();
for (const r of rows) byPos.set(r.pos, [...(byPos.get(r.pos) ?? []), r]);
const body = [...byPos.entries()]
  .map(
    ([pos, list]) =>
      `  // ${pos}\n` +
      list.map((r) => `  ${r.id}: ${JSON.stringify(r.name)},`).join('\n'),
  )
  .join('\n\n');

fs.writeFileSync(
  OUT,
  `/**
 * CFB 27 archetype names, keyed by the save's internal enum.
 *
 * GENERATED by scripts/extract-archetypes.ts — do not edit by hand.
 *
 * The save carries Madden-lineage identifiers (\`QB_FieldGeneral\`) while the
 * game shows its own labels (\`Pocket Passer\`). Those labels come from the ARCH
 * table of an FTC container in the game's Frostbite bundles, addressed by the
 * PlayerType enum's numeric value, so this mapping is derived rather than
 * guessed. Anything unmapped falls back to a readable form of the enum.
 */
export const ARCHETYPE_LABELS: Record<string, string> = {
${body}
};
`,
  'utf8',
);
console.log(`wrote ${OUT}`);
