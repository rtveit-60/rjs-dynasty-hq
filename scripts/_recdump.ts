import { loadFranchise, mainTable, val } from '../src/main/parser/franchise.ts';
const fr = await loadFranchise(process.argv[2]);
const rT = mainTable(fr, 'Recruit');
await rT.readRecords();
const rec = rT.records[4101];
console.log('ALL Recruit fields for Abraham (row 4101):');
for (const k of Object.keys(rec._fields)) {
  console.log(`  ${k} = ${String(rec._fields[k].value).slice(0, 44)}`);
}
