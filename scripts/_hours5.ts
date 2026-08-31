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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hours5-'));
let idx = 0;
const seen = new Set<string>();
for (const chunk of toc.chunks) {
  let payload: Buffer;
  try { payload = await decompressCasBlocksUnknownSize(layout, readRawCasBytes(layout, chunk.location)); } catch { continue; }
  if (payload.length < 4 || payload[0] !== 0x78) continue;
  let image: Buffer;
  try { image = zlib.inflateSync(payload); } catch { continue; }
  if (image.subarray(0, 4).toString('latin1') !== 'FrTk') continue;
  const tmp = path.join(tmpDir, `s${idx++}.ftc`);
  fs.writeFileSync(tmp, payload);
  let store: any;
  try { store = await (mf.create ?? mf.FranchiseFile?.create)(tmp); } catch { continue; }
  const t = (store.tables as any[]).find((x: any) => x?.header?.tableId === 1329);
  if (!t || seen.has(t.name)) continue;
  seen.add(t.name);
  console.log(`store #${idx - 1}: table 1329 = ${t.name} capacity=${t.header?.recordCapacity}`);
  try {
    await t.readRecords();
    let shown = 0;
    for (let r = 0; r < t.records.length && shown < 8; r++) {
      const rec = t.records[r];
      if (rec.isEmpty) continue;
      shown++;
      console.log(`  [${r}] ` + Object.keys(rec._fields).map((k: string) => `${k}=${String(rec._fields[k].value).slice(0, 14)}`).join(' '));
    }
  } catch (e) { console.log('  unreadable'); }
}
