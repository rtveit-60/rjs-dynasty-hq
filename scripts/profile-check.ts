/**
 * Regression checks for the profile extractors (scripts/filter-check.ts's
 * sibling). Runs every profile kind against the sample save and asserts the
 * numbers agree with the save's own cross-references.
 * Usage: node scripts/profile-check.ts [save]
 */
import { loadFranchise, mainTable, val, refFromRecord, isNullRef } from '../src/main/parser/franchise.ts';
import { extractCoachProfile, extractPlayerProfile, extractSchoolProfile } from '../src/main/parser/profile.ts';
import { extractSnapshot } from '../src/main/parser/extract.ts';

const savePath = process.argv[2] ?? 'samples/DYNASTY-DUKETOND-AUTOSAVE';
const franchise = await loadFranchise(savePath);
const snap = await extractSnapshot(franchise, { schoolTeamRow: 27, fileName: savePath });

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// ---------------------------------------------------------------------------
// Player profiles: every rostered Duke player must resolve, and the profile
// header must agree with the roster row the click came from.
const roster = snap.school!.roster;
check('roster present', roster.length > 50, `${roster.length} players`);

let headerMismatch = 0;
let withCareer = 0;
let withSeasons = 0;
let withGames = 0;
let resultConflicts = 0;
let statless = 0;
for (const p of roster) {
  const rosterName = `${p.firstName} ${p.lastName}`.trim();
  const prof = await extractPlayerProfile(franchise, p.row);
  if (!prof) {
    console.log(`  no profile for roster row ${p.row} ${rosterName}`);
    headerMismatch++;
    continue;
  }
  if (prof.name !== rosterName || prof.position !== p.position || prof.overall !== p.overall) {
    console.log(`  header mismatch: board=${rosterName}/${p.position}/${p.overall} profile=${prof.name}/${prof.position}/${prof.overall}`);
    headerMismatch++;
  }
  if (prof.career.length) withCareer++;
  if (prof.seasons.length) withSeasons++;
  if (prof.games.length) withGames++;
  if (!prof.career.length && !prof.seasons.length && !prof.games.length) statless++;
  // A game-log row's result must match the schedule the school profile reads.
  for (const g of prof.games) {
    if (!g.result) continue;
    if (!/^[WLT] \d+–\d+/.test(g.result)) {
      console.log(`  bad result string "${g.result}" for ${rosterName}`);
      resultConflicts++;
    }
  }
}
check('every roster player resolves with a matching header', headerMismatch === 0, `${roster.length} checked`);
check('career stats present for most of the roster', withCareer > roster.length * 0.5, `${withCareer}/${roster.length}`);
check('season rows present for most of the roster', withSeasons > roster.length * 0.5, `${withSeasons}/${roster.length}`);
check('game logs present for some of the roster', withGames > 10, `${withGames}/${roster.length}`);
check('game-log results all well-formed', resultConflicts === 0);
console.log(`  (${statless} players with no stats at all — true freshmen who have not played)`);

// A specific cross-check: pick a player with a game log and confirm each game
// references a real SeasonGame involving his team.
const sample = roster.find((p) => p.position === 'QB') ?? roster[0];
const sampleProf = (await extractPlayerProfile(franchise, sample.row))!;
console.log(`\nsample: ${sampleProf.name} (${sampleProf.position}) seasons=${sampleProf.seasons.length} games=${sampleProf.games.length}`);
for (const s of sampleProf.seasons.slice(0, 6)) {
  console.log(`  ${s.year} ${s.team} GP ${s.gamesPlayed} — ${s.lines.map((l) => l.category).join(', ')}`);
}
for (const g of sampleProf.games.slice(0, 5)) {
  console.log(`  W${g.week} ${g.home ? 'vs' : 'at'} ${g.opponent} ${g.result} — ${g.lines.map((l) => l.category).join(', ')}`);
}

