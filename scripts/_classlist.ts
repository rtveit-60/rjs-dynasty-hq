import { loadFranchise, mainTable, refFromRecord } from '../src/main/parser/franchise.ts';
const fr = await loadFranchise(process.argv[2]);
const rT = mainTable(fr, 'Recruit');
const recruitTableId = rT.header?.tableId;
console.log('Recruit table id:', recruitTableId);
// every table with Recruit in the name
for (const t of (fr as any).tables) {
  if (!t?.name || !/recruit/i.test(t.name)) continue;
  console.log(`  ${t.name} id=${t.header?.tableId} capacity=${t.header?.recordCapacity}`);
}
// array tables whose rows hold refs INTO the Recruit table
let hits = 0;
for (const t of (fr as any).tables) {
  if (!t?.name || !t.name.endsWith('[]') || hits >= 8) continue;
  try {
    await t.readRecords();
  } catch { continue; }
  for (let r = 0; r < Math.min(t.records.length, 4); r++) {
    const rec = t.records[r];
    if (!rec || rec.isEmpty) continue;
    let count = 0, total = 0;
    for (const k of Object.keys(rec._fields ?? {})) {
      const v = String(rec._fields[k]?.value ?? '');
      if (!/^[01]{32}$/.test(v) || v === '0'.repeat(32)) continue;
      total++;
      const ref = refFromRecord(rec, k);
      if (ref && ref.tableId === recruitTableId) count++;
    }
    if (count >= 5) {
      console.log(`ARRAY HIT: ${t.name} id=${t.header?.tableId} row=${r}: ${count} recruit refs (of ${total} refs, arraySize=${rec.arraySize ?? '?'}, fields=${Object.keys(rec._fields).length})`);
      hits++;
    }
  }
}
console.log('done');
