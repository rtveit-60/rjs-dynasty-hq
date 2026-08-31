import type { TeamNeed } from '../../../shared/types.ts';
import InfoDot, { InfoRow } from './InfoDot.tsx';

/**
 * Team Needs as seats: the game's own 57-man minimum composition rendered as
 * literal seats per position — filled (returning next season), gold (committed
 * recruit), dashed red (open, nobody fills it) — one compact tile per
 * position. Departures (seniors + draft entries) leave the projection
 * immediately; the game itself carries them until week 4 of the offseason.
 */

const SIDES: { key: TeamNeed['side']; row: string }[] = [
  { key: 'OFF', row: 'OFFENSIVE TARGETS' },
  { key: 'DEF', row: 'DEFENSIVE TARGETS' },
  { key: 'ST', row: 'SPECIAL TEAMS' }
];

/** Seats math: how the floor's seats split for one position. */
function seats(n: TeamNeed) {
  const returning = n.projected - n.committed;
  return {
    returning: Math.min(returning, n.floor),
    committed: Math.min(n.committed, Math.max(0, n.floor - returning)),
    open: n.needed,
    surplus: Math.max(0, n.projected - n.floor)
  };
}

function Pips({ n }: { n: TeamNeed }) {
  const s = seats(n);
  return (
    <span className="nd-pips" aria-hidden="true">
      {Array.from({ length: s.returning }, (_, i) => (
        <span key={`r${i}`} className="nd-pip ret" />
      ))}
      {Array.from({ length: s.committed }, (_, i) => (
        <span key={`c${i}`} className="nd-pip commit" />
      ))}
      {Array.from({ length: s.open }, (_, i) => (
        <span key={`o${i}`} className="nd-pip open" />
      ))}
      {s.surplus > 0 && <span className="nd-extra">+{s.surplus}</span>}
    </span>
  );
}

export default function TeamNeedsStrip({ needs }: { needs: TeamNeed[] }) {
  if (!needs.length) return null;
  return (
    <div className="needs-strip">
      <div className="needs-head">
        <span className="needs-kicker">
          TEAM NEEDS
          <InfoDot title="Team Needs">
            <p>
              Every position shows the game's own minimum roster composition as seats.
              Filled seats return next season, gold seats are recruits committed to you,
              dashed red seats are open — nobody on the projected roster fills them. +n
              is depth beyond the minimum.
            </p>
            <InfoRow term="Departing">
              Seniors and draft entries, counted out of the projection now.
            </InfoRow>
            <InfoRow term="Targeted">Board targets still being chased at the position.</InfoRow>
            <InfoRow term="Committed">Recruits already locked in to your class.</InfoRow>
            <p>
              One honesty note: departures leave the projection here immediately — the
              game itself carries them on the roster until week 4 of the offseason.
            </p>
          </InfoDot>
        </span>
        <span className="needs-legend">
          <span className="nd-pip ret" /> returning
          <span className="nd-pip commit" /> committed
          <span className="nd-pip open" /> open seat
        </span>
      </div>
      {SIDES.map(({ key, row }) => (
        <div key={key} className="needs-row">
          <span className="needs-row-label">{row}</span>
          <div className="needs-cells">
            {needs
              .filter((n) => n.side === key)
              .map((n) => (
                <div key={n.group} className={`nd-cell ${n.needed > 0 ? 'short' : ''}`}>
                  <div className="nd-cell-top">
                    <span className="nd-pos">{n.group}</span>
                    <Pips n={n} />
                    <span className={`nd-open ${n.needed > 0 ? '' : 'set'}`}>
                      {n.needed > 0 ? `${n.needed} OPEN` : 'SET'}
                    </span>
                  </div>
                  <div className="nd-foot">
                    {n.departing} departing · {n.targeted} targeted
                    {n.committed > 0 && <span className="nd-in"> · +{n.committed} committed</span>}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
