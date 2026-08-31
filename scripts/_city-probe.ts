import { loadFranchise, mainTable, val } from '../src/main/parser/franchise.ts';
const fr = await loadFranchise(process.argv[2]);
const pT = mainTable(fr, 'Player');
await pT.readRecords();
const abe = pT.records[8075];
// candidate fields on the Player row
const keys = Object.keys(abe._fields).filter((k) => /home|city|town|pipe|region|birth|state/i.test(k));
console.log('city-ish Player fields:', keys.join(', '));
for (const k of keys) console.log(`  abe.${k} = ${String(abe._fields[k]?.value).slice(0, 40)}`);
// the ACTUAL create template: replicate templatePool's pick for WR_DeepThreat
const rT = mainTable(fr, 'Recruit');
await rT.readRecords();
const playerTableId = pT.header?.tableId;
// templatePool: first clean archetype-matched CLASS recruit (mirror rough logic: first recruit whose player has this archetype)
for (const r of rT.records as any[]) {
  if (r.isEmpty) continue;
  const ref = (await import('../src/main/parser/franchise.ts')).refFromRecord(r, 'Player');
  if (!ref || ref.tableId !== playerTableId) continue;
  const p = pT.records[ref.row];
  if (p?.isEmpty || String(val(p, 'PlayerType')) !== 'WR_DeepThreat') continue;
  console.log(`first WR_DeepThreat class template: player row ${ref.row} (${val(p, 'FirstName')} ${val(p, 'LastName')})`);
  for (const k of keys) console.log(`  tmpl.${k} = ${String(p._fields[k]?.value).slice(0, 40)}`);
  break;
}
// any city-like tables in the save?
const names = new Set<string>();
for (const t of (fr as any).tables) if (t?.name && /city|town|pipeline|region/i.test(t.name)) names.add(t.name);
console.log('city-ish tables in save:', [...names].join(', ') || '(none)');
