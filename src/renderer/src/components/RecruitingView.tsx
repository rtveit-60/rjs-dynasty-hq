import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ClassRecruit } from '../../../shared/types.ts';
import {
  RECRUIT_POS_OPTIONS,
  STAGE_LABELS,
  devClass,
  devLabel,
  fmt,
  ovrTier,
  recruitPos,
  recruitPosPool,
  recruitPositionsFor,
  spaceOut,
  stars
} from '../lib/format.ts';
import { useHQ } from '../store.ts';
import BoardMark from './BoardMark.tsx';
import InfoDot, { InfoRow } from './InfoDot.tsx';
import { NameLink } from './ProfileModal.tsx';
import RecruitCardRow from './RecruitCardRow.tsx';
import ScoutingView from './ScoutingView.tsx';

type Board = 'hs' | 'portal' | 'scout';

type SortKey =
  | 'rating'
  | 'name'
  | 'pos'
  | 'dev'
  | 'pipeline'
  | 'status'
  | 'ovr'
  | 'posrk'
  | 'natlrk'
  | 'edge'
  | 'offers';

const DEV_ORDER: Record<string, number> = {
  Normal: 0,
  College_Impact: 1,
  College_Star: 2,
  College_Elite: 3
};
const STAGE_ORDER: Record<string, number> = {
  Top10: 0,
  Top5: 1,
  Top3: 2,
  Battle: 3,
  SoftCommitted: 4,
  HardCommitted: 5
};
const BIG = Number.MAX_SAFE_INTEGER;
const PAGE_SIZE = 200;
const COLS = 11;

const STAR_FILTERS = [
  { label: 'All', min: 0 },
  { label: '5★', min: 5 },
  { label: '4★+', min: 4 },
  { label: '3★+', min: 3 }
];

