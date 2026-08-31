import { loadFranchise, mainTable, refFromRecord, val } from '../src/main/parser/franchise.ts';
const path = process.argv[2];
const refString = (tableId: number, row: number): string =>
  tableId.toString(2).padStart(15, '0') + row.toString(2).padStart(17, '0');

const fr = await loadFranchise(path);
const rT = mainTable(fr, 'Recruit');
await rT.readRecords();
const raceT = (fr as any).getTableById(5858);
await raceT.readRecords();
const elT = (fr as any).getTableById(5856);
await elT.readRecords();

// spare element rows (expect exactly 10) + a spare array row
const freeEls: number[] = [];
for (let i = 0; i < elT.records.length && freeEls.length < 10; i++) {
  if (elT.records[i].isEmpty) freeEls.push(i);
}
let freeArray = -1;
for (let i = 0; i < raceT.records.length; i++) {
  if (raceT.records[i].isEmpty) { freeArray = i; break; }
}
console.log('free element rows:', freeEls.join(','), '| free array row:', freeArray);
if (freeEls.length < 10 || freeArray < 0) throw new Error('not enough race capacity');

// donor: the last-ranked real recruit's race values (typical bottom-of-class)
let donorRace: { TeamId: number; TeamInfluence: number }[] = [];
for (let i = 0; i < rT.records.length; i++) {
  if (i === 4101 || rT.records[i].isEmpty) continue;
  if (Number(val(rT.records[i], 'NationalRank')) !== 4100) continue;
  const ref = refFromRecord(rT.records[i], 'TopSchoolsList')!;
  const arr = raceT.records[ref.row];
  for (let s = 0; s < 10; s++) {
    const er = refFromRecord(arr, `ProspectTargetSchool${s}`);
    if (!er) continue;
    const el = elT.records[er.row];
    donorRace.push({ TeamId: Number(val(el, 'TeamId')), TeamInfluence: Number(val(el, 'TeamInfluence')) });
  }
  break;
}
console.log('donor race:', JSON.stringify(donorRace));
if (donorRace.length !== 10) throw new Error('donor race incomplete');

// fill the spare elements + build the array row + point Aaron at it
for (let s = 0; s < 10; s++) {
  const el = elT.records[freeEls[s]];
  (el as any).TeamId = donorRace[s].TeamId;
  (el as any).TeamInfluence = donorRace[s].TeamInfluence;
}
const arr = raceT.records[freeArray];
for (let s = 0; s < 10; s++) {
  (arr as any)[`ProspectTargetSchool${s}`] = refString(5856, freeEls[s]);
}
(rT.records[4101] as any).TopSchoolsList = refString(5858, freeArray);

await (fr as any).save(path);
// cold verify
const check = await loadFranchise(path);
const rT2 = mainTable(check, 'Recruit');
await rT2.readRecords();
const raceT2 = (check as any).getTableById(5858);
await raceT2.readRecords();
const elT2 = (check as any).getTableById(5856);
await elT2.readRecords();
const ref = refFromRecord(rT2.records[4101], 'TopSchoolsList');
const arr2 = ref && raceT2.records[ref.row];
const el0 = arr2 && refFromRecord(arr2, 'ProspectTargetSchool0');
console.log('verify: Aaron race ref', JSON.stringify(ref), '| arraySize', (arr2 as any)?.arraySize,
  '| first element', el0 ? `${val(elT2.records[el0.row], 'TeamId')}/${val(elT2.records[el0.row], 'TeamInfluence')}` : 'none');
