import { loadFranchise, mainTable, refFromRecord, val } from '../src/main/parser/franchise.ts';
const path = process.argv[2];
const fr = await loadFranchise(path);
const rT = mainTable(fr, 'Recruit');
await rT.readRecords();
const pT = mainTable(fr, 'Player');
await pT.readRecords();
// donor: a zero-offer QB recruit with a Generic (non-morph) recruit-pattern head
let donor: any = null;
for (let i = 0; i < rT.records.length; i++) {
  if (i === 4101 || rT.records[i].isEmpty) continue;
  const ref = refFromRecord(rT.records[i], 'Player');
  const p = ref && pT.records[ref.row];
  if (!p || String(val(p, 'Position')) !== 'QB') continue;
  const asset = String(val(p, 'GenericHeadAssetName') ?? '');
  if (/^Generic_\d+_P_T\d+_[A-Z]_\d$/.test(asset) && Number(val(p, 'PLYR_PORTRAIT')) > 0) { donor = p; break; }
}
if (!donor) throw new Error('no donor');
console.log(`donor face: ${val(donor, 'PLYR_GENERICHEAD')} / ${val(donor, 'GenericHeadAssetName')} / ${val(donor, 'PLYR_PORTRAIT')}`);
const aaron = pT.records[refFromRecord(rT.records[4101], 'Player')!.row];
(aaron as any).PLYR_GENERICHEAD = String(val(donor, 'PLYR_GENERICHEAD'));
(aaron as any).GenericHeadAssetName = String(val(donor, 'GenericHeadAssetName'));
(aaron as any).PLYR_PORTRAIT = Number(val(donor, 'PLYR_PORTRAIT'));
await (fr as any).save(path);
const check = await loadFranchise(path);
const pT2 = mainTable(check, 'Player');
await pT2.readRecords();
const a2 = pT2.records[refFromRecord(rT.records[4101], 'Player')!.row];
console.log(`written: ${val(a2, 'PLYR_GENERICHEAD')} / ${val(a2, 'GenericHeadAssetName')} / ${val(a2, 'PLYR_PORTRAIT')}`);
