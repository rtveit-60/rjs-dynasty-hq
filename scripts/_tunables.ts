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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tun-'));
let idx = 0;
for (const chunk of toc.chunks) {
  let payload: Buffer;
  try { payload = await decompressCasBlocksUnknownSize(layout, readRawCasBytes(layout, chunk.location)); } catch { continue; }
  if (payload.length < 4 || payload[0] !== 0x78) continue;
  let image: Buffer;
  try { image = zlib.inflateSync(payload); } catch { continue; }
  if (image.subarray(0, 4).toString('latin1') !== 'FrTk') continue;
  if (!image.includes(Buffer.from('RecruitingTunables'))) continue;
  const tmp = path.join(tmpDir, `s${idx++}.ftc`);
  fs.writeFileSync(tmp, payload);
  let store: any;
  try { store = await (mf.create ?? mf.FranchiseFile?.create)(tmp); } catch { continue; }
  const t = (store.tables as any[]).find((x: any) => x.name === 'RecruitingTunables');
  if (!t) continue;
  try { await t.readRecords(); } catch { continue; }
  const r0 = (t.records as any[]).find((r) => !r.isEmpty);
  if (!r0) continue;
  console.log('RecruitingTunables (by schema idx):');
  const IDX: Record<string, number> = {
    MaxTotalHoursOnRecruitPerWeek: 34,
    OffseasonRecruitingHoursSpline: 38,
    PlayoffRecruitingHoursSpline: 42,
    PreseasonRecruitingHoursSpline: 48,
    RegularSeasonRecruitingHoursSpline: 64
  };
  const keys = Object.keys(r0._fields);
  for (const [name, i] of Object.entries(IDX)) {
    console.log(`  ${name} (Field_${i}) = ${String(r0._fields[`Field_${i}`]?.value).slice(0, 36)}`);
  }
  // follow spline refs
  const byId = new Map<number, any>();
  for (const x of store.tables as any[]) if (x?.header?.tableId !== undefined) byId.set(x.header.tableId, x);
  for (const k of ['Field_38', 'Field_42', 'Field_48', 'Field_64']) {
    const v = Number(r0._fields[k]?.value ?? 0);
    if (!v) { console.log(`${k}: 0`); continue; }
    const tid = v >> 17;
    const row = v & 0x1ffff;
    const tt = byId.get(tid);
    console.log(`${k} -> ${tt?.name ?? '??'} (t${tid}) row ${row}`);
    if (tt) {
      try { if (!tt.recordsRead) await tt.readRecords(); } catch { continue; }
      const target = tt.records?.[row];
      if (target && !target.isEmpty) {
        console.log('   ' + Object.keys(target._fields).map((kk: string) => `${kk}=${String(target._fields[kk].value).slice(0, 22)}`).join(' '));
      }
    }
  }
  break;
}
