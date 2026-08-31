import { loadFranchise, mainTable, refFromRecord, val } from '../src/main/parser/franchise.ts';
const fr = await loadFranchise(process.argv[2]);
const tT = (fr as any).getTableById(4302);
await tT.readRecords();
const rT = mainTable(fr, 'Recruit');
await rT.readRecords();
let used = 0, empty = 0;
const referenced = new Set<number>();
for (const r of tT.records as any[]) {
  if (r.isEmpty) { empty++; continue; }
  used++;
  const ref = refFromRecord(r, 'Recruit');
  if (ref && ref.tableId === 4281) referenced.add(ref.row);
}
console.log(`RecruitTarget: used=${used} empty=${empty} | distinct recruits referenced=${referenced.size}`);
console.log(`covers row 0: ${referenced.has(0)} | covers row 4100: ${referenced.has(4100)} | covers Aaron 4101: ${referenced.has(4101)}`);
// full field list of one row
const s0 = (tT.records as any[]).find((r) => !r.isEmpty);
console.log('fields:', Object.keys(s0._fields).map((k) => `${k}=${String(s0._fields[k].value).slice(0, 22)}`).join(' | '));
