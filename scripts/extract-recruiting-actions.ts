/**
 * Generate src/shared/recruiting-actions.ts — the game's own weekly recruiting
 * action hour costs — from the franchise-common tuning store.
 *
 * The game does not let you assign freeform hours: each weekly action carries
 * a fixed hour price, and the sum is what a prospect costs. The definitions
 * live in `RecruitingActionInfo` (Field_0 = RecruitingActionType enum value,
 * Field_4 = RecruitingActionIntensity value for pitches / 4 = none,
 * Field_2 = the hour cost), joined to display names through
 * `RecruitingActionTypeEnumTableEntry` / `RecruitingActionIntensityEnumTableEntry`
 * (Field_3 = value; Field_0/1/2 = string-pool offsets, recovered from the
 * store image the same way the pitch extractor does).
 *
 * Verified anchors: Social Media = 5, Send the House = 50, Hard Sell = 40,
 * Soft Sell = 20, Sway = 30. Run after title updates; never hand-edit.
 *
 * Usage: node --max-old-space-size=8192 scripts/extract-recruiting-actions.ts [--print]
 */
import * as mfModule from 'madden-franchise';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  GAME_ROOT_DEFAULT,
  loadLayout,
  readTocPayload,
  parseSuperbundleToc,
  readRawCasBytes,
  decompressCasBlocksUnknownSize
} from './fb/frostbite.ts';

const mf: any = (mfModule as any).default ?? mfModule;
const OUT = 'src/shared/recruiting-actions.ts';
const printOnly = process.argv.includes('--print');
process.on('unhandledRejection', () => {});

const fieldVal = (rec: any, key: string): any => {
  const f = rec?._fields?.[key];
  return f && 'value' in f ? f.value : undefined;
};

/** Recover the string at each row's offset for one offset-carrying field. */
function recoverStrings(image: Buffer, table: any, field: string): Map<number, string> {
  const out = new Map<number, string>();
  const nameAt = image.indexOf(Buffer.from(table.name + '\x00'));
  if (nameAt < 0) return out;
  const regionEnd = Math.min(image.length, nameAt + 400000);
  const offsets: { row: number; off: number }[] = [];
  (table.records as any[]).forEach((r: any, row: number) => {
    if (r.isEmpty) return;
    const v = Number(fieldVal(r, field));
    if (Number.isFinite(v) && v >= 0) offsets.push({ row, off: v });
  });
  if (!offsets.length) return out;
  const starts: number[] = [];
  for (let p = nameAt; p < regionEnd; p++) {
    if (image[p - 1] === 0 && image[p] >= 0x20 && image[p] < 0x7f && image[p + 1] >= 0x20 && image[p + 1] < 0x7f) {
      starts.push(p);
    }
  }
  const startSet = new Set(starts);
  let best: { base: number; hits: number } | null = null;
  for (const s of starts) {
    const base = s - offsets[0].off;
    if (base < nameAt || base > regionEnd) continue;
    let hits = 0;
    for (const o of offsets) if (startSet.has(base + o.off)) hits++;
    if (!best || hits > best.hits) best = { base, hits };
    if (hits === offsets.length) break;
  }
  if (!best || best.hits < Math.max(2, Math.floor(offsets.length * 0.6))) return out;
  for (const o of offsets) {
    const at = best.base + o.off;
    const end = image.indexOf(0, at);
    const s = image.toString('latin1', at, end < 0 ? at : Math.min(end, at + 120));
    if (/^[\x20-\x7e]+$/.test(s) && s.length) out.set(o.row, s);
  }
  return out;
}

const layout = loadLayout(GAME_ROOT_DEFAULT);
const toc = parseSuperbundleToc(readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32', 'globals.toc')));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ractions-'));
let idx = 0;
let done = false;