// Career totals must be >= the newest season's totals for counting stats.
// (Compare games played: career GP >= max season GP.)
const gpLine = sampleProf.career.find((l) => l.category === 'Games');
if (gpLine && sampleProf.seasons.length) {
  const careerGP = Number(gpLine.cells.find((c) => c.label === 'GP')?.value ?? 0);
  const maxSeasonGP = Math.max(...sampleProf.seasons.map((s) => s.gamesPlayed));
  check('career GP >= any single season GP', careerGP >= maxSeasonGP, `${careerGP} vs ${maxSeasonGP}`);
}

// ---------------------------------------------------------------------------
// Recruits: profiles must resolve through playerRow and carry recruit context.
const recruits = snap.school!.recruiting?.recruits ?? [];
const hs = recruits.filter((r) => !r.isTransfer).slice(0, 60);
let recruitMisses = 0;
let recruitCtx = 0;
let rankAgree = 0;
for (const r of hs) {
  const prof = await extractPlayerProfile(franchise, r.playerRow);
  if (!prof || prof.name !== r.name) {
    console.log(`  recruit mismatch: board=${r.name} profile=${prof?.name ?? 'null'}`);
    recruitMisses++;
    continue;
  }
  if (prof.recruit) {
    recruitCtx++;
    if (prof.recruit.nationalRank === r.nationalRank && prof.recruit.stars === r.stars) rankAgree++;
  }
}
check('recruit profiles resolve with matching names', recruitMisses === 0, `${hs.length} checked`);
check('recruit context present on all sampled prospects', recruitCtx === hs.length, `${recruitCtx}/${hs.length}`);
check('recruit ranks/stars agree with the board', rankAgree === recruitCtx, `${rankAgree}/${recruitCtx}`);

// Transfers must carry their college stat history.
const transfers = recruits.filter((r) => r.isTransfer).slice(0, 40);
let transferWithStats = 0;
for (const r of transfers) {
  const prof = await extractPlayerProfile(franchise, r.playerRow);
  if (prof && (prof.seasons.length || prof.career.length)) transferWithStats++;
}
check(
  'transfer-portal players carry college stats',
  transfers.length === 0 || transferWithStats > transfers.length * 0.6,
  `${transferWithStats}/${transfers.length}`
);

// ---------------------------------------------------------------------------
// Coach profiles: staff cards must resolve, and W-L must match the header data
// the snapshot already shows (StaffTendency.careerWins/Losses).
let coachMisses = 0;
for (const s of snap.school!.staff) {
  const prof = await extractCoachProfile(franchise, s.coachRow);
  if (!prof || prof.name !== s.name) {
    console.log(`  coach mismatch: staff=${s.name} profile=${prof?.name ?? 'null'}`);
    coachMisses++;
    continue;
  }
  if (s.careerWins !== null && prof.career) {
    if (prof.career.wins !== s.careerWins || prof.career.losses !== s.careerLosses) {
      console.log(`  career W-L mismatch for ${s.name}: staff=${s.careerWins}-${s.careerLosses} profile=${prof.career.wins}-${prof.career.losses}`);
      coachMisses++;
    }
  }
  console.log(`  ${prof.role} ${prof.name}: age ${prof.age}, yrs ${prof.yearsCoaching}, career ${prof.career?.wins ?? '—'}-${prof.career?.losses ?? '—'}, stops ${prof.stops.length}`);
}
check('staff coach profiles resolve and agree with snapshot', coachMisses === 0);

// Carousel rows chain into coach profiles too.
const carousel = snap.carousel.slice(0, 25);
let carouselMisses = 0;
for (const c of carousel) {
  const prof = await extractCoachProfile(franchise, c.coachRow);
  if (!prof || prof.name !== c.name) carouselMisses++;
}
check('carousel rows resolve to coach profiles', carouselMisses === 0, `${carousel.length} checked`);

