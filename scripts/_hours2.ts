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
const layout = loadLayout(GAME_ROOT_DEFAULT);
const toc = parseSuperbundleToc(readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32', 'globals.toc')));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hours-'));
let idx = 0;
const seen = new Set<string>();
process.on('unhandledRejection', () => {});
for (const chunk of toc.chunks) {
  let payload: Buffer;
  try { payload = await decompressCasBlocksUnknownSize(layout, readRawCasBytes(layout, chunk.location)); } catch { continue; }
  if (payload.length < 4 || payload[0] !== 0x78) continue;
  let image: Buffer;
  try { image = zlib.inflateSync(payload); } catch { continue; }
  if (image.subarray(0, 4).toString('latin1') !== 'FrTk') continue;
  if (!image.includes(Buffer.from('Recruiting'))) continue;
  const tmp = path.join(tmpDir, `s${idx++}.ftc`);
  fs.writeFileSync(tmp, payload);
  let store: any;
  try { store = await (mf.create ?? mf.FranchiseFile?.create)(tmp); } catch { continue; }
  const names = (store.tables as any[]).map((t) => t.name).filter(Boolean);
  const hits = names.filter((n) => /RecruitingAction|Intensity|Hour|StageInfo|RecruitingStage|SellInfo/i.test(n));
  if (hits.length) {
    const key = hits.sort().join(',');
    if (!seen.has(key)) {
      seen.add(key);
      console.log(`store #${idx - 1}: ${hits.join(', ')}`);
    }
  }
}
console.log('done', idx, 'stores');
