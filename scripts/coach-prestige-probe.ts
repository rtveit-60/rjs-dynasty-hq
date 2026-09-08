/**
 * Coach prestige probe — what the game does with CoachPrestigeScore.
 *
 * Save side:   node --max-old-space-size=8192 scripts/coach-prestige-probe.ts <save> [<save> ...]
 *   Prints, per save, the head-coach score distribution, the score band under
 *   each CoachPrestige letter and every coach carrying TimesFired > 0. Given
 *   two or more saves of ONE dynasty it also diffs them coach-by-coach: who
 *   went up, who went down, by how much, against their win/loss movement.
 * Tuning side: node --max-old-space-size=8192 scripts/coach-prestige-probe.ts --tuning
 *   Opens the franchise-common tuning store in Win32/globals and prints the
 *   StaffHiringTuning prestige constants with their splines resolved to knot
 *   lists (CoachPrestigeScoreGradeSpline is the score -> letter map), the
 *   MySchoolCoachPrestigeTuning rank ranges/weights and the CoachPrestigeScore
 *   reward column of every goal table.
 *
 * Findings live in docs/RESEARCH.md "Coach prestige — how the game moves it".
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import * as mfModule from 'madden-franchise';
import { loadFranchise, mainTable, readTable, val, refFromRecord, tableById } from '../src/main/parser/franchise.ts';
import { ensureCoachSchema } from '../src/main/parser/coach-schema.ts';

const args = process.argv.slice(2);
process.on('unhandledRejection', () => {});

interface Row {
  row: number;
  name: string;
  pos: string;
  team: string;
  score: number;
  letter: string;
  sec: string;
  pct: number;
  contract: string;
  fired: number;
  bumps: number;
  wins: number;
  losses: number;
  user: boolean;
}

const ROLES = new Set(['HeadCoach', 'OffensiveCoordinator', 'DefensiveCoordinator']);
const dist = (arr: number[]) => {
  const s = [...arr].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return `min ${s[0]} p25 ${q(0.25)} med ${q(0.5)} p75 ${q(0.75)} max ${s[s.length - 1]}`;
};

async function probeSave(save: string): Promise<Row[]> {
  const fr = await loadFranchise(save);
  const recAt = async (ref: { tableId: number; row: number } | null) => {
    if (!ref) return null;
    const t = await tableById(fr, ref.tableId);
    if (!t) return null;
    await readTable(t);
    return t.records[ref.row] ?? null;
  };
  const si = (await readTable(mainTable(fr, 'SeasonInfo'))).records[0];
  console.log(`\n=== ${save}  season=${val(si, 'CurrentSeasonYear')} wk${val(si, 'CurrentWeek')} stage=${val(si, 'CurrentStage')}`);
  const teams = (await readTable(mainTable(fr, 'Team'))).records as any[];
  const coachTable = mainTable(fr, 'Coach');
  if (!(await ensureCoachSchema(fr, coachTable))) throw new Error('Coach schema unreadable');
  const ct = await readTable(coachTable);
  const rows: Row[] = [];
  for (let i = 0; i < ct.records.length; i++) {
    const r = ct.records[i];
    if (r.isEmpty) continue;
    const pos = String(val(r, 'Position'));
    if (!ROLES.has(pos)) continue;
    const ti = Number(val(r, 'TeamIndex'));
    const cs = await recAt(refFromRecord(r, 'CareerStats'));
    rows.push({
      row: i,
      name: `${val(r, 'FirstName')} ${val(r, 'LastName')}`,
      pos,
      team: teams[ti] ? String(val(teams[ti], 'LongName')) : `T${ti}`,
      score: Number(val(r, 'CoachPrestigeScore')),
      letter: String(val(r, 'CoachPrestige')),
      sec: String(val(r, 'CurrentJobSecurityStatus')),
      pct: Number(val(r, 'CurrentJobSecurityPercentage')),
      contract: String(val(r, 'ContractStatus')),
      fired: cs ? Number(val(cs, 'TimesFired')) : -1,
      bumps: cs ? Number(val(cs, 'NumPrestigeIncreases')) : -1,
      wins: cs ? Number(val(cs, 'Wins')) : -1,
      losses: cs ? Number(val(cs, 'Losses')) : -1,
      user: val(r, 'IsUserControlled') === true
    });
  }
  const hc = rows.filter((r) => r.pos === 'HeadCoach');
  console.log(`coaches=${rows.length} HC=${hc.length}   HC score: ${dist(hc.map((r) => r.score))}`);
  console.log(
    `HC with TimesFired>0: ${hc.filter((r) => r.fired > 0).length}   HC with NumPrestigeIncreases>0: ${hc.filter((r) => r.bumps > 0).length}`
  );
  const byLetter: Record<string, number[]> = {};
  for (const r of hc) (byLetter[r.letter] ??= []).push(r.score);
  for (const [l, a] of Object.entries(byLetter).sort()) console.log(`  ${l.padEnd(7)} n=${String(a.length).padStart(3)}  ${dist(a)}`);
  const fired = rows.filter((r) => r.fired > 0);
  console.log(`TimesFired>0 (${fired.length}):`);
  for (const r of fired.slice(0, 15)) {
    console.log(
      `  ${r.pos.padEnd(20)} ${r.name.padEnd(22)} ${r.team.padEnd(22)} score ${String(r.score).padStart(5)} ${r.letter.padEnd(7)} ${r.wins}-${r.losses} ${r.sec} ${r.pct}% fired x${r.fired}`
    );
  }
  return rows;
}

function diffSaves(aName: string, A: Row[], bName: string, B: Row[]): void {
  console.log(`\n### ${path.basename(aName)} -> ${path.basename(bName)}`);
  const byKey = new Map(B.map((r) => [`${r.name}|${r.row}`, r]));
  const byName = new Map(B.map((r) => [r.name, r]));
  let up = 0;
  let down = 0;
  let same = 0;
  const downs: string[] = [];
  const groups: Record<string, number[]> = {};
  for (const r of A) {
    const s = byKey.get(`${r.name}|${r.row}`) ?? byName.get(r.name);
    if (!s) continue;
    const d = s.score - r.score;
    if (d > 0) up++;
    else if (d < 0) down++;
    else same++;
    if (d < 0) {
      downs.push(
        `  ${r.pos[0]} ${r.name.padEnd(22)} ${r.team.padEnd(18)} ${r.score}->${s.score} (${d})  ${r.wins}-${r.losses}->${s.wins}-${s.losses}  ${r.sec}->${s.sec}`
      );
    }
    if (r.wins >= 0 && s.wins >= 0) (groups[`${s.wins - r.wins}-${s.losses - r.losses}`] ??= []).push(d);
  }
  console.log(`matched: up ${up}  down ${down}  unchanged ${same}`);
  console.log('score delta by (wins added)-(losses added):');
  for (const [k, a] of Object.entries(groups)
    .sort((p, q) => q[1].length - p[1].length)
    .slice(0, 14)) {
    console.log(`  ${k.padEnd(6)} n=${String(a.length).padStart(3)}  ${dist(a)}`);
  }
  console.log(`down list (${downs.length}):`);
  for (const l of downs.slice(0, 30)) console.log(l);
}

// ---- tuning side --------------------------------------------------------------

const SH_FIELDS: Record<number, string> = {
  4: 'CoachFiringStatusLevel',
  9: 'CoachPrestigePointsSpline',
  10: 'CoachPrestigeScoreGradeSpline',
  11: 'CoachPrestigeStaticWeeks',
  12: 'CoachPrestigeToContractProgramPointsSpline',
  16: 'ContractPoints_ConfChamp',
  17: 'ContractPoints_NatChamp',
  20: 'ContractPoints_WinGame',
  21: 'ContractPoints_WinRankedGame',
  29: 'CoordPrestigePenalty',
  44: 'HC_FiredRangeMax',
  45: 'HC_FiredRangeMin',
  46: 'HC_HotseatThreshold',
  47: 'HC_LowThreshold',
  48: 'HC_SafeThreshold',
  57: 'JobSecurityCoachPrestigeSpline',
  61: 'LeaveForNFLPrestigeOddsThreshold',
  93: 'PrestigeCompareScoreSpline',
  94: 'PrestigeCompareScoreSplineBuffer',
  95: 'PrestigeInterestPointsSpline',
  101: 'RolePrestigeDiffToProgramPointsPctSpline',
  111: 'TeamPrestigeCoachPrestigeSpline',
  116: 'UserPrestigeBonus'
};
/** Goal tables -> schema idx of their CoachPrestigeScore reward (stored as value + 1000; schema range -1000..1000). */
const GOAL_IDX: Record<string, number> = {
  CoachContractExpressionGoal: 6,
  CoachContractStatGoal: 6,
  CoachContractRecruitGoal: 6,
  CoachContractGradeGoal: 6,
  CoachContractAwardGoal: 8,
  CoachAwardMilestoneGoal: 3,
  CoachBowlBidMilestoneGoal: 3,
  CoachFootballRecordMilestoneGoal: 2,
  CoachSeasonalGoal: 2,
  CoachWeeklyGoal: 9,
  CoachDraftPickGoal: 2,
  CoachRecruitingGoal: 2
};
/** MySchoolRankingRangesTable member order (schema idx 0..13). */
const RANGE_NAMES = ['A', 'A-', 'A+', 'B', 'B-', 'B+', 'C', 'C-', 'C+', 'D', 'D-', 'D+', 'F', '(pad)'];

