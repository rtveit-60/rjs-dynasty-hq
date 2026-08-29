import { useEffect, useState } from 'react';
import type { RecruitCard } from '../../../shared/types.ts';
import { archetypeLabel, devClass, devLabel, heightFt, ovrTier, spaceOut } from '../lib/format.ts';

const RANK_COLOR: Record<string, string> = {
  Bronze: '#a9713f',
  Silver: '#9aa3ad',
  Gold: '#c9a227',
  Platinum: '#6fd3d0'
};

/**
 * The expanded detail for one recruit. Fetched over IPC on first open — the
 * class is thousands deep, so attributes are never shipped in the snapshot.
 */
export default function RecruitCardRow({ playerRow, span }: { playerRow: number; span: number }) {
  const [card, setCard] = useState<RecruitCard | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'empty'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    void window.hq
      .getRecruitCard(playerRow)
      .then((c) => {
        if (!alive) return;
        setCard(c);
        setState(c ? 'ready' : 'empty');
      })
      .catch(() => alive && setState('empty'));
    return () => {
      alive = false;
    };
  }, [playerRow]);

  return (
    <tr className="card-row">
      <td colSpan={span} style={{ padding: 0 }}>
        <div className="recruit-card">
          {state === 'loading' && <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>Reading attributes…</span>}
          {state === 'empty' && (
            <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>No attribute detail in this save.</span>
          )}
          {state === 'ready' && card && (
            <>
              <div className="rc-head">
                <span className={`ovr ${ovrTier(card.overall)}`}>{card.overall}</span>
                <div>
                  <div className="rc-arch">{archetypeLabel(card.archetype)}</div>
                  <div className="rc-meta">
                    <span>{card.position}</span>
                    <span>{heightFt(card.heightIn)}</span>
                    <span>{card.weightLb} lb</span>
                    <span className={devClass(card.devTrait)}>{devLabel(card.devTrait)}</span>
                    {card.homeTown && (
                      <span>
                        {card.homeTown}, {spaceOut(card.homeState)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="rc-ratings">
                {card.ratings.map((r) => (
                  <div key={r.label} className="rc-stat" title={r.label}>
                    <span className="rc-stat-k">{r.label}</span>
                    <span className={`rc-stat-v ${ovrTier(r.value)}`}>{r.value}</span>
                    <span className="rc-bar">
                      <span style={{ width: `${Math.max(0, Math.min(100, r.value))}%` }} />
                    </span>
                  </div>
                ))}
              </div>

              <div className="rc-abilities">
                <div>
                  <div className="rc-sub">Mental</div>
                  {card.mental.length ? (
                    card.mental.map((a) => (
                      <span key={a.name} className="chip">
                        {spaceOut(a.name)}
                        {a.rank && (
                          <>
                            &nbsp;
                            <b style={{ color: RANK_COLOR[a.rank] ?? 'var(--ink-3)' }}>{a.rank}</b>
                          </>
                        )}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>None</span>
                  )}
                </div>
                <div>
                  <div className="rc-sub">Physical</div>
                  {card.physical.length ? (
                    card.physical.map((a, i) => (
                      <span key={i} className="chip">
                        {a.name || `Slot ${i + 1}`}&nbsp;
                        <b style={{ color: RANK_COLOR[a.rank] ?? 'var(--ink-3)' }}>{a.rank}</b>
                      </span>
                    ))
                  ) : (
                    <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>None</span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
