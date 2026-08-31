import * as mfModule from 'madden-franchise';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  GAME_ROOT_DEFAULT, loadLayout, readTocPayload, parseSuperbundleToc,
  readRawCasBytes, decompressCasBlocksUnknownSize
} from './fb/frostbite.ts';
const mf: any = (mfModule as any).default ?? mfModule;
const fieldVal = (rec: any, key: string): any => {
  const f = rec?._fields?.[key];
  return f && 'value' in f ? f.value : undefined;
};
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
    if (image[p - 1] === 0 && image[p] >= 0x20 && image[p] < 0x7f && image[p + 1] >= 0x20 && image[p + 1] < 0x7f) starts.push(p);
  }
  const startSet = new Set(starts);
  let best: { base: number; hits: number } | null = null;
  for (const st of starts) {
    const base = st - offsets[0].off;
    if (base < nameAt || base > regionEnd) continue;
    let hits = 0;
    for (const o of offsets) if (startSet.has(base + o.off)) hits++;
    if (!best || hits > best.hits) best = { base, hits };
    if (hits === offsets.length) break;
  }
  if (!best) return out;
  for (const o of offsets) {
    const at = best.base + o.off;
    const end = image.indexOf(0, at);
    const str = image.toString('latin1', at, end < 0 ? at : Math.min(end, at + 120));
    if (/^[\x20-\x7e]+$/.test(str) && str.length) out.set(o.row, str);
  }
  return out;
}
process.on('unhandledRejection', () => {});
const layout = loadLayout(GAME_ROOT_DEFAULT);
const toc = parseSuperbundleToc(readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32', 'globals.toc')));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hours3-'));
let idx = 0;
for (const chunk of toc.chunks) {
  let payload: Buffer;
  try { payload = await decompressCasBlocksUnknownSize(layout, readRawCasBytes(layout, chunk.location)); } catch { continue; }
  if (payload.length < 4 || payload[0] !== 0x78) continue;
  let image: Buffer;
  try { image = zlib.inflateSync(payload); } catch { continue; }
  if (image.subarray(0, 4).toString('latin1') !== 'FrTk') continue;
  if (!image.includes(Buffer.from('RecruitingActionInfo'))) continue;
  const tmp = path.join(tmpDir, `s${idx++}.ftc`);
  fs.writeFileSync(tmp, payload);
  let store: any;
  try { store = await (mf.create ?? mf.FranchiseFile?.create)(tmp); } catch { continue; }
  const grab = async (name: string) => {
    const t = (store.tables as any[]).find((x) => x.name === name);
    if (!t) return null;
    try { await t.readRecords(); return t; } catch { return null; }
  };
  for (const name of ['RecruitingActionInfo', 'RecruitingActionTypeEnumTableEntry', 'RecruitingActionIntensityEnumTableEntry', 'RecruitingStageDetails']) {
    const t = await grab(name);
    if (!t) { console.log(`${name}: unreadable`); continue; }
    console.log(`== ${name} ==`);
    let shown = 0;
    for (let r = 0; r < t.records.length; r++) {
      const rec = t.records[r];
      if (rec.isEmpty || shown >= 14) continue;
      shown++;
      console.log(`  [${r}] ` + Object.keys(rec._fields).map((k) => `${k}=${String(rec._fields[k].value).slice(0, 14)}`).join(' '));
    }
    if (/EnumTableEntry/.test(name)) {
      const names = recoverStrings(image, t, 'Field_2');
      console.log('  names:', JSON.stringify([...names.entries()].map(([row, n]) => `${fieldVal(t.records[row], 'Field_3')}=${n}`)));
    }
  }
  break;
}