/** Generic-schema refs surface either as a 32-char bit string or as the same bits in decimal. */
function refOf(v: unknown): { tid: number; row: number } | null {
  const s = String(v);
  let n: number;
  if (/^[01]{32}$/.test(s)) n = parseInt(s, 2);
  else if (/^\d+$/.test(s) && Number(s) > 0x1ffff) n = Number(s);
  else return null;
  return { tid: n >>> 17, row: n & 0x1ffff };
}

async function tuning(): Promise<void> {
  const fb = await import('./fb/frostbite.ts');
  const mf: any = (mfModule as any).default ?? mfModule;
  const layout = fb.loadLayout(fb.GAME_ROOT_DEFAULT);
  const toc = fb.parseSuperbundleToc(fb.readTocPayload(path.join(layout.gameRoot, 'Data', 'Win32', 'globals.toc')));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpp-'));
  for (const chunk of toc.chunks) {
    let payload: Buffer;
    try {
      payload = await fb.decompressCasBlocksUnknownSize(layout, fb.readRawCasBytes(layout, chunk.location));
    } catch {
      continue;
    }
    if (payload.length < 4 || payload[0] !== 0x78) continue;
    let image: Buffer;
    try {
      image = zlib.inflateSync(payload);
    } catch {
      continue;
    }
    if (image.subarray(0, 4).toString('latin1') !== 'FrTk' || !image.includes(Buffer.from('StaffHiringTuning'))) continue;
    const tmp = path.join(tmpDir, 's.ftc');
    fs.writeFileSync(tmp, payload);
    let store: any;
    try {
      store = await (mf.create ?? mf.FranchiseFile?.create)(tmp);
    } catch {
      continue;
    }
    const byId = new Map<number, any>();
    for (const x of store.tables as any[]) if (x?.header?.tableId !== undefined) byId.set(x.header.tableId, x);
    const table = (name: string) => (store.tables as any[]).find((x: any) => x.name === name);
    const readRef = async (v: unknown): Promise<any | null> => {
      const r = refOf(v);
      if (!r) return null;
      const t = byId.get(r.tid);
      if (!t) return null;
      try {
        if (!t.recordsRead) await t.readRecords();
      } catch {
        return null;
      }
      return t.records?.[r.row] ?? null;
    };
    const knots = async (v: unknown): Promise<string> => {
      const rec = await readRef(v);
      if (!rec) return String(v);
      return Object.values(rec._fields)
        .map((f: any) => String(f.value))
        .filter((s) => s !== '')
        .join(',');
    };
    console.log(`tuning store chunk ${chunk.guid}`);
    const sh = table('StaffHiringTuning');
    await sh.readRecords();
    const r0 = (sh.records as any[]).find((r: any) => !r.isEmpty);
    console.log('--- StaffHiringTuning');
    for (const [i, name] of Object.entries(SH_FIELDS)) {
      const v = r0._fields[`Field_${i}`]?.value;
      const sp = await readRef(v);
      if (sp && 'X' in sp._fields) console.log(`  ${name}: X=[${await knots(sp._fields.X.value)}] Y=[${await knots(sp._fields.Y.value)}]`);
      else console.log(`  ${name} = ${v}`);
    }
    const ms = table('MySchoolCoachPrestigeTuning');
    if (ms) {
      await ms.readRecords();
      const m0 = (ms.records as any[]).find((r: any) => !r.isEmpty);
      const ranges = await readRef(m0._fields.Field_0.value);
      console.log('--- MySchoolCoachPrestigeTuning (school CoachPrestigeGrade from the staff prestige rank)');
      if (ranges) {
        console.log(
          '  rank ceilings: ' +
            Object.keys(ranges._fields)
              .map((k) => `${RANGE_NAMES[Number(k.slice(6))] ?? k}<=${ranges._fields[k].value}`)
              .join(' ')
        );
      }
      console.log(`  weights DC ${m0._fields.Field_1.value} / HC ${m0._fields.Field_2.value} / OC ${m0._fields.Field_3.value}`);
    }
    console.log('--- goal tables: CoachPrestigeScore reward histogram (raw - 1000 = signed value)');
    for (const [tn, gi] of Object.entries(GOAL_IDX)) {
      const gt = table(tn);
      if (!gt) continue;
      try {
        await gt.readRecords();
      } catch {
        continue;
      }
      const hist: Record<string, number> = {};
      for (const r of gt.records as any[]) {
        if (r.isEmpty) continue;
        const v = Number(r._fields[`Field_${gi}`]?.value);
        hist[v] = (hist[v] ?? 0) + 1;
      }
      console.log(`  ${tn.padEnd(34)} ${JSON.stringify(hist)}`);
    }
    return;
  }
  console.log('no tuning store with StaffHiringTuning found');
}

if (args.includes('--tuning')) {
  await tuning();
} else if (!args.length) {
  console.error('usage: node scripts/coach-prestige-probe.ts <save> [<save> ...] | --tuning');
  process.exit(1);
} else {
  const probed: [string, Row[]][] = [];
  for (const s of args) probed.push([s, await probeSave(s)]);
  for (let i = 1; i < probed.length; i++) diffSaves(probed[i - 1][0], probed[i - 1][1], probed[i][0], probed[i][1]);
}