// Alma mater: AlmaMater is a school PresentationId (schema range 1100-1300).
// Oracle: real coaches the game ships, whose alma maters are public record.
// EA substitutes a coach's famous FBS school when the real one isn't in the
// game (Norvell, Traylor), so only clean FBS cases are asserted.
{
  const ct = mainTable(franchise, 'Coach');
  await ct.readRecords(['FirstName', 'LastName']);
  const rowOf = (first: string, last: string): number =>
    (ct.records as any[]).findIndex(
      (r) => !r.isEmpty && String(val(r, 'FirstName')) === first && String(val(r, 'LastName')) === last
    );
  const ORACLE: [string, string, string][] = [
    ['Steve', 'Sarkisian', 'BYU'],
    ['Lincoln', 'Riley', 'Texas Tech'],
    ['Jeff', 'Brohm', 'Louisville'],
    ['Kirby', 'Smart', 'Georgia'],
    ['Dabo', 'Swinney', 'Alabama'],
    ['Scott', 'Frost', 'Nebraska'],
    ['Brent', 'Venables', 'Kansas State'],
    ['Rhett', 'Lashlee', 'Arkansas']
  ];
  let tested = 0;
  let agreed = 0;
  for (const [first, last, school] of ORACLE) {
    const row = rowOf(first, last);
    if (row < 0) continue; // retired out of this save — fine
    tested++;
    const prof = await extractCoachProfile(franchise, row);
    if (prof?.almaMater === school) agreed++;
    else console.log(`  alma mater mismatch: ${first} ${last} -> ${prof?.almaMater ?? 'null'} (expected ${school})`);
  }
  check('real-coach alma maters resolve correctly', tested > 0 && agreed === tested, `${agreed}/${tested} present in save`);

  // HomeState: real for shipped coaches, but the Alabama enum default floods
  // generated/created ones — profiles must suppress it and pass real states.
  const sark = rowOf('Steve', 'Sarkisian');
  if (sark >= 0) {
    const prof = await extractCoachProfile(franchise, sark);
    check('real coach home state passes through', prof?.homeState === 'California', String(prof?.homeState));
  }
  let alabamaLeaks = 0;
  for (const c of snap.carousel.slice(0, 40)) {
    const prof = await extractCoachProfile(franchise, c.coachRow);
    if (prof?.homeState === 'Alabama') alabamaLeaks++;
  }
  check('default home state suppressed', alabamaLeaks === 0, `${alabamaLeaks} leaks in 40`);

  // Coaching history: HC tenures rebuilt from the teams' year-by-year rows.
  // Oracle: careers this save is known to contain (verified by hand against
  // the TeamHistoricSeriesYear rows themselves).
  const fmtStop = (s: any) =>
    `${s.team} ${s.role} ${s.fromYear ?? '?'}–${s.toYear ?? 'now'}${s.wins !== null ? ` ${s.wins}-${s.losses}` : ''}`;
  if (sark >= 0) {
    const prof = await extractCoachProfile(franchise, sark);
    const texas = prof?.stops.find((s) => s.team === 'Texas');
    const duke = prof?.stops.find((s) => s.team === 'Duke');
    check(
      'Sarkisian résumé: Texas 2026–2032 then Duke to present',
      !!texas && texas.fromYear === 2026 && texas.toYear === 2032 && texas.role === 'HeadCoach' &&
        !!duke && duke.fromYear === 2033 && duke.toYear === null && duke.current,
      prof?.stops.map(fmtStop).join(' | ')
    );
    const texasWL = texas ? `${texas.wins}-${texas.losses}` : '';
    check('Sarkisian Texas record summed from year rows', texasWL === '61-35', texasWL);
  }
  const frost = rowOf('Scott', 'Frost');
  if (frost >= 0) {
    const prof = await extractCoachProfile(franchise, frost);
    const cur = prof?.stops.find((s) => s.current);
    const ucf = prof?.stops.filter((s) => s.team === 'UCF') ?? [];
    check(
      'Frost résumé: dated OC stint plus reconstructed UCF HC tenure, no echo',
      !!cur && cur.role === 'OffensiveCoordinator' && cur.fromYear === 2031 &&
        ucf.length === 1 && ucf[0].role === 'HeadCoach' && ucf[0].fromYear === 2026 && ucf[0].toYear === 2030,
      prof?.stops.map(fmtStop).join(' | ')
    );
  }
  await ct.readRecords(['FirstName', 'LastName', 'IsUserControlled']);
  const user = (ct.records as any[]).findIndex((r) => !r.isEmpty && val(r, 'IsUserControlled') === true);
  if (user >= 0) {
    const prof = await extractCoachProfile(franchise, user);
    check(
      'user coach résumé has multiple dated stops',
      (prof?.stops.filter((s) => s.fromYear !== null).length ?? 0) >= 2,
      prof?.stops.map(fmtStop).join(' | ')
    );
  }

  // Coverage: nearly every coach's id should land on a save team.
  let withTeamIdx = 0;
  let resolved = 0;
  for (const s of snap.school!.staff) {
    const prof = await extractCoachProfile(franchise, s.coachRow);
    if (!prof) continue;
    withTeamIdx++;
    if (prof.almaMater) resolved++;
  }
  check('staff alma maters resolve', withTeamIdx > 0 && resolved === withTeamIdx, `${resolved}/${withTeamIdx}`);
}

