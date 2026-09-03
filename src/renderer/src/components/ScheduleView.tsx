import { useMemo } from 'react';
import type { GameInfo, Snapshot } from '../../../shared/types.ts';
import { spaceOut } from '../lib/format.ts';
import { useHQ } from '../store.ts';
import InfoDot, { InfoRow } from './InfoDot.tsx';
import { NameLink } from './ProfileModal.tsx';
import TeamLogo from './TeamLogo.tsx';

type School = NonNullable<Snapshot['school']>;

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEK_TYPE_ORDER: Record<string, number> = {
  RegularSeason: 0,
  ConferenceChampionship: 1,
  BowlSeason1: 2,
  BowlSeason2: 3,
  BowlSeason3: 4,
  NationalChampionship: 5
};

/** 1170 → "7:30 PM". */
function clock(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return '';
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

function dateLabel(g: GameInfo): string {
  if (!g.month || !g.day) return '';
  const wd = g.dayOfWeek ? `${g.dayOfWeek.slice(0, 3)} ` : '';
  return `${wd}${MONTHS[g.month] ?? g.month} ${g.day}`;
}

interface Row {
  key: string;
  week: number;
  weekType: string;
  game: GameInfo | null;
  /** Row the school is looking across at. */
  oppRow: number | null;
  home: boolean;
  outcome: 'W' | 'L' | '';
  us: number;
  them: number;
}

/**
 * The school's full season, week by week: every scheduled game with its
 * date, kickoff, venue side, TV window and result, byes in place, and the
 * next game marked. Read from the save's SeasonGame rows for the live
 * season; the game recycles the table every year, so past seasons live in
 * the school profile's banked history instead.
 */
export default function ScheduleView({ school }: { school: School }) {
  const snapshot = useHQ((s) => s.snapshot);
  const teams = snapshot?.teams ?? [];
  const games = snapshot?.games ?? [];
  const season = snapshot?.season ?? null;
  const row = school.team.row;
  const teamOf = (r: number) => teams.find((t) => t.row === r) ?? null;

  const rows = useMemo<Row[]>(() => {
    const mine = games
      .filter((g) => g.homeRow === row || g.awayRow === row)
      .map((g): Row => {
        const home = g.homeRow === row;
        const us = home ? g.homeScore : g.awayScore;
        const them = home ? g.awayScore : g.homeScore;
        const outcome: Row['outcome'] =
          g.status === 'unplayed' ? '' : (g.status === 'home') === home ? 'W' : 'L';
        return {
          key: `${g.weekType}:${g.week}:${g.homeRow}:${g.awayRow}`,
          week: g.week,
          weekType: g.weekType,
          game: g,
          oppRow: home ? g.awayRow : g.homeRow,
          home,
          outcome,
          us,
          them
        };
      })
      .sort((a, b) => (WEEK_TYPE_ORDER[a.weekType] ?? 9) - (WEEK_TYPE_ORDER[b.weekType] ?? 9) || a.week - b.week);
    // Byes: regular-season weeks inside the league's played span with no game for us.
    const regWeeks = games.filter((g) => g.weekType === 'RegularSeason').map((g) => g.week);
    if (regWeeks.length) {
      const last = Math.max(...regWeeks);
      const have = new Set(mine.filter((r) => r.weekType === 'RegularSeason').map((r) => r.week));
      for (let w = 0; w <= last; w++) {
        if (!have.has(w)) {
          mine.push({ key: `bye:${w}`, week: w, weekType: 'RegularSeason', game: null, oppRow: null, home: false, outcome: '', us: 0, them: 0 });
        }
      }
      mine.sort((a, b) => (WEEK_TYPE_ORDER[a.weekType] ?? 9) - (WEEK_TYPE_ORDER[b.weekType] ?? 9) || a.week - b.week);
    }
    return mine;
  }, [games, row]);

  const wins = rows.filter((r) => r.outcome === 'W').length;
  const losses = rows.filter((r) => r.outcome === 'L').length;
  const next = rows.find((r) => r.game && r.outcome === '') ?? null;
  const homeCount = rows.filter((r) => r.game && r.home).length;
  const awayCount = rows.filter((r) => r.game && !r.home).length;
  const preseason = season?.weekType === 'Preseason' || season?.stage === 'Preseason';

  if (!rows.length) {
    return <div className="empty">No games scheduled for this program in the save yet.</div>;
  }

  return (
    <div>
      <div className="sched-head">
        <div className="sched-stat">
          <span className="k">Record</span>
          <span className="v">{wins}–{losses}</span>
        </div>
        <div className="sched-stat">
          <span className="k">Home / Away</span>
          <span className="v">{homeCount} / {awayCount}</span>
        </div>
        <div className="sched-stat">
          <span className="k">Next up</span>
          <span className="v" style={{ fontSize: 16 }}>
            {next?.oppRow !== null && next?.oppRow !== undefined
              ? `${next.home ? 'vs' : 'at'} ${teamOf(next.oppRow)?.displayName ?? '—'}`
              : 'Season complete'}
          </span>
        </div>
        <span style={{ marginLeft: 'auto' }}>
          <InfoDot title="Schedule">
            <p>
              Every game on your program's slate for the live season, straight from the save: date and kickoff
              as the game has them, TV window, venue side, and the result once the final whistle lands.
            </p>
            <InfoRow term="Byes">Regular-season weeks the league plays without you.</InfoRow>
            <InfoRow term="Past seasons">
              The game recycles its schedule table each year, so earlier seasons live in your school profile's
              season browser (banked while the app is running).
            </InfoRow>
            <InfoRow term="Editing">
              Preseason schedule changes (swapping a non-conference opponent, flipping home and away) are
              planned once the game's own footprint for them has been observed. This tab is read-only for now.
            </InfoRow>
          </InfoDot>
        </span>
      </div>

      <div className="tbl-wrap">
        <table className="tbl sched-table">
          <thead>
            <tr>
              <th className="l">WK</th>
              <th className="l">DATE</th>
              <th className="l">OPPONENT</th>
              <th className="l">RESULT</th>
              <th className="l">TV</th>
              <th className="num">ATT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const opp = r.oppRow !== null ? teamOf(r.oppRow) : null;
              const isNext = next?.key === r.key;
              const wk = r.weekType === 'RegularSeason' ? `WK ${r.week}` : spaceOut(r.weekType).toUpperCase();
              if (!r.game) {
                return (
                  <tr key={r.key} className="bye">
                    <td className="sched-wk">{wk}</td>
                    <td colSpan={5}>Bye</td>
                  </tr>
                );
              }
              const g = r.game;
              return (
                <tr key={r.key} className={isNext ? 'next' : ''}>
                  <td className="sched-wk">{wk}</td>
                  <td>
                    {dateLabel(g)}
                    {g.timeOfDay !== null && g.timeOfDay !== undefined && !r.outcome && (
                      <span style={{ color: 'var(--ink-3)' }}> · {clock(g.timeOfDay)}</span>
                    )}
                  </td>
                  <td>
                    <span className="sched-opp">
                      <span className="sched-va">{r.home ? 'VS' : 'AT'}</span>
                      {opp && (
                        <TeamLogo
                          row={opp.row}
                          size={16}
                          fallback={<span className="swatch" style={{ background: opp.colors.primary }} />}
                        />
                      )}
                      {opp && opp.rank > 0 && opp.rank <= 25 && <span className="sched-rank">#{opp.rank}</span>}
                      <NameLink req={opp ? { kind: 'school', row: opp.row } : null}>
                        {opp ? `${opp.displayName} ${opp.nickName}`.trim() : '—'}
                      </NameLink>
                      {g.bowlName && <span style={{ color: 'var(--ink-3)' }}> · {g.bowlName}</span>}
                      {g.gotw && <span className="pf-bowl"> · Game of the Week</span>}
                    </span>
                  </td>
                  <td className={`sched-res ${r.outcome === 'W' ? 'w' : r.outcome === 'L' ? 'l' : ''}`}>
                    {r.outcome ? `${r.outcome} ${r.us}–${r.them}${g.overtime ? ' (OT)' : ''}` : isNext ? 'Next' : '—'}
                  </td>
                  <td>{g.network && g.network !== 'TBD' ? g.network : ''}</td>
                  <td className="num">{g.attendance > 0 ? g.attendance.toLocaleString('en-US') : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {preseason && (
        <div className="sched-note">Preseason: the game lets you swap non-conference opponents from its own schedule screen.</div>
      )}
    </div>
  );
}
