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
process.on('unhandledRejection', () => {});
const layout = loadLayout(GAME_ROOT_DEFAULT);
const toc = parseSuperbundleToc(readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32', 'globals.toc')));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spline-'));
let idx = 0;
for (const chunk of toc.chunks) {
  let payload: Buffer;
  try { payload = await decompressCasBlocksUnknownSize(layout, readRawCasBytes(layout, chunk.location)); } catch { continue; }
  if (payload.length < 4 || payload[0] !== 0x78) continue;
  let image: Buffer;
  try { image = zlib.inflateSync(payload); } catch { continue; }
  if (image.subarray(0, 4).toString('latin1') !== 'FrTk') continue;
  if (!image.includes(Buffer.from('MaxTotalHoursOnRecruitPerWeek'))) continue;
  const tmp = path.join(tmpDir, `s${idx++}.ftc`);
  fs.writeFileSync(tmp, payload);
  let store: any;
  try { store = await (mf.create ?? mf.FranchiseFile?.create)(tmp); } catch { continue; }
  for (const t of store.tables as any[]) {
    if (!t?.name) continue;
    let ok = true;
    try { await t.readRecords(); } catch { ok = false; }
    if (!ok) continue;
    const r0 = (t.records as any[]).find((r) => !r.isEmpty);
    if (!r0) continue;
    const keys = Object.keys(r0._fields ?? {});
    if (keys.some((k) => /MaxTotalHours|RecruitingHoursSpline/i.test(k))) {
      console.log(`TABLE ${t.name} (capacity ${t.header?.recordCapacity}, id ${t.header?.tableId})`);
      for (const k of keys) {
        console.log(`  ${k} = ${String(r0._fields[k].value).slice(0, 36)}`);
      }
    }
  }
  break;
}
