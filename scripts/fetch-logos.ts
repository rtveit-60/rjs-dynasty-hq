/**
 * Dev tool: regenerates the bundled logo set in resources/logos by matching the
 * schools in a dynasty save against ESPN's public team directory. Run when a
 * game update adds schools or a mark needs refreshing — end users never run this.
 * Usage: node scripts/fetch-logos.ts [path-to-save]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESPN_TEAMS_URL, matchTeams, parseEspnDirectory, slugName } from '../src/main/logos.ts';
import { loadFranchise, mainTable, readTable, val } from '../src/main/parser/franchise.ts';

const savePath = process.argv[2] ?? 'samples/DYNASTY-DUKETOND-AUTOSAVE';
const outDir = join('resources', 'logos');

const franchise = await loadFranchise(savePath);
const teamTable = await readTable(mainTable(franchise, 'Team'), ['LongName', 'NickName']);
const ours = teamTable.records
  .map((rec: any, row: number) => ({
    row,
    longName: String(val(rec, 'LongName') ?? ''),
    nickName: String(val(rec, 'NickName') ?? '')
  }))
  .filter((t: { longName: string }) => t.longName);

const res = await fetch(ESPN_TEAMS_URL);
if (!res.ok) throw new Error(`directory request failed: ${res.status}`);
const espn = parseEspnDirectory(await res.json());
const { matches, misses } = matchTeams(ours, espn);
console.log(`${matches.length} matched, ${misses.length} missed${misses.length ? `: ${misses.join(', ')}` : ''}`);

mkdirSync(outDir, { recursive: true });
let done = 0;
const queue = matches.map((m) => ({ ...m, slug: slugName(m.name) }));
await Promise.all(
  Array.from({ length: 6 }, async () => {
    for (;;) {
      const m = queue.shift();
      if (!m) return;
      try {
        const r = await fetch(m.url);
        if (!r.ok) continue;
        writeFileSync(join(outDir, `${m.slug}.png`), Buffer.from(await r.arrayBuffer()));
        done++;
      } catch {
        console.log('failed:', m.name);
      }
    }
  })
);
console.log(`wrote ${done} logos to ${outDir}`);
