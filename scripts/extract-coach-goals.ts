/**
 * Generate src/main/data/coach-goals.ts from the game's own tuning data.
 *
 * The save's `Team.HCContractGoal1..3` refs are FranTk asset ids into the
 * game-side "franchise-common" tuning stores: Win32/globals TOC chunks whose
 * decompressed payload is a bare zlib stream inflating to a `FrTk` image.
 * madden-franchise opens those directly, and each store's asset table maps the
 * raw 32-bit ref (high bit kept) to a record in one of the CoachContract*Goal
 * tables — see "AD goal wording — FOUND" in docs/RESEARCH.md.
 *
 * The library has no CFB schema for common files, so records decode as generic
 * Field_N. Wording is recovered from each table's string pool instead: solve
 * the pool base by aligning one field's offsets against string starts, then a
 * field is a real string column iff every row's value lands on a string start
 * (or a NUL for empties). Description is the string column with the longest
 * mean text; ProgressDisplayFormat is the other one. Derived, not guessed.
 *
 * Usage: node scripts/extract-coach-goals.ts [--print]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import * as mfModule from 'madden-franchise';
import {
  GAME_ROOT_DEFAULT,
  loadLayout,
  readTocPayload,
  parseSuperbundleToc,
  readRawCasBytes,
  decompressCasBlocksUnknownSize,
} from './fb/frostbite.ts';

const mf: any = (mfModule as any).default ?? mfModule;
const OUT = 'src/main/data/coach-goals.ts';
const printOnly = process.argv.includes('--print');

/** Goal-definition tables worth harvesting (base CoachContractGoal subtypes + milestones). */
const GOAL_TABLES = new Set([
  'CoachContractExpressionGoal',
  'CoachContractStatGoal',
  'CoachContractRecruitGoal',
  'CoachContractGradeGoal',
  'CoachContractAwardGoal',
  'CoachAwardMilestoneGoal',
  'CoachBowlBidMilestoneGoal',
  'CoachFootballRecordMilestoneGoal',
]);
const MAX_STORE_BYTES = 8 * 1024 * 1024; // tuning stores are ~0.5-4.2MB; skip template DBs

// ---- 1. Find every franchise-common (zlib->FrTk) store in Win32/globals ----

interface Store {
  guid: string;
  image: Buffer; // inflated FrTk image (for string pools)
  zlibPayload: Buffer; // the raw zlib stream (what madden-franchise wants on disk)
}

async function findStores(): Promise<Store[]> {
  const layout = loadLayout(GAME_ROOT_DEFAULT);
  const toc = parseSuperbundleToc(
    readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32', 'globals.toc')),
  );
  const stores: Store[] = [];
  for (const chunk of toc.chunks) {
    if (chunk.location.size > MAX_STORE_BYTES) continue;
    let payload: Buffer;
    try {
      payload = await decompressCasBlocksUnknownSize(layout, readRawCasBytes(layout, chunk.location));
    } catch {
      continue;
    }
    if (payload.length < 4 || payload[0] !== 0x78 || (payload[1] !== 0x9c && payload[1] !== 0xda)) continue;
    let image: Buffer;
    try {
      image = zlib.inflateSync(payload);
    } catch {
      continue;
    }
    if (image.subarray(0, 4).toString('latin1') !== 'FrTk') continue;
    stores.push({ guid: chunk.guid, image, zlibPayload: payload });
  }
  return stores;
}

// ---- 2. String-pool recovery for one generically-parsed table ----

/** Positions where a printable run of >=3 chars begins right after a NUL. */
function stringStarts(buf: Buffer, from: number, to: number): Set<number> {
  const s = new Set<number>();
  for (let p = from; p < to; p++) {
    if (buf[p - 1] !== 0) continue;
    if (
      buf[p] >= 0x20 && buf[p] < 0x7f &&
      buf[p + 1] >= 0x20 && buf[p + 1] < 0x7f &&
      buf[p + 2] >= 0x20 && buf[p + 2] < 0x7f
    ) s.add(p);
  }
  return s;
}

