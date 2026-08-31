import { loadFranchise, refFromRecord, val } from '../src/main/parser/franchise.ts';
const fr = await loadFranchise(process.argv[2]);
const pop = (n: number): number => { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; };
// intel distribution across CPU + user targets
const counts = new Map<number, number>();
for (const name of ['RecruitTarget', 'UserRecruitTarget']) {
  let t: any = null;
  for (const x of (fr as any).tables) if (x?.name === name) {
    if (!t || (x.header?.recordCapacity ?? 0) > (t.header?.recordCapacity ?? 0)) t = x;
  }
  await t.readRecords();
  for (const r of t.records as any[]) {
    if (r.isEmpty) continue;
    const v = Number(val(r, 'UnlockedIntelBitfield') ?? 0);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
}
const byPop = new Map<number, number>();
for (const [v, n] of counts) byPop.set(pop(v), (byPop.get(v === v ? pop(v) : 0) ?? 0) + n);
console.log('popcount distribution:', JSON.stringify([...byPop.entries()].sort((a, b) => a[0] - b[0])));
console.log('top distinct values:', [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  .map(([v, n]) => `${v}(${v.toString(2).padStart(14, '0')})x${n}`).join(' '));
// scouting feedback receipts
let fb: any = null;
for (const x of (fr as any).tables) if (x?.name === 'RecruitingActionFeedbackEntry') {
  if (!fb || (x.header?.recordCapacity ?? 0) > (fb.header?.recordCapacity ?? 0)) fb = x;
}
await fb.readRecords();
for (const r of fb.records as any[]) {
  if (r.isEmpty) continue;
  const type = String(val(r, 'RecruitingActionType') ?? '');
  if (!/scout/i.test(type)) continue;
  console.log(`scout receipt: hours=${val(r, 'HoursSpent')} intelUnlocked=${val(r, 'IntelUnlocked')} (${Number(val(r, 'IntelUnlocked')).toString(2).padStart(14, '0')})`);
}
