import type { NeedsView, TeamNeed } from '../../../shared/types.ts';
import { useHQ } from '../store.ts';
import InfoDot, { InfoRow } from './InfoDot.tsx';

/**
 * Team Needs as seats: the game's own 57-man minimum composition rendered as
 * literal seats per position — filled (returning next season), gold (committed
 * recruit), dashed red (open, nobody fills it). Three presentations share the
 * data, switchable in the strip head and remembered in settings:
 *   tiles — the classic strip layout, one seat tile per position;
 *   bar   — a lower-third bar per side, positions flowing inline;
 *   focus — only shortfall positions speak, healthy ones collapse to chips.
 * Departures (seniors + draft entries) leave the projection immediately; the
 * game itself carries them until week 4 of the offseason.
 */

const VIEWS: { key: NeedsView; label: string }[] = [
  { key: 'tiles', label: 'Tiles' },
  { key: 'bar', label: 'Lower Third' },
  { key: 'focus', label: 'Needs First' }
];

const SIDES: { key: TeamNeed['side']; row: string; cap: string }[] = [
  { key: 'OFF', row: 'OFFENSIVE TARGETS', cap: 'OFFENSE' },
  { key: 'DEF', row: 'DEFENSIVE TARGETS', cap: 'DEFENSE' },
  { key: 'ST', row: 'SPECIAL TEAMS', cap: 'SPECIAL TEAMS' }
];

/** Seats math shared by all three views. */
function seats(n: TeamNeed) {
  const returning = n.projected - n.committed;
  return {
    returning: Math.min(returning, n.floor),
    committed: Math.min(n.committed, Math.max(0, n.floor - returning)),
    open: n.needed,
    surplus: Math.max(0, n.projected - n.floor)
  };
}

function Pips({ n, small }: { n: TeamNeed; small?: boolean }) {
  const s = seats(n);
  return (
    <span className={`nd-pips ${small ? 'sm' : ''}`} aria-hidden="true">
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

function NeedsInfo() {
  return (
    <InfoDot title="Team Needs">
      <p>
        Every position shows the game's own minimum roster composition as seats. Filled
        seats return next season, gold seats are recruits committed to you, dashed red
        seats are open — nobody on the projected roster fills them. +n is depth beyond
        the minimum.
      </p>
      <InfoRow term="Out">Seniors and draft entries, counted out of the projection now.</InfoRow>
      <InfoRow term="Board">Targets still being chased at the position.</InfoRow>
      <InfoRow term="Views">
        Tiles keeps every position as a card; Lower Third packs each side into one slim
        bar; Needs First shows only shortfall positions in full and collapses the rest.
      </InfoRow>
      <p>
        One honesty note: departures leave the projection here immediately — the game
        itself carries them on the roster until week 4 of the offseason.
      </p>
    </InfoDot>
  );
}

function TilesView({ needs }: { needs: TeamNeed[] }) {
  return (
    <>
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
                    <span className={`nd-open ${n.needed > 0 ? '' : 'set'}`}>
                      {n.needed > 0 ? `${n.needed} OPEN` : 'SET'}
                    </span>
                  </div>
                  <Pips n={n} />
                  <div className="nd-foot">
                    {n.departing > 0 ? `${n.departing} out` : 'none out'} · {n.targeted} board
                    {n.committed > 0 && <span className="nd-in"> · +{n.committed} in</span>}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </>
  );
}

function BarView({ needs }: { needs: TeamNeed[] }) {
  return (
    <>
      {SIDES.map(({ key, cap }) => (
        <div key={key} className="nd-bar">
          <span className="nd-bar-cap">{cap}</span>
          <div className="nd-bar-flow">
            {needs
              .filter((n) => n.side === key)
              .map((n, i) => (
                <span key={n.group} className="nd-bar-group">
                  {i > 0 && <span className="nd-bar-sep" />}
                  <span className={`nd-bar-item ${n.needed > 0 ? 'short' : ''}`}>
                    <span className="nd-bar-pos">{n.group}</span>
                    <Pips n={n} small />
                    {n.needed > 0 && <span className="nd-bar-n">{n.needed}</span>}
                  </span>
                </span>
              ))}
          </div>
        </div>
      ))}
    </>
  );
}

function FocusView({ needs }: { needs: TeamNeed[] }) {
  return (
    <>
      {SIDES.map(({ key, row }) => {
        const rows = needs.filter((n) => n.side === key);
        const shortRows = rows.filter((n) => n.needed > 0);
        const setRows = rows.filter((n) => n.needed === 0);
        return (
          <div key={key} className="needs-row">
            <span className="needs-row-label">{row}</span>
            <div className="needs-cells">
              {shortRows.map((n) => (
                <div key={n.group} className="nd-plate">
                  <span className="nd-plate-n">{n.needed}</span>
                  <span className="nd-plate-meta">
                    <span className="nd-pos">{n.group}</span>
                    <Pips n={n} />
                    <span className="nd-plate-sub">
                      {n.targeted > 0 ? `${n.targeted} on board` : 'none on board'}
                      {n.committed > 0 && <span className="nd-in"> · +{n.committed} in</span>}
                    </span>
                  </span>
                </div>
              ))}
              {shortRows.length === 0 && <span className="nd-allset">No open seats</span>}
              {setRows.length > 0 && (
                <div className="nd-quiet">
                  {setRows.map((n) => (
                    <span key={n.group} className="nd-chip">
                      <span className="nd-chip-pos">{n.group}</span>
                      <Pips n={n} small />
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

export default function TeamNeedsStrip({ needs }: { needs: TeamNeed[] }) {
  const view = useHQ((s) => s.settings?.needsView ?? 'tiles');
  const setNeedsView = useHQ((s) => s.setNeedsView);
  if (!needs.length) return null;
  return (
    <div className="needs-strip">
      <div className="needs-head">
        <span className="needs-kicker">
          TEAM NEEDS
          <NeedsInfo />
        </span>
        <span className="needs-legend">
          <span className="nd-pip ret" /> returning
          <span className="nd-pip commit" /> committed
          <span className="nd-pip open" /> open seat
        </span>
        <span className="needs-mode">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              className={`filter ${view === v.key ? 'active' : ''}`}
              onClick={() => void setNeedsView(v.key)}
            >
              {v.label}
            </button>
          ))}
        </span>
      </div>
      {view === 'tiles' && <TilesView needs={needs} />}
      {view === 'bar' && <BarView needs={needs} />}
      {view === 'focus' && <FocusView needs={needs} />}
    </div>
  );
}