function readCString(buf: Buffer, at: number): string {
  const end = buf.indexOf(0, at);
  return buf.toString('latin1', at, end < 0 ? at : Math.min(end, at + 300));
}

/**
 * Tables with only a record or two under-constrain the pool-base solve, which
 * can land an offset a few bytes early — inside the binary tail before the
 * real string. Cut everything up to the last non-ASCII byte, then insist the
 * result reads like a sentence; return '' (drop) when it does not.
 */
function sanitize(s: string): string {
  let out = s;
  for (let i = out.length - 1; i >= 0; i--) {
    const c = out.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) {
      out = out.slice(i + 1);
      break;
    }
  }
  out = out.trim();
  return /^[A-Za-z0-9(]/.test(out) ? out : '';
}

interface TableStrings {
  /** row -> { desc, fmt } */
  rows: Map<number, { desc: string; fmt: string }>;
}

async function recoverTableStrings(image: Buffer, table: any): Promise<TableStrings | null> {
  await table.readRecords();
  const nameAt = image.indexOf(Buffer.from(table.name + '\x00'));
  if (nameAt < 0) return null;
  const regionEnd = Math.min(image.length, nameAt + 400000);
  const starts = stringStarts(image, nameAt, regionEnd);
  const fields: string[] = table.offsetTable.map((o: any) => o.name);

  const valuesOf = (f: string): number[] | null => {
    const vals: number[] = [];
    for (const r of table.records) {
      let v: unknown;
      try {
        v = r.getValueByKey(f);
      } catch {
        return null;
      }
      if (typeof v !== 'number' || v < 0 || v > 300000) return null;
      vals.push(v);
    }
    return vals;
  };

  // Solve the pool base: some field whose every row-offset is a string start.
  let base = -1;
  for (const f of fields) {
    const vals = valuesOf(f);
    if (!vals) continue;
    for (const s of starts) {
      const b: number = s - vals[0];
      if (b <= nameAt || b >= regionEnd) continue;
      if (vals.every((v) => starts.has(b + v))) {
        base = b;
        break;
      }
    }
    if (base >= 0) break;
  }
  if (base < 0) return null;

  // True string columns: every row's value is a string start or an empty (NUL).
  const stringCols: { field: string; vals: number[]; mean: number }[] = [];
  for (const f of fields) {
    const vals = valuesOf(f);
    if (!vals) continue;
    if (!vals.every((v) => starts.has(base + v) || image[base + v] === 0)) continue;
    const mean = vals.reduce((a, v) => a + readCString(image, base + v).length, 0) / vals.length;
    if (mean < 1) continue; // all-empty column
    stringCols.push({ field: f, vals, mean });
  }
  if (!stringCols.length) return null;
  stringCols.sort((a, b) => b.mean - a.mean);
  const descCol = stringCols[0];
  const fmtCol = stringCols.find((c) => c !== descCol && c.vals.some((v) => readCString(image, base + v).includes('<')));

  const rows = new Map<number, { desc: string; fmt: string }>();
  for (let i = 0; i < table.records.length; i++) {
    rows.set(i, {
      desc: readCString(image, base + descCol.vals[i]),
      fmt: fmtCol ? readCString(image, base + fmtCol.vals[i]) : '',
    });
  }
  return { rows };
}

// ---- 3. Harvest each store's asset table into id -> wording ----

interface Harvest {
  guid: string;
  assetCount: number;
  map: Map<string, { desc: string; fmt: string; table: string; row: number }>;
}

