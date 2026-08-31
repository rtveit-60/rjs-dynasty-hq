import { loadFranchise } from '../src/main/parser/franchise.ts';
const fr = await loadFranchise(process.argv[2]);
const t = (fr as any).getTableById(1329);
console.log('save table 1329:', t?.name, 'capacity', t?.header?.recordCapacity);
if (t) {
  await t.readRecords();
  for (let r = 0; r < Math.min(t.records.length, 8); r++) {
    const rec = t.records[r];
    if (!rec || rec.isEmpty) { console.log(`row ${r}: empty`); continue; }
    console.log(`row ${r}: ` + Object.keys(rec._fields).map((k: string) => `${k}=${String(rec._fields[k].value).slice(0, 16)}`).join(' '));
  }
}
