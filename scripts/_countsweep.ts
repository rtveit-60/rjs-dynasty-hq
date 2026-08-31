import { loadFranchise } from '../src/main/parser/franchise.ts';
const fr = await loadFranchise(process.argv[2]);
const targets = new Set([4100, 4101]);
for (const t of (fr as any).tables) {
  if (!t?.name || (t.header?.recordCapacity ?? 0) > 300) continue;
  try { await t.readRecords(); } catch { continue; }
  for (let r = 0; r < t.records.length; r++) {
    const rec = t.records[r];
    if (!rec || rec.isEmpty) continue;
    for (const k of Object.keys(rec._fields ?? {})) {
      const v = rec._fields[k]?.value;
      if (typeof v === 'number' && targets.has(v)) {
        console.log(`${t.name}[${r}].${k} = ${v} (table ${t.header?.tableId})`);
      }
    }
  }
}
console.log('sweep done');
