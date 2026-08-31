import { loadFranchise, mainTable, refFromRecord, val } from '../src/main/parser/franchise.ts';
const path = process.argv[2];
const fr = await loadFranchise(path);
const rT = mainTable(fr, 'Recruit');
await rT.readRecords();
const pT = mainTable(fr, 'Player');
await pT.readRecords();
const heads = new Map<string, number>();
const assets = new Map<string, number>();
let donor: any = null;
for (let i = 0; i < rT.records.length; i++) {
  if (i === 4101 || rT.records[i].isEmpty) continue;
  const ref = refFromRecord(rT.records[i], 'Player');
  const p = ref && pT.records[ref.row];
  if (!p || String(val(p, 'Position')) !== 'QB') continue;
  const head = String(val(p, 'PLYR_GENERICHEAD'));
  const asset = String(val(p, 'GenericHeadAssetName'));
  heads.set(head, (heads.get(head) ?? 0) + 1);
  const shape = asset.replace(/\d+/g, 'N');
  assets.set(shape, (assets.get(shape) ?? 0) + 1);
  if (!donor && head === '3_MorphHead' && Number(val(p, 'PLYR_PORTRAIT')) > 0) donor = p;
}
console.log('QB recruit PLYR_GENERICHEAD values:', JSON.stringify([...heads.entries()]));
console.log('QB recruit asset shapes:', JSON.stringify([...assets.entries()]));
console.log('sample donor:', donor ? `${val(donor, 'PLYR_GENERICHEAD')} / ${val(donor, 'GenericHeadAssetName')} / ${val(donor, 'PLYR_PORTRAIT')}` : 'none');
