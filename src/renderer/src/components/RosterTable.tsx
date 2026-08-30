import { useMemo, useState } from 'react';
import type { RosterPlayer, SchoolGrade } from '../../../shared/types.ts';
import { NameLink } from './ProfileModal.tsx';
import {
  POSITION_GROUPS,
  archetypeLabel,
  devClass,
  devLabel,
  heightFt,
  ovrTier,
  spaceOut,
  yearAbbrev
} from '../lib/format.ts';

type SortKey =
  | 'overall'
  | 'first'
  | 'last'
  | 'position'
  | 'year'
  | 'jersey'
  | 'dev'
  | 'archetype'
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

export default function RosterTable({
  roster,
  proPotential = []
}: {
  roster: RosterPlayer[];
  proPotential?: SchoolGrade[];
}) {
  // Empty set = no position filter (ALL). Multiple groups can be selected.
  const [groups, setGroups] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [asc, setAsc] = useState(false);

  const isAll = groups.size === 0;
  const selected = [...groups];
  const summary = isAll
    ? 'ALL'
    : selected.length <= 3
      ? selected.join(' · ')
      : `${selected.length} GROUPS`;

  const toggleGroup = (g: string) =>
    setGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  /** A grade chip stays lit while its position group is part of the filter. */
  const gradeLit = (label: string): boolean =>
    isAll || selected.some((g) => g === label || (g === 'ST' && (label === 'K' || label === 'P')));

  const filtered = useMemo(() => {
    const list = isAll
      ? [...roster]
      : roster.filter((p) => selected.some((g) => (POSITION_GROUPS[g] ?? []).includes(p.position)));
    const dir = asc ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case 'first':
          return dir * a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName);
        case 'last':
          return dir * a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
        case 'position':
          return dir * a.position.localeCompare(b.position) || b.overall - a.overall;
        case 'year':
          return dir * ((YEAR_ORDER[a.schoolYear] ?? 9) - (YEAR_ORDER[b.schoolYear] ?? 9)) || b.overall - a.overall;
        case 'jersey':
          return dir * (a.jersey - b.jersey);
        case 'archetype':
          return dir * archetypeLabel(a.archetype).localeCompare(archetypeLabel(b.archetype)) || b.overall - a.overall;
        case 'dev':
          return dir * ((DEV_ORDER[a.devTrait] ?? 0) - (DEV_ORDER[b.devTrait] ?? 0)) || b.overall - a.overall;
        case 'height':
          return dir * (a.heightIn - b.heightIn) || b.overall - a.overall;
        case 'weight':
          return dir * (a.weightLb - b.weightLb) || b.overall - a.overall;
        case 'home':
          return (
            dir * (a.homeState.localeCompare(b.homeState) || a.homeTown.localeCompare(b.homeTown)) ||
            b.overall - a.overall
          );
        default:
          return dir * (a.overall - b.overall);
      }
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selected/isAll derive from groups
  }, [roster, groups, sortKey, asc]);

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
      <div className="filters" style={{ alignItems: 'center', position: 'relative', flexWrap: 'nowrap' }}>
        <button
          className={`filter ${!isAll ? 'active' : ''}`}
          style={{ whiteSpace: 'nowrap' }}
          onClick={() => setMenuOpen((o) => !o)}
        >
          POSITIONS · {summary} ▾
        </button>
        {menuOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} />
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                zIndex: 41,
                background: 'var(--paper)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minWidth: 150,
                boxShadow: '0 10px 28px rgba(0, 0, 0, 0.35)'
              }}
            >
              <button
                className={`filter ${isAll ? 'active' : ''}`}
                onClick={() => {
                  setGroups(new Set());
                  setMenuOpen(false);
                }}
              >
                ALL
              </button>
              {Object.keys(POSITION_GROUPS).map((g) => (
                <button
                  key={g}
                  className={`filter ${groups.has(g) ? 'active' : ''}`}
                  style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}
                  onClick={() => toggleGroup(g)}
                >
                  <span>{g}</span>
                  {groups.has(g) && <span>✓</span>}
                </button>
              ))}
            </div>
          </>
        )}
        {proPotential.length > 0 && (
          <span
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              whiteSpace: 'nowrap'
            }}
          >
            <span
              style={{
                fontSize: 10,
                lineHeight: 1,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--ink-3)'
              }}
            >
              Pro Potential by Position
            </span>
            {proPotential.map((g) => (
              <span
                key={g.label}
                title={`Pro potential — ${g.label}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  opacity: gradeLit(g.label) ? 1 : 0.4
                }}
              >
                <span style={{ fontSize: 11, lineHeight: 1, fontWeight: 600, color: 'var(--ink-3)' }}>
                  {g.label}
                </span>
                <span
                  className={`grade ${g.grade.startsWith('A') ? 'good' : ''}`}
                  style={{ lineHeight: '17px' }}
                >
                  {g.grade}
                </span>
              </span>
            ))}
          </span>
        )}
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {th('#', 'jersey', { defaultAsc: true })}
              {th('First', 'first', { defaultAsc: true })}
              {th('Last', 'last', { defaultAsc: true })}
              {th('Pos', 'position', { defaultAsc: true })}
              {th('Yr', 'year', { defaultAsc: true })}
              {th('OVR', 'overall')}
              {th('Dev', 'dev')}
              {th('Archetype', 'archetype', { defaultAsc: true })}
              {th('Ht', 'height', { num: true })}
              {th('Wt', 'weight', { num: true })}
              {th('Hometown', 'home', { defaultAsc: true })}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.row}>
                <td className="jersey">{p.jersey}</td>
                <td>
                  <NameLink req={{ kind: 'player', row: p.row }}>{p.firstName}</NameLink>
                </td>
                <td className="pname">
                  <NameLink req={{ kind: 'player', row: p.row }}>{p.lastName}</NameLink>
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
                <td style={{ color: 'var(--ink-2)' }}>{archetypeLabel(p.archetype)}</td>
                <td className="num">{heightFt(p.heightIn)}</td>
                <td className="num">{p.weightLb}</td>
                <td style={{ color: 'var(--ink-2)' }}>
                  {p.homeTown ? `${p.homeTown}, ` : ''}
                  {spaceOut(p.homeState)}
                </td>
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
