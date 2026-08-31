import { loadFranchise, mainTable, refFromRecord, val } from '../src/main/parser/franchise.ts';
const fr = await loadFranchise(process.argv[2]);
const rT = mainTable(fr, 'Recruit');
await rT.readRecords();
const pT = mainTable(fr, 'Player');
await pT.readRecords();
const norm = (rec: any, k: string): string => {
  const v = String(rec._fields[k]?.value ?? '');
  if (/^[01]{32}$/.test(v)) {
    const ref = refFromRecord(rec, k);
    return ref && ref.tableId !== 0 ? `ref:table${ref.tableId}` : 'ref:zero';
  }
  return v;
};
// gather zero-offer QB recruits (excluding Aaron)
const cohortR: any[] = [], cohortP: any[] = [];
for (let i = 0; i < rT.records.length; i++) {
  if (i === 4101 || rT.records[i].isEmpty) continue;
  const r = rT.records[i];
  if (Number(val(r, 'TotalScholarshipOffers')) !== 0) continue;
  const ref = refFromRecord(r, 'Player');
  const p = ref && pT.records[ref.row];
  if (!p || String(val(p, 'Position')) !== 'QB') continue;
  cohortR.push(r); cohortP.push(p);
}
console.log(`cohort: ${cohortR.length} zero-offer QB recruits`);
const aaronR = rT.records[4101];
const aaronP = pT.records[refFromRecord(aaronR, 'Player')!.row];
console.log('== Recruit fields where Aaron is outside the cohort ==');
for (const k of Object.keys(aaronR._fields)) {
  const seen = new Set(cohortR.map((r) => norm(r, k)));
  const a = norm(aaronR, k);
  if (!seen.has(a)) console.log(`  ${k}: aaron=${a} | cohort={${[...seen].slice(0, 5).join(', ')}}`);
}
console.log('== Player fields where Aaron is outside the cohort ==');
for (const k of Object.keys(aaronP._fields)) {
  const seen = new Set(cohortP.map((p) => norm(p, k)));
  const a = norm(aaronP, k);
  if (!seen.has(a)) console.log(`  ${k}: aaron=${String(a).slice(0, 36)} | cohort sample={${[...seen].slice(0, 4).map((x) => String(x).slice(0, 24)).join(', ')}}`);
}
