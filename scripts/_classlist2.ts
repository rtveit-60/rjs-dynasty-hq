import { loadFranchise, refFromRecord } from '../src/main/parser/franchise.ts';
const fr = await loadFranchise(process.argv[2]);
for (const id of [4992, 4302]) {
  const t = (fr as any).getTableById(id);
  if (!t) continue;
  await t.readRecords();
  console.log(`== ${t.name} id=${id} capacity=${t.header?.recordCapacity} ==`);
  for (let r = 0; r < Math.min(t.records.length, 2); r++) {
    const rec = t.records[r];
    if (!rec) continue;
    const keys = Object.keys(rec._fields ?? {});
    console.log(`row ${r}: isEmpty=${rec.isEmpty} arraySize=${(rec as any).arraySize} fields=${keys.length}`);
    if (t.name === 'Recruit[]') {
      const rows = new Set<number>();
      let nonzero = 0;
      for (const k of keys) {
        const ref = refFromRecord(rec, k);
        if (ref && ref.tableId === 4281) { rows.add(ref.row); nonzero++; }
      }
      console.log(`  recruit refs: ${nonzero}, distinct rows: ${rows.size}, has 4101 (Aaron): ${rows.has(4101)}, min: ${Math.min(...rows)}, max: ${Math.max(...rows)}`);
    } else {
      console.log('  sample fields: ' + keys.slice(0, 8).map((k) => `${k}=${String(rec._fields[k].value).slice(0, 20)}`).join(' | '));
    }
  }
}
// who references the Recruit[] row? scan tables for a ref -> tableId 4992
for (const t of (fr as any).tables) {
  if (!t?.name || t.name.endsWith('[]')) continue;
  if (!/Recruiting|Season|Class|Dynasty/i.test(t.name)) continue;
  try { await t.readRecords(); } catch { continue; }
  for (let r = 0; r < Math.min(t.records.length, 3); r++) {
    const rec = t.records[r];
    if (!rec || rec.isEmpty) continue;
    for (const k of Object.keys(rec._fields ?? {})) {
      const v = String(rec._fields[k]?.value ?? '');
      if (!/^[01]{32}$/.test(v)) continue;
      const ref = refFromRecord(rec, k);
      if (ref && ref.tableId === 4992) console.log(`referenced by ${t.name}.${k} (row ${r})`);
    }
  }
}
