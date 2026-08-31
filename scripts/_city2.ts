import { loadFranchise, mainTable, refFromRecord, val } from '../src/main/parser/franchise.ts';
const fr = await loadFranchise(process.argv[2]);
let cT: any = null;
for (const t of (fr as any).tables) if (t?.name === 'City') {
  if (!cT || (t.header?.recordCapacity ?? 0) > (cT.header?.recordCapacity ?? 0)) cT = t;
}
await cT.readRecords();
console.log('City table id:', cT.header?.tableId, 'capacity:', cT.header?.recordCapacity);
const c0 = cT.records.find((r: any) => !r.isEmpty);
console.log('City columns:', Object.keys(c0._fields).join(', '));
let n = 0;
for (const r of cT.records as any[]) {
  if (r.isEmpty || n >= 6) continue;
  n++;
  console.log('  ' + Object.keys(r._fields).map((k) => `${k}=${String(r._fields[k].value).slice(0, 24)}`).join(' | '));
}
// find Dana Point
for (let i = 0; i < cT.records.length; i++) {
  const r = cT.records[i];
  if (!r.isEmpty && Object.keys(r._fields).some((k) => String(r._fields[k].value).includes('Dana Point'))) {
    console.log(`Dana Point at City row ${i}:`, Object.keys(r._fields).map((k) => `${k}=${String(r._fields[k].value).slice(0, 24)}`).join(' | '));
  }
}
// does any Player/Recruit field reference the City table?
const pT = mainTable(fr, 'Player');
await pT.readRecords();
const abe = pT.records[8075];
const cityTableId = cT.header?.tableId;
for (const k of Object.keys(abe._fields)) {
  const v = String(abe._fields[k]?.value ?? '');
  if (/^[01]{32}$/.test(v)) {
    const ref = refFromRecord(abe, k);
    if (ref && ref.tableId === cityTableId) console.log(`Abraham Player ref -> City: ${k} row ${ref.row}`);
  }
}
const rT = mainTable(fr, 'Recruit');
await rT.readRecords();
const rec = rT.records[4101];
console.log('Recruit city-ish fields:', Object.keys(rec._fields).filter((k) => /home|city|town|pipe|region/i.test(k)).map((k) => `${k}=${String(rec._fields[k].value).slice(0, 30)}`).join(' | ') || '(none)');
for (const k of Object.keys(rec._fields)) {
  const v = String(rec._fields[k]?.value ?? '');
  if (/^[01]{32}$/.test(v)) {
    const ref = refFromRecord(rec, k);
    if (ref && ref.tableId === cityTableId) console.log(`Abraham Recruit ref -> City: ${k} row ${ref.row}`);
  }
}
