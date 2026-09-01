/**
 * Dynasty-identity probe: prints each save's FranchiseUser.TrophyProfileId —
 * the creation-minted per-dynasty id that keys the media/history/schedule
 * stores (mechanism in docs/RESEARCH.md "Dynasty identity"). Two snapshots of
 * one dynasty must print the same id; unrelated dynasties must differ.
 * Usage: node scripts/dynasty-id-probe.ts <save> [<save> ...]
 */
import { loadFranchise, mainTable, readTable, val } from '../src/main/parser/franchise.ts';

const saves = process.argv.slice(2);
if (!saves.length) {
  console.error('usage: node scripts/dynasty-id-probe.ts <save> [...]');
  process.exit(1);
}

for (const save of saves) {
  try {
    const fr = await loadFranchise(save);
    const fu = await readTable(mainTable(fr, 'FranchiseUser'));
    const users = (fu.records as any[]).filter((r: any) => !r.isEmpty);
    const ids = users.map((r: any) => `${val(r, 'TrophyProfileId')}/${val(r, 'AdminLevel')}`);
    const si = await readTable(mainTable(fr, 'SeasonInfo'));
    const s = (si.records as any[])[0];
    console.log(
      `${save}\n  users=${users.length} [${ids.join(', ')}] season=${val(s, 'CurrentSeasonYear')} wk${val(s, 'CurrentWeek')} stage=${val(s, 'CurrentStage')}`
    );
  } catch (e) {
    console.log(`${save}\n  ERROR ${(e as Error).message}`);
  }
}