export default function RecruitingView() {
  const snapshot = useHQ((s) => s.snapshot);
  const rc = snapshot?.school?.recruiting;
  const teamName = snapshot?.school?.team.longName;

  const [board, setBoard] = useState<Board>('hs');
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('ALL');
  const [minStars, setMinStars] = useState(0);
  const [edgeOnly, setEdgeOnly] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [boardOnly, setBoardOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('natlrk');
  const [asc, setAsc] = useState(true);
  const [page, setPage] = useState(0);
  const [openRow, setOpenRow] = useState<number | null>(null);

  const pool = useMemo(
    () => (rc?.recruits ?? []).filter((r) => (board === 'portal' ? r.isTransfer : !r.isTransfer)),
    [rc, board]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const allowed = recruitPositionsFor(pos);
    return pool.filter((r) => {
      if (minStars && r.stars < minStars) return false;
      if (allowed.length && !allowed.includes(r.position)) return false;
      if (edgeOnly && !r.edges.length) return false;
      if (openOnly && r.committedTo) return false;
      if (boardOnly && !r.onBoard) return false;
      if (needle) {
        const hay =
          `${r.name} ${recruitPos(r.position)} ${recruitPosPool(r.position)} ${spaceOut(r.homeState)} ${spaceOut(r.pipeline)}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [pool, q, pos, minStars, edgeOnly, openOnly, boardOnly]);

  const sorted = useMemo(() => {
    const dir = asc ? 1 : -1;
    const list = [...filtered];
    const rank = (n: number) => (n > 0 ? n : BIG);
    const byName = (a: ClassRecruit, b: ClassRecruit) => a.name.localeCompare(b.name);
    list.sort((a, b) => {
      switch (sortKey) {
        case 'rating':
          return (a.stars - b.stars) * dir || rank(a.nationalRank) - rank(b.nationalRank);
        case 'name':
          return byName(a, b) * dir;
        case 'pos':
          // Sort by the main type so LT and RT stay together under OT.
          return (
            (recruitPosPool(a.position).localeCompare(recruitPosPool(b.position)) ||
              recruitPos(a.position).localeCompare(recruitPos(b.position))) * dir || byName(a, b)
          );
        case 'dev':
          return ((DEV_ORDER[a.devTrait] ?? 0) - (DEV_ORDER[b.devTrait] ?? 0)) * dir || byName(a, b);
        case 'pipeline':
          return a.pipeline.localeCompare(b.pipeline) * dir || byName(a, b);
        case 'status': {
          // Committed sorts past every uncommitted stage.
          const s = (r: ClassRecruit) => (r.committedTo ? 100 : (STAGE_ORDER[r.stage] ?? -1));
          return (s(a) - s(b)) * dir || byName(a, b);
        }
        case 'ovr':
          return (a.overall - b.overall) * dir || rank(a.nationalRank) - rank(b.nationalRank);
        case 'posrk':
          return (rank(a.positionRank) - rank(b.positionRank)) * dir;
        case 'natlrk':
          return (rank(a.nationalRank) - rank(b.nationalRank)) * dir;
        case 'edge':
          return (a.edges.length - b.edges.length) * dir || byName(a, b);
        case 'offers':
          return (a.offers - b.offers) * dir || byName(a, b);
        default:
          return 0;
      }
    });
    return list;
  }, [filtered, sortKey, asc]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // Any change to the result set should put you back on page one.
  useEffect(() => {
    setPage(0);
    setOpenRow(null);
  }, [board, q, pos, minStars, edgeOnly, openOnly, boardOnly, sortKey, asc]);

  if (!rc) {
    return (
      <div className="page">
        <div className="empty">Reading your dynasty save…</div>
      </div>
    );
  }

  const myCommits = pool.filter((r) => r.committedTo === teamName).length;
  const gems = pool.filter((r) => r.quality === 'GEM').length;
  const portalCount = (rc.recruits ?? []).filter((r) => r.isTransfer).length;

  const sortBy = (key: SortKey, defaultAsc: boolean) => {
    if (sortKey === key) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(defaultAsc);
    }
  };

  const th = (label: string, key: SortKey, opts?: { num?: boolean; defaultAsc?: boolean; cls?: string }) => (
    <th
      className={`${opts?.num ? 'num ' : ''}${opts?.cls ? `${opts.cls} ` : ''}${sortKey === key ? 'sorted' : ''}`}
      onClick={() => sortBy(key, opts?.defaultAsc ?? false)}
      title={`Sort by ${label}`}
    >
      {label}
      {sortKey === key && <span className="sort-caret">{asc ? '▲' : '▼'}</span>}
    </th>
  );

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
    <div className="page page-fill">
      <div className="page-kicker">Class of {rc.classYear}</div>
      <h1 className="page-title">
        Recruiting <span className="nick">Board</span>
      </h1>

      <div className="tabs">
        <button className={`tab ${board === 'hs' ? 'active' : ''}`} onClick={() => setBoard('hs')}>
          HIGHSCHOOL RECRUITING
        </button>
        <button className={`tab ${board === 'portal' ? 'active' : ''}`} onClick={() => setBoard('portal')}>
          TRANSFER PORTAL
          {portalCount > 0 && <span className="tab-count">{fmt(portalCount)}</span>}
        </button>
        <button className={`tab ${board === 'scout' ? 'active' : ''}`} onClick={() => setBoard('scout')}>
          SCOUTING REPORTS
        </button>
        <InfoDot title="Recruiting Board">
          <p>
            Every prospect in the class, straight from the save. Sort any column, click a row for the
            skills their position lives on, and click a name for the full profile.
          </p>
          <InfoRow term="Gem / Bust">
            The save's own quality flag. Gems outplay their stars; busts fall short of them.
          </InfoRow>
          <InfoRow term="Ovr">True overall. The game hides it until you scout.</InfoRow>
          <InfoRow term="Edge">
            Where your program holds a clear advantage over the schools actually pursuing the
            recruit: pipeline, pro potential, home state, or leading the race.
          </InfoRow>
          <InfoRow term="Crosshair">
            The mark beside a name: that recruit is already on your recruiting board.
          </InfoRow>
          <InfoRow term="The race">
            Every pursuing school and its influence, in the recruit's profile.
          </InfoRow>
        </InfoDot>
      </div>

      {board === 'scout' ? (
        <ScoutingView
          recruits={rc.recruits}
          teamName={teamName}
          portalActive={portalCount > 0}
        />
      ) : (
      <>
      <div className="page-sub">
        <span className="chip">
          <span className="k">PROSPECTS</span> <b>{fmt(pool.length)}</b>
        </span>
        <span className="chip">
          <span className="k">YOUR COMMITS</span> <b>{myCommits}</b>
        </span>
        <span className="chip">
          <span className="k">YOUR BOARD</span> <b>{pool.filter((r) => r.onBoard).length}</b>
        </span>
        <span className="chip">
          <span className="k">GEMS</span> <b>{gems}</b>
        </span>
      </div>

      {/* One line: search, the game's position vocabulary, then everything else. */}
      <div className="filters" style={{ marginTop: 16, alignItems: 'center' }}>
        <input
          className="search"
          style={{ width: 230, padding: '5px 10px' }}
          placeholder="Search name, state, pipeline…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="scout-select pos-select"
          value={pos}
          onChange={(e) => setPos(e.target.value)}
          title="Position"
        >
          <option value="ALL">All positions</option>
          {RECRUIT_POS_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.key}
            </option>
          ))}
        </select>
        <span className="filter-sep" />
        {STAR_FILTERS.map((f) => (
          <button
            key={f.label}
            className={`filter ${minStars === f.min ? 'active' : ''}`}
            onClick={() => setMinStars(f.min)}
          >
            {f.label}
          </button>
        ))}
        <span className="filter-sep" />
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

      {board === 'portal' && portalCount === 0 ? (
        <div className="empty" style={{ marginTop: 18 }}>
          The portal is empty. It opens in the offseason and fills in as your save reaches that
          window.
        </div>
      ) : (
        <>
          <div className="tbl-wrap tbl-scroll">
            <table className="tbl tbl-wide">
              <thead>
                <tr>
                  {th('Rk', 'natlrk', { defaultAsc: true })}
                  {th('Recruit & School', 'name', { defaultAsc: true, cls: 'col-name' })}
                  {th('Pos', 'pos', { defaultAsc: true })}
                  {th('Stars', 'rating')}
                  {th('Ovr', 'ovr')}
                  {th('Dev', 'dev')}
                  {th('Pipeline', 'pipeline', { defaultAsc: true })}
                  {th('Status', 'status')}
                  {th('Pos Rk', 'posrk', { num: true, defaultAsc: true })}
                  {th('Edge', 'edge')}
                  {th('Offers', 'offers', { num: true })}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.row}>
                    <tr
                      onClick={() => setOpenRow(openRow === r.row ? null : r.row)}
                      className={`clickable ${openRow === r.row ? 'expanded' : ''}`}
                    >
                      <td className={`rk-lead ${r.nationalRank > 0 && r.nationalRank <= 5 ? 'hot' : ''}`}>
                        {r.nationalRank || '—'}
                      </td>
                      <td className="pname cell-clip name">
                        <span className="disclose">{openRow === r.row ? '▾' : '▸'}</span>
                        <NameLink req={{ kind: 'player', row: r.playerRow }}>{r.name}</NameLink>
                        <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>
                          {' · '}
                          {spaceOut(r.homeState)}
                          {board === 'portal' && r.classType !== 'HS' ? ` · ${r.classType}` : ''}
                        </span>
                        {r.onBoard && <BoardMark />}
                        {r.quality === 'GEM' && <span className="btag gem">Gem</span>}
                        {r.quality === 'BUST' && <span className="btag bust">Bust</span>}
                      </td>
                      <td>
                        <span className="pos-tag">{recruitPos(r.position)}</span>
                      </td>
                      <td>
                        <span className="stars-cell" title={`${r.stars} stars`}>
                          {stars(r.stars).slice(0, r.stars)}
                          <span className="off">{stars(r.stars).slice(r.stars)}</span>
                        </span>
                      </td>
                      <td>
                        <span className={ovrTier(r.overall)}>{r.overall}</span>
                      </td>
                      <td>
                        <span className={devClass(r.devTrait)}>{devLabel(r.devTrait)}</span>
                      </td>
                      <td className="cell-clip" style={{ color: 'var(--ink-2)' }} title={spaceOut(r.pipeline)}>
                        {spaceOut(r.pipeline)}
                      </td>
                      <td className="cell-clip" title={r.committedTo ?? undefined}>
                        {statusCell(r)}
                      </td>
                      <td className="num">{r.positionRank || '—'}</td>
                      {/* One chip keeps the column narrow; hover lists every edge. */}
                      <td className="cell-clip" title={r.edges.join(', ')}>
                        {r.edges.length ? (
                          <>
                            <span className="btag">{r.edges[0]}</span>
                            {r.edges.length > 1 && <span className="btag">+{r.edges.length - 1}</span>}
                          </>
                        ) : (
                          <span style={{ color: 'var(--ink-3)' }}>—</span>
                        )}
                      </td>
                      <td className="num">{r.offers}</td>
                    </tr>
                    {openRow === r.row && <RecruitCardRow playerRow={r.playerRow} span={COLS} />}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <button className="btn" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
              ← Prev
            </button>
            <span className="pager-info">
              {sorted.length
                ? `${fmt(safePage * PAGE_SIZE + 1)}–${fmt(Math.min(sorted.length, (safePage + 1) * PAGE_SIZE))} of ${fmt(sorted.length)}`
                : 'No matching prospects'}
              {pageCount > 1 && <span style={{ color: 'var(--ink-3)' }}> · page {safePage + 1} of {pageCount}</span>}
            </span>
            <button
              className="btn"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
            >
              Next →
            </button>
          </div>

        </>
      )}
      </>
      )}
    </div>
  );
}