for (const chunk of toc.chunks) {
  if (done) break;
  let payload: Buffer;
  try {
    payload = await decompressCasBlocksUnknownSize(layout, readRawCasBytes(layout, chunk.location));
  } catch {
    continue;
  }
  if (payload.length < 4 || payload[0] !== 0x78) continue;
  let image: Buffer;
  try {
    image = zlib.inflateSync(payload);
  } catch {
    continue;
  }
  if (image.subarray(0, 4).toString('latin1') !== 'FrTk') continue;
  if (!image.includes(Buffer.from('RecruitingActionInfo'))) continue;
  const tmp = path.join(tmpDir, `s${idx++}.ftc`);
  fs.writeFileSync(tmp, payload);
  let store: any;
  try {
    store = await (mf.create ?? mf.FranchiseFile?.create)(tmp);
  } catch {
    continue;
  }
  const grab = async (name: string): Promise<any | null> => {
    const t = (store.tables as any[]).find((x) => x.name === name);
    if (!t) return null;
    try {
      await t.readRecords();
      return t;
    } catch {
      return null;
    }
  };
  const infoT = await grab('RecruitingActionInfo');
  const typeT = await grab('RecruitingActionTypeEnumTableEntry');
  const intT = await grab('RecruitingActionIntensityEnumTableEntry');
  if (!infoT || !typeT || !intT) continue;

  // Names: each enum row carries three string offsets; recover every column
  // and keep the most descriptive (longest) per value — that disambiguates
  // rows whose short label collides.
  // Three offset columns per enum row; alignment can land spuriously on a
  // neighboring string pool, so recover each column separately and keep only
  // the column whose vocabulary is coherent for this enum.
  const bestColumn = (
    table: any,
    topical: RegExp
  ): Map<number, string> => {
    let best: Map<number, string> = new Map();
    let bestScore = -1;
    for (const f of ['Field_0', 'Field_1', 'Field_2']) {
      const rec = recoverStrings(image, table, f);
      if (!rec.size) continue;
      let score = 0;
      for (const [, str] of rec) if (topical.test(str)) score++;
      if (score > bestScore) {
        bestScore = score;
        best = new Map(
          [...rec.entries()].map(([row, str]) => [Number(fieldVal(table.records[row], 'Field_3')), str])
        );
      }
    }
    return best;
  };
  const typeNames = bestColumn(typeT, /pitch|scholar|visit|social|house|friends|dm |dm the|scout|hours/i);
  const intensityNames = bestColumn(intT, /sell|sway/i);
  console.log('type names:', JSON.stringify([...typeNames.entries()].sort((a, b) => a[0] - b[0])));
  console.log('intensity names:', JSON.stringify([...intensityNames.entries()].sort((a, b) => a[0] - b[0])));

  // Costs per (type, intensity)
  const rows: { type: number; intensity: number; hours: number }[] = [];
  for (const r of infoT.records as any[]) {
    if (r.isEmpty) continue;
    rows.push({
      type: Number(fieldVal(r, 'Field_0')),
      intensity: Number(fieldVal(r, 'Field_4')),
      hours: Number(fieldVal(r, 'Field_2'))
    });
  }
  console.log('info rows:', JSON.stringify(rows));

  const costOf = (type: number, intensity = 4): number | undefined =>
    rows.find((r) => r.type === type && r.intensity === intensity)?.hours;

  const findType = (rx: RegExp): number | undefined => {
    for (const [v, n] of typeNames) if (rx.test(n)) return v;
    return undefined;
  };

  const tFamily = findType(/friends/i);
  const tSocial = findType(/social/i);
  const tHouse = findType(/house/i);
  const tVisit = findType(/visit/i);
  const tScout = findType(/scout/i);
  const tScholarship = findType(/scholarship/i);
  const tPitch = findType(/^pitch$/i);
  if (
    tFamily === undefined || tSocial === undefined || tHouse === undefined ||
    tVisit === undefined || tScout === undefined || tScholarship === undefined ||
    tPitch === undefined
  ) {
    throw new Error(`type resolution failed: ${JSON.stringify([...typeNames.entries()])}`);
  }
  // The save's fifth checkbox field is named ContactHighSchoolCoaches, but no
  // action type carries that name — identifier drift, like the archetypes.
  // Five checkbox fields map to five non-pitch/scout/scholarship/spend-hours
  // action types: after the four name-matched ones (and both send-the-house
  // variants), exactly one type must remain, and that is the drifted
  // checkbox's real action.
  const spendHours = findType(/spend hours/i);
  const claimed = new Set([tFamily, tSocial, tVisit, tScout, tScholarship, tPitch, spendHours]);
  for (const [v, n] of typeNames) if (/house/i.test(n)) claimed.add(v);
  const leftovers = [...typeNames.keys()].filter((v) => !claimed.has(v));
  if (leftovers.length !== 1) {
    throw new Error(`elimination failed — leftovers ${JSON.stringify(leftovers)}`);
  }
  const tCoaches = leftovers[0];
  console.log(`ContactHighSchoolCoaches resolves to "${typeNames.get(tCoaches)}" (value ${tCoaches}) by elimination`);

  const iSoft = [...intensityNames.entries()].find(([, n]) => /soft/i.test(n))?.[0];
  const iHard = [...intensityNames.entries()].find(([, n]) => /hard/i.test(n))?.[0];
  const iSway = [...intensityNames.entries()].find(([, n]) => /sway/i.test(n))?.[0];
  if (iSoft === undefined || iHard === undefined || iSway === undefined) {
    throw new Error('intensity resolution failed');
  }

  const ACTION_HOURS = {
    contactFamily: costOf(tFamily)!,
    contactCoaches: costOf(tCoaches)!,
    socialMedia: costOf(tSocial)!,
    sendHouse: costOf(tHouse)!,
    visitSchool: costOf(tVisit)!,
    scoutFull: costOf(tScout)!,
    scholarship: costOf(tScholarship)!,
    softSell: costOf(tPitch, iSoft)!,
    hardSell: costOf(tPitch, iHard)!,
    sway: costOf(tPitch, iSway)!
  };
  const ACTION_LABELS = {
    contactFamily: typeNames.get(tFamily)!,
    contactCoaches: typeNames.get(tCoaches)!,
    socialMedia: typeNames.get(tSocial)!,
    sendHouse: typeNames.get(tHouse)!,
    visitSchool: typeNames.get(tVisit)!,
    scoutFull: typeNames.get(tScout)!
  };
  console.log('ACTION_LABELS:', JSON.stringify(ACTION_LABELS));
  console.log('ACTION_HOURS:', JSON.stringify(ACTION_HOURS));

  // anchors
  if (ACTION_HOURS.socialMedia !== 5 || ACTION_HOURS.sendHouse !== 50 ||
      ACTION_HOURS.hardSell !== 40 || ACTION_HOURS.softSell !== 20 || ACTION_HOURS.sway !== 30) {
    throw new Error(`anchor failed: ${JSON.stringify(ACTION_HOURS)}`);
  }
  if (Object.values(ACTION_HOURS).some((v) => !Number.isFinite(v))) {
    throw new Error('a cost failed to resolve');
  }

  const banner = `/**
 * GENERATED by scripts/extract-recruiting-actions.ts — do not hand-edit.
 *
 * The game's weekly recruiting action hour costs, from RecruitingActionInfo
 * in the franchise-common tuning store (names joined via the action-type and
 * intensity enum tables). Hours are not freeform: each action costs a fixed
 * price, and a prospect's week is the sum of what you select.
 * Regenerate after game title updates:
 *   node --max-old-space-size=8192 scripts/extract-recruiting-actions.ts
 */
`;
  const body =
    banner +
    `\n/** Hour cost of each weekly action, keyed by the app's action ids. */` +
    `\nexport const ACTION_HOURS = ${JSON.stringify(ACTION_HOURS, null, 2)} as const;\n` +
    `\n/** The game's own display names — the save's field names have drifted:` +
    `\n * ContactHighSchoolCoaches is really "${ACTION_LABELS.contactCoaches}". */` +
    `\nexport const ACTION_LABELS = ${JSON.stringify(ACTION_LABELS, null, 2)} as const;\n` +
    `\n/** RecruitingActionType value -> the game's display name. */` +
    `\nexport const ACTION_NAMES: Record<number, string> = ${JSON.stringify(Object.fromEntries([...typeNames.entries()].sort((a, b) => a[0] - b[0])), null, 2)};\n`;
  if (printOnly) console.log(body);
  else {
    fs.writeFileSync(OUT, body.replace(/\r\n/g, '\n'));
    console.log(`wrote ${OUT}`);
  }
  done = true;
}
if (!done) throw new Error('RecruitingActionInfo store not found');
