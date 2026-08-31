import { loadFranchise, mainTable, refFromRecord, val } from '../src/main/parser/franchise.ts';
import { ensureCoachSchema } from '../src/main/parser/coach-schema.ts';
const COACH_FIELDS = ['FirstName', 'LastName', 'Position', 'TeamIndex', 'ContractStatus',
  'CurrentJobSecurityStatus', 'SeasonSecurityPercentage', 'Age', 'ContractLength', 'ContractYearsRemaining'];

const post = await loadFranchise(process.argv[2]); // offseason autosave
const pre = await loadFranchise(process.argv[3]);  // pre-sim edited file

// job openings with their reason + prev coach
let joT: any = null;
for (const t of (post as any).tables) if (t?.name === 'JobOpening') {
  if (!joT || (t.header?.recordCapacity ?? 0) > (joT.header?.recordCapacity ?? 0)) joT = t;
}
await joT.readRecords();
const j0 = (joT.records as any[]).find((r) => !r.isEmpty);
console.log('JobOpening fields:', Object.keys(j0._fields).join(', '));

const cPost = mainTable(post, 'Coach');
await ensureCoachSchema(post, cPost);
await cPost.readRecords(COACH_FIELDS);
const coachTableId = cPost.header?.tableId;

const cPre = mainTable(pre, 'Coach');
await ensureCoachSchema(pre, cPre);
await cPre.readRecords(COACH_FIELDS);

const reasonKey = Object.keys(j0._fields).find((k) => /reason/i.test(k));
let shown = 0;
const reasons = new Map<string, number>();
for (const r of joT.records as any[]) {
  if (r.isEmpty) continue;
  const reason = reasonKey ? String(val(r, reasonKey)) : '?';
  reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  if (/fired/i.test(reason) && shown < 8) {
    const pcRef = refFromRecord(r, 'PrevCoach');
    if (!pcRef || pcRef.tableId !== coachTableId) continue;
    const preC = cPre.records[pcRef.row];
    if (!preC || preC.isEmpty) continue;
    shown++;
    console.log(`FIRED: ${val(preC, 'FirstName')} ${val(preC, 'LastName')} (${val(r, 'Position')}) — pre-sim: status=${val(preC, 'ContractStatus')} security=${val(preC, 'CurrentJobSecurityStatus')} yearsLeft=${val(preC, 'ContractYearsRemaining')}/${val(preC, 'ContractLength')}`);
  }
}
console.log('opening reasons:', JSON.stringify([...reasons.entries()]));
// DeBoer pre-sim for contrast
for (let i = 0; i < cPre.records.length; i++) {
  const c = cPre.records[i];
  if (!c || c.isEmpty) continue;
  if (/deboer/i.test(String(val(c, 'LastName')))) {
    console.log(`TARGET: ${val(c, 'FirstName')} ${val(c, 'LastName')} — pre-sim: status=${val(c, 'ContractStatus')} security=${val(c, 'CurrentJobSecurityStatus')} yearsLeft=${val(c, 'ContractYearsRemaining')}/${val(c, 'ContractLength')}`);
  }
}
