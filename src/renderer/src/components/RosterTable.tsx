import { useMemo, useState } from 'react';
import type { RosterPlayer } from '../../../shared/types.ts';
import { useHQ } from '../store.ts';
import {
  POSITION_GROUPS,
  devClass,
  devLabel,
  heightFt,
  ovrTier,
  spaceOut,
  yearAbbrev
} from '../lib/format.ts';

type SortKey =
  | 'overall'
  | 'name'
  | 'position'
  | 'year'
  | 'speed'
  | 'jersey'
  | 'dev'
  | 'height'
  | 'weight'
  | 'home';

const YEAR_ORDER: Record<string, number> = { Freshman: 0, Sophomore: 1, Junior: 2, Senior: 3 };
const DEV_ORDER: Record<string, number> = {
  Normal: 0,
  College_Impact: 1,
  College_Star: 2,
  College_Elite: 3
};

function Portrait({ id }: { id: number }) {
  const [failed, setFailed] = useState(false);
  if (failed || !id) return <span className="avatar avatar-blank" />;
  return <img className="avatar" src={`portrait://${id}`} alt="" onError={() => setFailed(true)} />;
}

export default function RosterTable({ roster }: { roster: RosterPlayer[] }) {
  const [group, setGroup] = useState<string>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [asc, setAsc] = useState(false);
  const portraitsOn = useHQ((s) => !!s.settings?.portraitsDir);

  const filtered = useMemo(() => {
    const list =
      group === 'ALL'
        ? [...roster]
        : roster.filter((p) => (POSITION_GROUPS[group] ?? []).includes(p.position));
    const dir = asc ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return dir * `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
        case 'position':
          return dir * a.position.localeCompare(b.position) || b.overall - a.overall;
        case 'year':
          return dir * ((YEAR_ORDER[a.schoolYear] ?? 9) - (YEAR_ORDER[b.schoolYear] ?? 9)) || b.overall - a.overall;
        case 'speed':
          return dir * (a.speed - b.speed);
        case 'jersey':
          return dir * (a.jersey - b.jersey);
        case 'dev':
          return dir * ((DEV_ORDER[a.devTrait] ?? 0) - (DEV_ORDER[b.devTrait] ?? 0)) || b.overall - a.overall;
        case 'height':
          return dir * (a.heightIn - b.heightIn) || b.overall - a.overall;
        case 'weight':
          return dir * (a.weightLb - b.weightLb) || b.overall - a.overall;
        case 'home':
          return dir * a.homeState.localeCompare(b.homeState) || b.overall - a.overall;
        default:
          return dir * (a.overall - b.overall);
      }
    });
    return list;
  }, [roster, group, sortKey, asc]);

  const sortBy = (key: SortKey, defaultAsc = false) => {
    if (sortKey === key) {
      setAsc(!asc);
    } else {
      setSortKey(key);
      setAsc(defaultAsc);
    }
  };

  const th = (label: string, key: SortKey, opts?: { num?: boolean; defaultAsc?: boolean }) => (
    <th
      className={`${opts?.num ? 'num ' : ''}${sortKey === key ? 'sorted' : ''}`}
      onClick={() => sortBy(key, opts?.defaultAsc ?? false)}
    >
      {label}
      {sortKey === key ? (asc ? ' ↑' : ' ↓') : ''}
    </th>
  );

  return (
    <>
      <div className="filters">
        {['ALL', ...Object.keys(POSITION_GROUPS)].map((g) => (
          <button key={g} className={`filter ${group === g ? 'active' : ''}`} onClick={() => setGroup(g)}>
            {g}
          </button>
        ))}
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {th('#', 'jersey', { defaultAsc: true })}
              {th('Player', 'name', { defaultAsc: true })}
              {th('Pos', 'position', { defaultAsc: true })}
              {th('Yr', 'year', { defaultAsc: true })}
              {th('OVR', 'overall')}
              {th('Dev', 'dev')}
              {th('Ht', 'height', { num: true })}
              {th('Wt', 'weight', { num: true })}
              {th('Spd', 'speed', { num: true })}
              {th('Home', 'home', { defaultAsc: true })}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.row}>
                <td className="jersey">{p.jersey}</td>
                <td className="pname" title={`Portrait #${p.portraitId}`}>
                  {portraitsOn && <Portrait id={p.portraitId} />}
                  {p.firstName} {p.lastName}
                </td>
                <td>
                  <span className="pos-tag">{p.position}</span>
                </td>
                <td>
                  {yearAbbrev(p.schoolYear, p.redshirt).replace(' (RS)', '')}
                  {yearAbbrev(p.schoolYear, p.redshirt).includes('(RS)') && <span className="rs"> RS</span>}
                </td>
                <td>
                  <span className={ovrTier(p.overall)}>{p.overall}</span>
                </td>
                <td>
                  <span className={devClass(p.devTrait)}>{devLabel(p.devTrait)}</span>
                </td>
                <td className="num">{heightFt(p.heightIn)}</td>
                <td className="num">{p.weightLb}</td>
                <td className="num">{p.speed}</td>
                <td style={{ color: 'var(--ink-2)' }}>{spaceOut(p.homeState)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="foot-note">
        {filtered.length} of {roster.length} players
      </p>
    </>
  );
}
