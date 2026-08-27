import type { Snapshot, TargetSchool } from '../../../shared/types.ts';
import { STAGE_LABELS, spaceOut, stars } from '../lib/format.ts';

type School = NonNullable<Snapshot['school']>;

function Race({ pursuing }: { pursuing: TargetSchool[] }) {
  return (
    <span className="race">
      {pursuing.slice(0, 3).map((s, i) => (
        <span key={s.name}>
          {i > 0 && ' · '}
          <span className={s.isUser ? 'lead' : ''}>
            {s.name} {s.influence}
          </span>
        </span>
      ))}
    </span>
  );
}

export default function TargetsView({ school }: { school: School }) {
  const board = school.board;
  if (!board || !board.targets.length) {
    return <div className="empty">No recruiting board found in this save.</div>;
  }
  const gems = board.targets.filter((t) => t.quality === 'GEM').length;
  const busts = board.targets.filter((t) => t.quality === 'BUST').length;
  const committed = board.targets.filter((t) => t.stage.includes('Committed')).length;

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
              <th>Recruit</th>
              <th>Pos</th>
              <th>Rating</th>
              <th>Status</th>
              <th className="num">NIL</th>
              <th className="num">Infl</th>
              <th className="num">Natl</th>
              <th>The Race</th>
            </tr>
          </thead>
          <tbody>
            {board.targets.map((t) => (
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
                  </span>{' '}
                  {t.quality === 'GEM' && <span className="q gem">GEM</span>}
                  {t.quality === 'BUST' && <span className="q bust">BUST</span>}
                </td>
                <td>
                  <span className={t.stage.includes('Committed') ? 'commit' : ''}>
                    {STAGE_LABELS[t.stage] ?? t.stage}
                  </span>
                  {t.hasVisit && <span className="tag" style={{ marginLeft: 6 }}>Visit</span>}
                </td>
                <td className="num" title={`Expects ${t.nilExpectation}`}>
                  {t.nilOffer > 0 ? t.nilOffer : '—'}
                  {t.nilOffer > 0 && t.nilOffer < t.nilExpectation && (
                    <span style={{ color: 'var(--warn)' }}> ▾</span>
                  )}
                </td>
                <td className="num">{t.influence}</td>
                <td className="num">{t.nationalRank > 0 ? t.nationalRank : '—'}</td>
                <td>
                  <Race pursuing={t.pursuing} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="foot-note">
        Influence is total recruiting influence earned with the recruit; the race shows the top three
        pursuing programs. ♥ marks board favorites.
      </p>
    </>
  );
}
