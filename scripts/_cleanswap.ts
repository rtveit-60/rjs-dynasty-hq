import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadFranchise, mainTable, refFromRecord, val } from '../src/main/parser/franchise.ts';
import { applyCreateRecruit, buildCreateForm } from '../src/main/editor.ts';

const SAVES = 'C:/Users/Owner/OneDrive/Documents/EA SPORTS College Football 27/saves';
const ORIG = path.join(SAVES, 'DYNASTY-AUG29-07h16m53-AUTOSAVE');
const OUT = path.join(SAVES, 'DYNASTY-AUG29-EDITED');
const refString = (tableId: number, row: number): string =>
  tableId.toString(2).padStart(15, '0') + row.toString(2).padStart(17, '0');

// 1. fresh copy of the untouched original
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanswap-'));
const work = path.join(tmp, 'DYNASTY-WORK');
fs.copyFileSync(ORIG, work);

// 2. create Aaron through the sanctioned path (face-only era), chosen face
//    normalized to the recruit convention
const fr1 = await loadFranchise(work);
const form = await buildCreateForm(fr1, work);
const face = form.faces.find((f) => f.portraitId === 2) ?? form.faces[0];
const res = await applyCreateRecruit(fr1, work, {
  firstName: 'Aaron',
  lastName: 'Abraham',
  position: 'QB',
  archetype: form.archetypesByPosition['QB'][0],
  stars: 5,
  devTrait: form.devTraits[form.devTraits.length - 1],
  heightIn: 76,
  weightLb: 215,
  homeState: 'Kansas',
  homeTown: form.cities['Kansas'][0].town,
  face
}, tmp);
console.log(`created Aaron at player ${res.playerRow} / recruit ${res.recruitRow}`);

// 3. swap into the indexed #4100 slot on the written file
const fr2 = await loadFranchise(res.editedPath);
const rT = mainTable(fr2, 'Recruit');
await rT.readRecords();
const pT = mainTable(fr2, 'Player');
await pT.readRecords();
const playerTableId = pT.header?.tableId;
let hostRow = -1;
for (let i = 0; i < rT.records.length; i++) {
  if (i === res.recruitRow || rT.records[i].isEmpty) continue;
  if (Number(val(rT.records[i], 'NationalRank')) === 4100) { hostRow = i; break; }
}
const host = rT.records[hostRow];
const oldRef = refFromRecord(host, 'Player')!;
const oldP = pT.records[oldRef.row];
console.log(`host recruit row ${hostRow} (#4100): was ${val(oldP, 'FirstName')} ${val(oldP, 'LastName')} (${val(oldP, 'Position')})`);
(host as any).Player = refString(playerTableId, res.playerRow);
// recruit convention: the head enum stays NoHead; asset + portrait carry the face
(pT.records[res.playerRow] as any).PLYR_GENERICHEAD = 'NoHead';
oldP.empty();
rT.records[res.recruitRow].empty();
rT.recalculateEmptyRecordReferences?.();
pT.recalculateEmptyRecordReferences?.();
await (fr2 as any).save(OUT);

// 4. cold verify
const check = await loadFranchise(OUT);
const rT2 = mainTable(check, 'Recruit');
await rT2.readRecords();
const pT2 = mainTable(check, 'Player');
await pT2.readRecords();
const h2 = rT2.records[hostRow];
const ref2 = refFromRecord(h2, 'Player')!;
const p2 = pT2.records[ref2.row];
const race2 = refFromRecord(h2, 'TopSchoolsList');
console.log(`verify: #${val(h2, 'NationalRank')} fronts ${val(p2, 'FirstName')} ${val(p2, 'LastName')} (${val(p2, 'Position')}, ${val(p2, 'PLYR_HOME_STATE')}, ${val(p2, 'PLYR_HOME_TOWN')})`);
console.log(`verify: head ${val(p2, 'PLYR_GENERICHEAD')} / ${val(p2, 'GenericHeadAssetName')} / portrait ${val(p2, 'PLYR_PORTRAIT')}`);
console.log(`verify: race ref intact ${JSON.stringify(race2)}, appended recruit row empty=${rT2.records[res.recruitRow].isEmpty}, filler retired=${pT2.records[oldRef.row].isEmpty}`);
