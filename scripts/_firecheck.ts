import { loadFranchise, mainTable, val } from '../src/main/parser/franchise.ts';
import { ensureCoachSchema } from '../src/main/parser/coach-schema.ts';
for (const save of process.argv.slice(2)) {
  const fr = await loadFranchise(save);
  const cT = mainTable(fr, 'Coach');
  await ensureCoachSchema(fr, cT);
  await cT.readRecords();
  console.log(`== ${save.split(/[\/]/).pop()} ==`);
  for (let i = 0; i < cT.records.length; i++) {
    const c = cT.records[i];
    if (c.isEmpty) continue;
    const first = String(val(c, 'FirstName') ?? '');
    const last = String(val(c, 'LastName') ?? '');
    if (/deboer|debor/i.test(`${first} ${last}`)) {
      console.log(`  row ${i}: ${first} ${last} | ContractStatus=${val(c, 'ContractStatus')} | SeasonSecurityStatus=${val(c, 'SeasonSecurityStatus')} | pct=${val(c, 'SeasonSecurityPercentage')} | Position=${val(c, 'Position')} | TeamIndex=${val(c, 'TeamIndex')} | yearsLeft=${val(c, 'ContractYearsRemaining') ?? val(c, 'ContractLength')}`);
    }
  }
  // offseason firings: JobOpening rows
  let joT: any = null;
  for (const t of (fr as any).tables) if (t?.name === 'JobOpening') {
    if (!joT || (t.header?.recordCapacity ?? 0) > (joT.header?.recordCapacity ?? 0)) joT = t;
  }
  if (joT) {
    await joT.readRecords();
    let shown = 0, total = 0;
    for (const r of joT.records as any[]) {
      if (r.isEmpty) continue;
      total++;
      if (shown < 5) {
        console.log(`  opening: ${Object.keys(r._fields).slice(0, 8).map((k) => `${k}=${String(r._fields[k].value).slice(0, 16)}`).join(' | ')}`);
        shown++;
      }
    }
    console.log(`  JobOpening rows: ${total}`);
  }
}
