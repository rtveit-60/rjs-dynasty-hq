import { useEffect, useState } from 'react';
import type { RecruitCard } from '../../../shared/types.ts';
import { PITCHES } from '../../../shared/pitches.ts';
import { RATINGS } from '../../../shared/ratings.ts';
import { archetypeLabel, devClass, devLabel, heightFt, ovrTier, recruitPos, spaceOut } from '../lib/format.ts';

const RANK_COLOR: Record<string, string> = {
  Bronze: '#a9713f',
  Silver: '#9aa3ad',
  Gold: '#c9a227',
  Platinum: '#6fd3d0'
};

/** "SPD" → "Speed", for the tile tooltips. */
const SKILL_NAME = new Map(RATINGS.map((r) => [r.label, r.name]));

/**
 * "At a Glance" — the expanded detail for one recruit: the skills their
 * position lives on, highlighted, plus their named abilities. Fetched over IPC
 * on first open (the class is thousands deep, so attributes are never shipped
 * in the snapshot). The full ratings sheet and the race live in the profile.
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
              <div className="rc-kicker">At a Glance</div>
              <div className="rc-head">
                <span className={`ovr ${ovrTier(card.overall)}`}>{card.overall}</span>
                <div>
                  <div className="rc-arch">{archetypeLabel(card.archetype)}</div>
                  <div className="rc-meta">
                    <span>{recruitPos(card.position)}</span>
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

              <div className="rc-glance">
                {card.glance.map((g) => (
                  <div key={g.label} className="rc-skill" title={SKILL_NAME.get(g.label) ?? g.label}>
                    <span className="rc-skill-k">{g.label}</span>
                    <span className={`rc-skill-v ${ovrTier(g.value).split(' ')[1]}`}>{g.value}</span>
                  </div>
                ))}
              </div>

              {(card.mental.length > 0 || card.physical.length > 0) && (
                <div className="rc-abilities">
                  {card.mental.length > 0 && (
                    <div>
                      <div className="rc-sub">Mental</div>
                      {card.mental.map((a) => (
                        <span key={a.name} className="chip">
                          {spaceOut(a.name)}
                          {a.rank && (
                            <>
                              &nbsp;
                              <b style={{ color: RANK_COLOR[a.rank] ?? 'var(--ink-3)' }}>{a.rank}</b>
                            </>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                  {card.physical.length > 0 && (
                    <div>
                      <div className="rc-sub">Physical</div>
                      {card.physical.map((a, i) => (
                        <span key={i} className="chip">
                          {a.name || `Slot ${i + 1}`}&nbsp;
                          <b style={{ color: RANK_COLOR[a.rank] ?? 'var(--ink-3)' }}>{a.rank}</b>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {card.idealPitch && PITCHES[card.idealPitch] && (
                <div className="rc-abilities">
                  <div>
                    <div className="rc-sub">Motivations</div>
                    {PITCHES[card.idealPitch].motivations.map((m) => (
                      <span key={m} className="chip">
                        {m}
                      </span>
                    ))}
                  </div>
                  <div>
                    <div className="rc-sub">Ideal Pitch</div>
                    <span className="chip">
                      <b>{PITCHES[card.idealPitch].name}</b>
                    </span>
                  </div>
                </div>
              )}

            </>
          )}
        </div>
      </td>
    </tr>
  );
}
