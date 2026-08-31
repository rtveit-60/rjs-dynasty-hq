import { loadFranchise, mainTable, val } from '../src/main/parser/franchise.ts';
import { ensureCoachSchema } from '../src/main/parser/coach-schema.ts';
const COACH_FIELDS = ['FirstName', 'LastName', 'Position', 'TeamIndex', 'ContractStatus',
  'CurrentJobSecurityStatus', 'SeasonSecurityPercentage', 'Age', 'ContractLength', 'ContractYearsRemaining'];
for (const save of process.argv.slice(2)) {
  const fr = await loadFranchise(save);
  const cT = mainTable(fr, 'Coach');
  const ok = await ensureCoachSchema(fr, cT);
  await cT.readRecords(COACH_FIELDS);
  console.log(`== ${save.split(/[\/]/).pop()} == schema ok: ${ok}`);
  // drift-safe: only the first ~126 field indices decode; use val() reads
  let found = 0;
  for (let i = 0; i < cT.records.length; i++) {
    let c: any;
    try { c = cT.records[i]; } catch { continue; }
    if (!c || c.isEmpty) continue;
    const name = `${val(c, 'FirstName') ?? ''} ${val(c, 'LastName') ?? ''}`;
    if (/boer|caleb|kalen/i.test(name)) {
      found++;
      console.log(`  row ${i}: ${name} | ContractStatus=${val(c, 'ContractStatus')} | security=${val(c, 'CurrentJobSecurityStatus')} ${val(c, 'SeasonSecurityPercentage')}% | Position=${val(c, 'Position')} | TeamIndex=${val(c, 'TeamIndex')}`);
    }
  }
  if (!found) console.log('  (no match)');
  const sample: string[] = [];
  for (let i = 0; i < cT.records.length && sample.length < 5; i++) {
    const c = cT.records[i];
    if (!c || c.isEmpty) continue;
    sample.push(`${val(c, 'FirstName')} ${val(c, 'LastName')}`);
  }
  console.log('  sample coaches:', sample.join(' | '));
}