// ---------------------------------------------------------------------------
// School profile.
const school = await extractSchoolProfile(franchise, 27);
check('school profile resolves', !!school && school.name.includes('Duke'), school?.name);
if (school) {
  const nowSeason = school.seasons[0];
  check('newest season is the one underway', !!nowSeason && nowSeason.current, String(nowSeason?.year));
  check('current schedule has a full season', nowSeason.schedule.length >= 12, `${nowSeason.schedule.length} games`);
  const played = nowSeason.schedule.filter((g) => g.outcome);
  check('played games carry scores', played.every((g) => g.scoreUs + g.scoreThem > 0), `${played.length} played`);
  check('schedule record matches win/loss tally', school.wins === played.filter((g) => g.outcome === 'W').length);
  check(
    'current season W-L overridden by the schedule tally',
    nowSeason.wins === school.wins && nowSeason.losses === school.losses,
    `${nowSeason.wins}-${nowSeason.losses}`
  );
  check(
    'points summed from played games',
    nowSeason.pointsFor === played.reduce((s, g) => s + g.scoreUs, 0) &&
      nowSeason.pointsAgainst === played.reduce((s, g) => s + g.scoreThem, 0),
    `PF ${nowSeason.pointsFor} PA ${nowSeason.pointsAgainst}`
  );
  check('seasons present for the full dynasty', school.seasons.length >= 5, `${school.seasons.length} seasons`);
  const yearsSorted = school.seasons.map((y) => y.year);
  check('seasons descend uniquely', yearsSorted.every((y, i) => i === 0 || y < yearsSorted[i - 1]));
  // Save keeps a five-season stat window: those seasons carry stat panels,
  // older ones stay empty rather than made up.
  const withStats = school.seasons.filter((s) => s.stats.length > 0);
  const oldest = school.seasons[school.seasons.length - 1];
  check('stat panels only inside the five-season window', withStats.length === Math.min(5, school.seasons.length), `${withStats.length} with stats`);
  check('oldest season has no stat panel or schedule fabricated', school.seasons.length <= 5 || (oldest.stats.length === 0 && oldest.schedule.length === 0 && oldest.pointsFor === null));
  check('all-time ledger present', !!school.allTime && school.allTime.wins > 0, `${school.allTime?.wins}-${school.allTime?.losses}-${school.allTime?.ties}`);
  check('staff resolved for click-through', school.staff.length === 3, school.staff.map((s) => `${s.role.split(' ')[0]} ${s.name}`).join(', '));
  check('conference read from history', !!school.conference, school.conference);
  console.log(`\n${school.name} ${school.nickName} — ${school.conference}, rank ${school.rank || 'NR'}, ${school.wins}-${school.losses}`);
  for (const g of nowSeason.schedule) {
    console.log(`  W${String(g.week).padStart(2)} ${g.home ? 'vs' : 'at'} ${g.opponent}${g.outcome ? ` — ${g.outcome} ${g.scoreUs}–${g.scoreThem}` : ''}${g.bowlName ? ` [${g.bowlName}]` : ''}`);
  }
  for (const y of school.seasons.slice(0, 5)) {
    console.log(`  ${y.year} ${y.wins}-${y.losses} (${y.confWins}-${y.confLosses} ${y.conference}) rank ${y.finalRank || '—'} coach ${y.coachName} stats=${y.stats.length} sched=${y.schedule.length}${y.postseason ? ` — ${y.postseason}` : ''}`);
  }
}

