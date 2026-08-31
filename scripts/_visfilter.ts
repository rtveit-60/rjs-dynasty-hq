import { loadFranchise, mainTable, refFromRecord, val } from '../src/main/parser/franchise.ts';
const fr = await loadFranchise(process.argv[2]);
const rT = mainTable(fr, 'Recruit');
await rT.readRecords();
let real = 0, natZero = 0, posZero = 0, stateZero = 0, raceZero = 0, offersZero = 0;
const advVals = new Map<string, number>();
let raceTableId = 0;
for (let i = 0; i < rT.records.length; i++) {
  if (i === 4101) continue;
  const r = rT.records[i];
  if (r.isEmpty) continue;
  real++;
  if (Number(val(r, 'NationalRank')) === 0) natZero++;
  if (Number(val(r, 'PositionRank')) === 0) posZero++;
  if (Number(val(r, 'StateRank')) === 0) stateZero++;
  if (Number(val(r, 'TotalScholarshipOffers')) === 0) offersZero++;
  const ref = refFromRecord(r, 'TopSchoolsList');
  if (!ref || ref.tableId === 0) raceZero++;
  else raceTableId = ref.tableId;
  const a = String(val(r, 'RecruitStageAdvance'));
  advVals.set(a, (advVals.get(a) ?? 0) + 1);
}
console.log(`real recruits: ${real}`);
console.log(`NationalRank=0: ${natZero} | PositionRank=0: ${posZero} | StateRank=0: ${stateZero} | offers=0: ${offersZero} | zero-ref race: ${raceZero}`);
console.log('RecruitStageAdvance values:', JSON.stringify([...advVals.entries()]));
// race array table + spare rows
const raceT = (fr as any).getTableById(raceTableId);
await raceT.readRecords();
let empty = 0, used = 0;
for (const rr of raceT.records as any[]) { if (rr.isEmpty) empty++; else used++; }
console.log(`race table: ${raceT.name} id=${raceTableId} capacity=${raceT.header?.recordCapacity} used=${used} empty=${empty}`);
// NationalRank range on real
let maxNat = 0; let maxPos = 0;
for (let i = 0; i < rT.records.length; i++) {
  if (i === 4101) continue;
  const r = rT.records[i];
  if (r.isEmpty) continue;
  maxNat = Math.max(maxNat, Number(val(r, 'NationalRank')));
  maxPos = Math.max(maxPos, Number(val(r, 'PositionRank')));
}
console.log(`max NationalRank: ${maxNat}, max PositionRank: ${maxPos}`);
