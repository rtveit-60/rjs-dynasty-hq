import { loadFranchise, mainTable, refFromRecord, val } from '../src/main/parser/franchise.ts';
const fr = await loadFranchise(process.argv[2]);
// full UserRecruitTarget field list
let ut: any = null;
for (const t of (fr as any).tables) if (t?.name === 'UserRecruitTarget') {
  if (!ut || (t.header?.recordCapacity ?? 0) > (ut.header?.recordCapacity ?? 0)) ut = t;
}
await ut.readRecords();
const u0 = (ut.records as any[]).find((r) => !r.isEmpty);
console.log('UserRecruitTarget fields:', u0 ? Object.keys(u0._fields).join(', ') : '(none)');
// per-action tables
for (const name of ['RecruitingActionBonus', 'RecruitingActionFeedbackEntry', 'ActiveRecruitingPitch']) {
  let t2: any = null;
  for (const t of (fr as any).tables) if (t?.name === name) {
    if (!t2 || (t.header?.recordCapacity ?? 0) > (t2.header?.recordCapacity ?? 0)) t2 = t;
  }
  if (!t2) continue;
  await t2.readRecords();
  let used = 0;
  let s0: any = null;
  for (const r of t2.records as any[]) { if (!r.isEmpty) { used++; if (!s0) s0 = r; } }
  console.log(`${name}: capacity=${t2.header?.recordCapacity} used=${used}`);
  if (s0) {
    console.log('  fields: ' + Object.keys(s0._fields).map((k) => `${k}=${String(s0._fields[k].value).slice(0, 18)}`).join(' | '));
  }
}