async function harvestStore(store: Store, tmpDir: string): Promise<Harvest | null> {
  const tmp = path.join(tmpDir, `store-${store.guid}.ftc`);
  fs.writeFileSync(tmp, store.zlibPayload);
  const create = mf.create ?? mf.FranchiseFile?.create;
  let franchise: any;
  try {
    franchise = await create(tmp);
  } catch {
    return null;
  }
  const goalTables = (franchise.tables as any[]).filter((t) => GOAL_TABLES.has(t.name));
  if (!goalTables.length) return null;

  const stringsByTable = new Map<string, TableStrings | null>();
  for (const t of goalTables) stringsByTable.set(t.name, await recoverTableStrings(store.image, t));

  const map = new Map<string, { desc: string; fmt: string; table: string; row: number }>();
  for (const entry of franchise.assetTable as { assetId: unknown; reference: unknown }[]) {
    const assetId = Number(entry.assetId) >>> 0;
    if (!(assetId & 0x80000000)) continue;
    const ref = Number(entry.reference) >>> 0;
    const tableId = ref >>> 17;
    const row = ref & 0x1ffff;
    const table = goalTables.find((t) => t.header?.tableId === tableId);
    if (!table) continue;
    const strings = stringsByTable.get(table.name);
    const w = strings?.rows.get(row);
    if (!w) continue;
    const desc = sanitize(w.desc);
    if (!desc) continue;
    // Same id shape the save-side goalRefId() produces: flag-stripped table, 17-bit row.
    const key = `${(assetId >>> 17) & 0x3fff}:${assetId & 0x1ffff}`;
    map.set(key, { desc, fmt: sanitize(w.fmt), table: table.name, row });
  }
  return { guid: store.guid, assetCount: (franchise.assetTable as unknown[]).length, map };
}

// ---- 4. Merge revisions, emit ----

const stores = await findStores();
console.log(`franchise-common stores under ${MAX_STORE_BYTES / 1e6}MB in Win32/globals: ${stores.length}`);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-goals-'));
const harvests: Harvest[] = [];
try {
  for (const store of stores) {
    const h = await harvestStore(store, tmpDir);
    if (h) {
      harvests.push(h);
      console.log(`  ${h.guid}: ${h.map.size} goal ids (assetTable ${h.assetCount})`);
    }
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
if (!harvests.length) {
  console.error('No tuning store with goal tables found — nothing written.');
  process.exit(1);
}

// Bigger asset table = later title-update revision; let it win conflicts.
harvests.sort((a, b) => a.assetCount - b.assetCount);
const merged = new Map<string, { desc: string; fmt: string; table: string; row: number }>();
let conflicts = 0;
for (const h of harvests) {
  for (const [k, v] of h.map) {
    const prev = merged.get(k);
    if (prev && prev.desc !== v.desc) {
      conflicts++;
      console.warn(`conflict ${k}: "${prev.desc}" -> "${v.desc}" (kept newer)`);
    }
    merged.set(k, v);
  }
}
console.log(`merged: ${merged.size} distinct goal ids, ${conflicts} conflicts`);

const keys = [...merged.keys()].sort((a, b) => {
  const [ta, ra] = a.split(':').map(Number);
  const [tb, rb] = b.split(':').map(Number);
  return ta - tb || ra - rb;
});

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const lines = keys.map((k) => {
  const v = merged.get(k)!;
  return `  '${k}': '${esc(v.desc)}', // ${v.table}[${v.row}]`;
});

const banner = `/**
 * Wording for the AD's seasonal goals, keyed by the save's goal reference
 * (\`goalRefId()\` form: flag-stripped asset table + 17-bit row).
 *
 * GENERATED by scripts/extract-coach-goals.ts from the game's own tuning
 * stores (franchise-common FrTk images in Win32/globals) — do not hand-edit.
 * Regenerate after a title update. Texts are verbatim game data and may carry
 * runtime placeholders (<oppteamlongname>, <time>, <time_maint>); display
 * cleanup happens in extract.ts, not here.
 */
export const COACH_GOAL_LABELS: Record<string, string> = {
${lines.join('\n')}
};
`;

if (printOnly) {
  console.log(banner);
} else {
  fs.writeFileSync(OUT, banner);
  console.log(`wrote ${OUT}: ${keys.length} goals`);
}
