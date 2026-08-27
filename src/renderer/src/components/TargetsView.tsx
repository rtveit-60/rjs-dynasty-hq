import { useMemo, useState } from 'react';
import type { RecruitTargetEntry, Snapshot, TargetSchool } from '../../../shared/types.ts';
import { STAGE_LABELS, spaceOut, stars } from '../lib/format.ts';
import { useHQ } from '../store.ts';

type School = NonNullable<Snapshot['school']>;

type SortKey =
  | 'name'
  | 'pos'
  | 'stars'
  | 'gem'
  | 'status'
  | 'visit'
  | 'nil'
  | 'standing'
  | 'natl'
  | 'posrk'
  | 'race';

const GEM_ORDER: Record<string, number> = { BUST: 0, NORMAL: 1, GEM: 2 };
const STAGE_ORDER: Record<string, number> = {
  Top10: 0,
  Top5: 1,
  Top3: 2,
  Battle: 3,
  SoftCommitted: 4,
  HardCommitted: 5
};
const BIG = Number.MAX_SAFE_INTEGER;

const standingOf = (t: RecruitTargetEntry): number => {
  const i = t.pursuing.findIndex((s) => s.isUser);
  return i >= 0 ? i + 1 : BIG;
};

function Race({ pursuing }: { pursuing: TargetSchool[] }) {
  return (
    <span className="race">
      {pursuing.slice(0, 3).map((s, i) => (
        <span key={s.name}>
          {i > 0 && ' · '}
          <span className={s.isUser ? 'lead' : ''}>
            {s.name} {s.influence}
          </span>
          {s.delta !== null && s.delta !== 0 && (
            <span className={s.delta > 0 ? 'delta-up' : 'delta-down'}>
              {' '}
              {s.delta > 0 ? '+' : '−'}
              {Math.abs(s.delta)}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

export default function TargetsView({ school }: { school: School }) {
  const board = school.board;
  const currentWeek = useHQ((s) => s.snapshot?.season?.week ?? 0);
  const [sortKey, setSortKey] = useState<SortKey>('stars');
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => {
    if (!board) return [];
    const dir = asc ? 1 : -1;
    const list = [...board.targets];
    list.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return dir * a.name.localeCompare(b.name);
        case 'pos':
          return dir * a.position.localeCompare(b.position) || b.stars - a.stars;
        case 'gem':
          return dir * ((GEM_ORDER[a.quality] ?? 1) - (GEM_ORDER[b.quality] ?? 1)) || b.stars - a.stars;
        case 'status':
          return (
            dir * ((STAGE_ORDER[a.stage] ?? 9) - (STAGE_ORDER[b.stage] ?? 9)) || b.influence - a.influence
          );
        case 'visit':
          return dir * ((a.visitWeek ?? BIG) - (b.visitWeek ?? BIG)) || b.stars - a.stars;
        case 'nil':
          return dir * (a.nilOffer - b.nilOffer) || b.stars - a.stars;
        case 'standing':
          return dir * (standingOf(a) - standingOf(b)) || b.influence - a.influence;
        case 'natl':
          return dir * ((a.nationalRank || BIG) - (b.nationalRank || BIG));
        case 'posrk':
          return dir * ((a.positionRank || BIG) - (b.positionRank || BIG));
        case 'race':
          return dir * ((a.pursuing[0]?.influence ?? -1) - (b.pursuing[0]?.influence ?? -1));
        default:
          return dir * (a.stars - b.stars) || b.influence - a.influence;
      }
    });
    return list;
  }, [board, sortKey, asc]);

  if (!board || !board.targets.length) {
    return <div className="empty">No recruiting board found in this save.</div>;
  }
  const gems = board.targets.filter((t) => t.quality === 'GEM').length;
  const busts = board.targets.filter((t) => t.quality === 'BUST').length;
  const committed = board.targets.filter((t) => t.stage.includes('Committed')).length;

  const sortBy = (key: SortKey, defaultAsc = false) => {
    if (sortKey === key) setAsc(!asc);
    else {
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

  const statusCell = (t: RecruitTargetEntry) => (
    <span className={t.stage.includes('Committed') ? 'commit' : ''}>
      {STAGE_LABELS[t.stage] ?? t.stage}
    </span>
  );

  return (
    <>
      <div className="filters" style={{ alignItems: 'center' }}>
        <span className="chip">
          <span className="k">BOARD</span> <b>{board.targets.length}</b>
        </span>
        <span className="chip">
          <span className="k">HOURS</span>{' '}
          <b>
            {board.hoursAssigned}/{board.hoursTotal}
          </b>
        </span>
        <span className="chip">
          <span className="k">COMMITS</span> <b>{committed}</b>
        </span>
        <span className="chip">
          <span className="k">GEMS</span> <b>{gems}</b>
        </span>
        <span className="chip">
          <span className="k">BUSTS</span> <b>{busts}</b>
        </span>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {th('Recruit', 'name', { defaultAsc: true })}
              {th('Pos', 'pos', { defaultAsc: true })}
              {th('Rating', 'stars')}
              {th('Gem', 'gem')}
              {th('Status', 'status')}
              {th('Visit', 'visit', { defaultAsc: true })}
              {th('NIL', 'nil', { num: true })}
              {th('Standing', 'standing', { num: true, defaultAsc: true })}
              {th('Natl', 'natl', { num: true, defaultAsc: true })}
              {th('Pos Rk', 'posrk', { num: true, defaultAsc: true })}
              {th('The Race', 'race')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={`${t.name}-${t.nationalRank}`}>
                <td className="pname">
                  {t.isFavorite && <span className="fav">♥ </span>}
                  {t.name}
                  <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}> · {spaceOut(t.homeState)}</span>
                </td>
                <td>
                  <span className="pos-tag">{t.position}</span>
                </td>
                <td>
                  <span className="stars-cell" title={`${t.stars} stars`}>
                    {stars(t.stars).slice(0, t.stars)}
                    <span className="off">{stars(t.stars).slice(t.stars)}</span>
                  </span>
                </td>
                <td>
                  {t.quality === 'GEM' && <span className="q gem">GEM</span>}
                  {t.quality === 'BUST' && <span className="q bust">BUST</span>}
                  {t.quality !== 'GEM' && t.quality !== 'BUST' && '—'}
                </td>
                <td>{statusCell(t)}</td>
                <td title={t.visitActivity ? spaceOut(t.visitActivity) : undefined}>
                  {t.visitWeek !== null ? (
                    <span className={t.visitWeek >= currentWeek ? 'visit-yes' : undefined}>
                      Wk {t.visitWeek}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="num" title={`Expects ${t.nilExpectation}`}>
                  {t.nilOffer > 0 ? t.nilOffer : '—'}
                  {t.nilOffer > 0 && t.nilOffer < t.nilExpectation && (
                    <span style={{ color: 'var(--warn)' }}> ▾</span>
                  )}
                </td>
                <td className="num" title={`Influence ${t.influence}`}>
                  {standingOf(t) === BIG ? '—' : <b>#{standingOf(t)}</b>}
                </td>
                <td className="num">{t.nationalRank > 0 ? t.nationalRank : '—'}</td>
                <td className="num">{t.positionRank > 0 ? t.positionRank : '—'}</td>
                <td>
                  <Race pursuing={t.pursuing} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="foot-note">
        Standing is your rank among the schools pursuing the recruit (hover for raw influence). Visit
        weeks in green are upcoming; hover shows the planned activity. The race lists the top three
        pursuers with week-over-week influence changes. ♥ marks board favorites.
      </p>
    </>
  );
}