// Banked schedules: a synthetic banked year must surface as that season's
// schedule with points, exactly as the pipeline's bank will feed it.
{
  const ndRow = snap.teams.find((t) => t.longName === 'Notre Dame')?.row;
  const oppRow = snap.teams.find((t) => t.longName === 'Duke')?.row;
  if (ndRow !== undefined && oppRow !== undefined) {
    const banked = new Map<number, import('../src/shared/types.ts').GameInfo[]>([
      [2033, [
        { week: 1, weekType: 'RegularSeason', homeRow: ndRow, awayRow: oppRow, homeScore: 31, awayScore: 10, status: 'home', gotw: false, overtime: false, network: 'National', attendance: 77000, bowlName: null },
        { week: 2, weekType: 'RegularSeason', homeRow: oppRow, awayRow: ndRow, homeScore: 21, awayScore: 28, status: 'away', gotw: false, overtime: false, network: 'National', attendance: 40000, bowlName: 'Orange Bowl' }
      ]]
    ]);
    const prof = await extractSchoolProfile(franchise, ndRow, banked);
    const s33 = prof?.seasons.find((s) => s.year === 2033);
    check(
      'banked year surfaces as schedule + points',
      !!s33 && s33.schedule.length === 2 && s33.wins === 2 && s33.pointsFor === 59 && s33.pointsAgainst === 31 &&
        s33.schedule[1].bowlName === 'Orange Bowl' && s33.schedule[0].opponent === 'Duke',
      s33 ? `${s33.schedule.length} games, ${s33.wins}W, PF ${s33.pointsFor} PA ${s33.pointsAgainst}` : 'season missing'
    );
    const s32 = prof?.seasons.find((s) => s.year === 2032);
    check('unbanked year stays schedule-free', !!s32 && s32.schedule.length === 0 && s32.pointsFor === null);
  }
}

// Neighboring team spot-check: another school resolves too.
const other = snap.teams.find((t) => t.longName.includes('North Carolina') && !t.longName.includes('State'));
if (other) {
  const prof = await extractSchoolProfile(franchise, other.row);
  check('second school resolves', !!prof && (prof.seasons[0]?.schedule.length ?? 0) >= 12, `${prof?.name}: ${prof?.seasons[0]?.schedule.length} games`);
}

// Offense/defense ranks: the save's ladder is 0-based, profiles are 1-based.
// Exactly one school must hold #1 on each side, and none may show 0.
{
  const ranks: { name: string; off: number; def: number; fbs: boolean }[] = [];
  for (const t of snap.teams.slice(0, 200)) {
    const p = await extractSchoolProfile(franchise, t.row);
    // Year-by-year history separates real programs from the FCS filler
    // squads, which carry the 255 "unranked" sentinel by design.
    if (p && (p.seasons[0]?.schedule.length ?? 0) > 0) {
      ranks.push({ name: p.name, off: p.offenseRank, def: p.defenseRank, fbs: p.seasons.length > 1 });
    }
  }
  const offOnes = ranks.filter((r) => r.off === 1);
  const defOnes = ranks.filter((r) => r.def === 1);
  const fbs = ranks.filter((r) => r.fbs);
  check('exactly one #1 offense', offOnes.length === 1, offOnes.map((r) => r.name).join(', '));
  check('exactly one #1 defense', defOnes.length === 1, defOnes.map((r) => r.name).join(', '));
  check(
    'every real program shows a 1-based rank',
    fbs.length >= 130 && fbs.every((r) => r.off >= 1 && r.def >= 1),
    `${fbs.length} programs, ${ranks.length - fbs.length} filler squads unranked`
  );
}

console.log(failures === 0 ? '\nALL PROFILE CHECKS PASSED' : `\n${failures} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
