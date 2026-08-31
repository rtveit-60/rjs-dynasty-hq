import { loadFranchise, mainTable, refFromRecord, val } from '../src/main/parser/franchise.ts';
const fr = await loadFranchise(process.argv[2]);
const rT = mainTable(fr, 'Recruit');
await rT.readRecords();
const raceT = (fr as any).getTableById(5858);
await raceT.readRecords();
// sample: three ranked recruits' race rows
let shown = 0;
const sizes = new Map<number, number>();
for (let i = 0; i < rT.records.length && shown < 3; i++) {
  const r = rT.records[i];
  if (r.isEmpty || i === 4101) continue;
  const ref = refFromRecord(r, 'TopSchoolsList');
  if (!ref || ref.tableId === 0) continue;
  const row = raceT.records[ref.row];
  if (shown < 3) {
    console.log(`recruit ${i} race row ${ref.row}: arraySize=${(row as any).arraySize} fields=${Object.keys(row._fields).length}`);
    const keys = Object.keys(row._fields).slice(0, 3);
    for (const k of keys) {
      const el = refFromRecord(row, k);
      console.log(`  ${k} -> ${el ? `table ${el.tableId} row ${el.row}` : String(row._fields[k].value).slice(0, 24)}`);
    }
    shown++;
  }
}
// arraySize distribution across all used race rows
for (const r of raceT.records as any[]) {
  if (r.isEmpty) continue;
  const n = (r as any).arraySize ?? -1;
  sizes.set(n, (sizes.get(n) ?? 0) + 1);
}
console.log('race arraySize distribution:', JSON.stringify([...sizes.entries()].sort((a, b) => a[0] - b[0])));
// what does an EMPTY race row look like / element table name
const el0 = (() => {
  for (const r of raceT.records as any[]) {
    if (r.isEmpty) continue;
    for (const k of Object.keys(r._fields)) {
      const ref = refFromRecord(r, k);
      if (ref && ref.tableId !== 0) return ref.tableId;
    }
  }
  return 0;
})();
const elT = el0 ? (fr as any).getTableById(el0) : null;
console.log('element table:', elT?.name, 'id', el0, 'capacity', elT?.header?.recordCapacity);
if (elT) {
  await elT.readRecords();
  let used = 0, empty = 0;
  for (const r of elT.records as any[]) { if (r.isEmpty) empty++; else used++; }
  console.log(`element rows used=${used} empty=${empty}`);
  const s0 = elT.records.find((r: any) => !r.isEmpty);
  console.log('element fields:', Object.keys(s0._fields).map((k) => `${k}=${String(s0._fields[k].value).slice(0, 18)}`).join(' | '));
}
