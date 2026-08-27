import { useMemo, useState } from 'react';
import type { ClassRecruit, TargetSchool } from '../../../shared/types.ts';
import {
  POSITION_GROUPS,
  STAGE_LABELS,
  devClass,
  devLabel,
  fmt,
  spaceOut,
  stars
} from '../lib/format.ts';
import { useHQ } from '../store.ts';

function Race({ race }: { race: TargetSchool[] }) {
  if (!race.length) return <span style={{ color: 'var(--ink-3)' }}>—</span>;
  return (
    <span className="race">
      {race.map((s, i) => (
        <span key={`${s.name}-${i}`}>
          {i > 0 && ' · '}
          <span className={s.isUser ? 'lead' : ''}>
            {s.name} {s.influence}
          </span>
        </span>
      ))}
    </span>
  );
}

const STAR_FILTERS = [
  { label: 'All', min: 0 },
  { label: '5★', min: 5 },
  { label: '4★+', min: 4 },
  { label: '3★+', min: 3 }
];

const ROW_CAP = 200;

export default function RecruitingView() {
  const snapshot = useHQ((s) => s.snapshot);
  const rc = snapshot?.school?.recruiting;
  const teamName = snapshot?.school?.team.longName;
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('ALL');
  const [minStars, setMinStars] = useState(0);
  const [edgeOnly, setEdgeOnly] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [boardOnly, setBoardOnly] = useState(false);

  const filtered = useMemo(() => {
    if (!rc) return [];
    const needle = q.trim().toLowerCase();
    return rc.recruits.filter((r) => {
      if (minStars && r.stars < minStars) return false;
      if (group !== 'ALL' && !(POSITION_GROUPS[group] ?? []).includes(r.position)) return false;
      if (edgeOnly && !r.edges.length) return false;
      if (openOnly && r.committedTo) return false;
      if (boardOnly && !r.onBoard) return false;
      if (needle) {
        const hay = `${r.name} ${r.position} ${spaceOut(r.homeState)} ${spaceOut(r.pipeline)}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rc, q, group, minStars, edgeOnly, openOnly, boardOnly]);

  if (!rc) {
    return (
      <div className="page">
        <div className="empty">Reading your dynasty save…</div>
      </div>
    );
  }

  const myCommits = rc.recruits.filter((r) => r.committedTo === teamName).length;
  const gems = rc.recruits.filter((r) => r.quality === 'GEM').length;

  const statusCell = (r: ClassRecruit) => {
    if (r.committedTo) {
      const mine = r.committedTo === teamName;
      return (
        <span className={mine ? 'commit' : ''} style={mine ? undefined : { color: 'var(--ink-3)' }}>
          → {r.committedTo}
        </span>
      );
    }
    return <span>{STAGE_LABELS[r.stage] ?? r.stage}</span>;
  };

  return (
    <div className="page">
      <div className="page-kicker">Class of {rc.classYear}</div>
      <h1 className="page-title">
        Recruiting <span className="nick">Board</span>
      </h1>
      <div className="page-sub">
        <span className="chip">
          <span className="k">PROSPECTS</span> <b>{fmt(rc.total)}</b>
        </span>
        <span className="chip">
          <span className="k">YOUR COMMITS</span> <b>{myCommits}</b>
        </span>
        <span className="chip">
          <span className="k">YOUR BOARD</span> <b>{rc.recruits.filter((r) => r.onBoard).length}</b>
        </span>
        <span className="chip">
          <span className="k">GEMS IN CLASS</span> <b>{gems}</b>
        </span>
      </div>

      <div className="filters" style={{ marginTop: 16 }}>
        <input
          className="search"
          style={{ width: 230, padding: '5px 10px' }}
          placeholder="Search name, state, pipeline…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {['ALL', ...Object.keys(POSITION_GROUPS)].map((g) => (
          <button key={g} className={`filter ${group === g ? 'active' : ''}`} onClick={() => setGroup(g)}>
            {g}
          </button>
        ))}
      </div>
      <div className="filters" style={{ marginTop: 0 }}>
        {STAR_FILTERS.map((f) => (
          <button
            key={f.label}
            className={`filter ${minStars === f.min ? 'active' : ''}`}
            onClick={() => setMinStars(f.min)}
          >
            {f.label}
          </button>
        ))}
        <button className={`filter ${edgeOnly ? 'active' : ''}`} onClick={() => setEdgeOnly(!edgeOnly)}>
          Your Edge
        </button>
        <button className={`filter ${openOnly ? 'active' : ''}`} onClick={() => setOpenOnly(!openOnly)}>
          Uncommitted
        </button>
        <button className={`filter ${boardOnly ? 'active' : ''}`} onClick={() => setBoardOnly(!boardOnly)}>
          On Board
        </button>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Rating</th>
              <th>Recruit</th>
              <th>Pos</th>
              <th>Cls</th>
              <th>Dev</th>
              <th>Pipeline</th>
              <th>Your Edge</th>
              <th>Status</th>
              <th className="num">Natl</th>
              <th className="num">Offers</th>
              <th>The Race</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, ROW_CAP).map((r) => (
              <tr key={r.row}>
                <td>
                  <span className="stars-cell">{stars(r.stars).slice(0, r.stars)}</span>{' '}
                  {r.quality === 'GEM' && <span className="q gem">GEM</span>}
                  {r.quality === 'BUST' && <span className="q bust">BUST</span>}
                </td>
                <td className="pname">
                  {r.onBoard && <span className="fav" title="On your board">▣ </span>}
                  {r.name}
                  <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}> · {spaceOut(r.homeState)}</span>
                </td>
                <td>
                  <span className="pos-tag">{r.position}</span>
                </td>
                <td style={{ color: 'var(--ink-3)' }}>{r.classType}</td>
                <td>
                  <span className={devClass(r.devTrait)}>{devLabel(r.devTrait)}</span>
                </td>
                <td style={{ color: 'var(--ink-2)' }}>{spaceOut(r.pipeline)}</td>
                <td>
                  {r.edges.map((e) => (
                    <span key={e} className="edge">
                      {e}
                    </span>
                  ))}
                </td>
                <td>{statusCell(r)}</td>
                <td className="num">{r.nationalRank || '—'}</td>
                <td className="num">{r.offers}</td>
                <td>
                  <Race race={r.race} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="foot-note">
        Showing {Math.min(filtered.length, ROW_CAP)} of {fmt(filtered.length)} matching prospects
        {filtered.length > ROW_CAP ? ' — refine filters to narrow the list' : ''}. ▣ marks recruits on
        your board; edges compare your pipelines and program grades against each recruit's actual
        pursuers.
      </p>
    </div>
  );
}
