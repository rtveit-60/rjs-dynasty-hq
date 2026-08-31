import { loadFranchise, mainTable, val } from '../src/main/parser/franchise.ts';
const fr = await loadFranchise(process.argv[2]);
const pT = mainTable(fr, 'Player');
await pT.readRecords();
const byState = new Map<string, Map<string, Map<string, number>>>();
for (const p of pT.records as any[]) {
  if (p.isEmpty) continue;
  const town = String(val(p, 'PLYR_HOME_TOWN') ?? '').trim();
  const state = String(val(p, 'PLYR_HOME_STATE') ?? '');
  const pipe = String(val(p, 'HomePipeline') ?? '');
  if (!town || !state || !pipe || pipe === 'Invalid_') continue;
  if (!byState.has(state)) byState.set(state, new Map());
  const towns = byState.get(state)!;
  if (!towns.has(town)) towns.set(town, new Map());
  towns.get(town)!.set(pipe, (towns.get(town)!.get(pipe) ?? 0) + 1);
}
let total = 0, conflicted = 0;
for (const [, towns] of byState) for (const [, pipes] of towns) { total++; if (pipes.size > 1) conflicted++; }
console.log(`states: ${byState.size}, distinct (state,town): ${total}, town w/ >1 pipeline: ${conflicted}`);
const ca = byState.get('California');
console.log(`California towns: ${ca?.size}`, 'Dana Point:', JSON.stringify([...(ca?.get('Dana Point') ?? new Map())]));
const al = byState.get('Alabama');
console.log(`Alabama towns: ${al?.size}, sample:`, [...(al?.keys() ?? [])].slice(0, 5).join(', '));
// enum members vs covered states
const anyP = pT.records.find((r: any) => !r.isEmpty);
const enumStates = (anyP._fields.PLYR_HOME_STATE.offset?.enum?.members ?? []).map((m: any) => m.name);
const missing = enumStates.filter((s: string) => !byState.has(s));
console.log('enum states with NO harvested towns:', missing.join(', ') || '(none)');
const pipes = new Set<string>();
for (const [, towns] of byState) for (const [, pp] of towns) for (const k of pp.keys()) pipes.add(k);
console.log('distinct pipelines seen:', pipes.size);
