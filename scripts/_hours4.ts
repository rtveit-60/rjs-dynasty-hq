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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hours4-'));
let idx = 0;
for (const chunk of toc.chunks) {
  let payload: Buffer;
  try { payload = await decompressCasBlocksUnknownSize(layout, readRawCasBytes(layout, chunk.location)); } catch { continue; }
  if (payload.length < 4 || payload[0] !== 0x78) continue;
  let image: Buffer;
  try { image = zlib.inflateSync(payload); } catch { continue; }
  if (image.subarray(0, 4).toString('latin1') !== 'FrTk') continue;
  if (!image.includes(Buffer.from('RecruitingStageDetails'))) continue;
  const tmp = path.join(tmpDir, `s${idx++}.ftc`);
  fs.writeFileSync(tmp, payload);
  let store: any;
  try { store = await (mf.create ?? mf.FranchiseFile?.create)(tmp); } catch { continue; }
  const byId = new Map<number, any>();
  for (const t of store.tables as any[]) if (t?.header?.tableId !== undefined) byId.set(t.header.tableId, t);
  const sd = (store.tables as any[]).find((x: any) => x.name === 'RecruitingStageDetails');
  if (!sd) continue;
  await sd.readRecords();
  for (let r = 0; r < sd.records.length; r++) {
    const rec = sd.records[r];
    if (rec.isEmpty) continue;
    for (const k of Object.keys(rec._fields)) {
      const v = Number(rec._fields[k]?.value ?? 0);
      if (!v || v < (1 << 17)) { console.log(`SD[${r}].${k} = ${rec._fields[k]?.value}`); continue; }
      const tid = v >> 17;
      const row = v & 0x1ffff;
      const t2 = byId.get(tid);
      console.log(`SD[${r}].${k} -> ${t2?.name ?? '??'} (t${tid}) row ${row}`);
      if (t2) {
        try { if (!t2.recordsRead) await t2.readRecords(); } catch { continue; }
        const target = t2.records?.[row];
        if (target && !target.isEmpty) {
          console.log('    ' + Object.keys(target._fields).map((kk: string) => `${kk}=${String(target._fields[kk].value).slice(0, 14)}`).join(' '));
        }
      }
    }
  }
  break;
}
