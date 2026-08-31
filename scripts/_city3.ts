import { loadFranchise } from '../src/main/parser/franchise.ts';
const fr = await loadFranchise(process.argv[2]);
for (const t of (fr as any).tables) {
  if (t?.name !== 'City' && t?.name !== 'City[]') continue;
  await t.readRecords();
  let filled = 0;
  for (const r of t.records as any[]) if (!r.isEmpty) filled++;
  console.log(`${t.name} id=${t.header?.tableId} capacity=${t.header?.recordCapacity} filled=${filled}`);
  if (filled > 0 && t.name === 'City') {
    const c0 = t.records.find((r: any) => !r.isEmpty);
    console.log('  columns:', Object.keys(c0._fields).join(', '));
    let n = 0;
    for (const r of t.records as any[]) {
      if (r.isEmpty || n >= 5) continue;
      n++;
      console.log('  ' + Object.keys(r._fields).map((k) => `${k}=${String(r._fields[k].value).slice(0, 26)}`).join(' | '));
    }
  }
}
