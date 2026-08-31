import { loadFranchise, mainTable, refFromRecord, val } from '../src/main/parser/franchise.ts';
const path = process.argv[2];
const refString = (tableId: number, row: number): string =>
  tableId.toString(2).padStart(15, '0') + row.toString(2).padStart(17, '0');
const fr = await loadFranchise(path);
const rT = mainTable(fr, 'Recruit');
await rT.readRecords();
const pT = mainTable(fr, 'Player');
await pT.readRecords();
const playerTableId = pT.header?.tableId;

// recruit #4100 (last ranked) and its current filler player
let hostRow = -1;
for (let i = 0; i < rT.records.length; i++) {
  if (i === 4101 || rT.records[i].isEmpty) continue;
  if (Number(val(rT.records[i], 'NationalRank')) === 4100) { hostRow = i; break; }
}
const host = rT.records[hostRow];
const oldRef = refFromRecord(host, 'Player')!;
const oldP = pT.records[oldRef.row];
console.log(`host recruit row ${hostRow} (#4100): was ${val(oldP, 'FirstName')} ${val(oldP, 'LastName')} (${val(oldP, 'Position')}), player row ${oldRef.row}`);

// Aaron's rows
const aaronRec = rT.records[4101];
const aaronPRow = refFromRecord(aaronRec, 'Player')!.row;
console.log(`Aaron player row ${aaronPRow}`);

// 1. host recruit now fronts Aaron's player
(host as any).Player = refString(playerTableId, aaronPRow);
// 2. retire the displaced filler player
oldP.empty();
// 3. dissolve Aaron's appended recruit row + return the race spares
const raceRef = refFromRecord(aaronRec, 'TopSchoolsList');
(aaronRec as any).TopSchoolsList = '0'.repeat(32);
aaronRec.empty();
if (raceRef && raceRef.tableId === 5858) {
  const raceT = (fr as any).getTableById(5858);
  await raceT.readRecords();
  const arr = raceT.records[raceRef.row];
  const elT = (fr as any).getTableById(5856);
  await elT.readRecords();
  for (let s = 0; s < 10; s++) {
    const er = refFromRecord(arr, `ProspectTargetSchool${s}`);
    if (er && er.tableId === 5856) elT.records[er.row].empty();
  }
  arr.empty();
  raceT.recalculateEmptyRecordReferences?.();
  elT.recalculateEmptyRecordReferences?.();
}
rT.recalculateEmptyRecordReferences?.();
pT.recalculateEmptyRecordReferences?.();

await (fr as any).save(path);
const check = await loadFranchise(path);
const rT2 = mainTable(check, 'Recruit');
await rT2.readRecords();
const pT2 = mainTable(check, 'Player');
await pT2.readRecords();
const h2 = rT2.records[hostRow];
const p2 = pT2.records[refFromRecord(h2, 'Player')!.row];
console.log(`verify: recruit #${val(h2, 'NationalRank')} now fronts ${val(p2, 'FirstName')} ${val(p2, 'LastName')} (${val(p2, 'Position')}, ${val(p2, 'PLYR_HOME_STATE')})`);
console.log(`verify: row 4101 empty=${rT2.records[4101].isEmpty}, old player empty=${pT2.records[oldRef.row].isEmpty}`);
