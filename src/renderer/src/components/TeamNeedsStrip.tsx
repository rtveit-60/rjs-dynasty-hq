import type { TeamNeed } from '../../../shared/types.ts';
import InfoDot, { InfoRow } from './InfoDot.tsx';

/**
 * The game's own needs strip: OFFENSIVE / DEFENSIVE / SPECIAL TEAMS TARGETS,
 * one `targeted/needed` cell per position, red while a need is unfilled —
 * except our `needed` is honest about departures, which the game ignores
 * until week 4 of the offseason. Shared by the Recruiting Office and the
 * Recruiting board (high school and portal alike).
 */
function NeedCell({ n }: { n: TeamNeed }) {
  const hot = n.needed > n.targeted;
  return (
    <span
      className={`need-cell ${hot ? 'hot' : ''}`}
      title={
        `${n.group}: ${n.now} on the roster` +
        (n.departing > 0 ? `, ${n.departing} leaving (seniors/drafted)` : '') +
        (n.committed > 0 ? `, ${n.committed} committed` : '') +
        ` → ${n.projected} next season. ` +
        (n.needed > 0
          ? `${n.needed} short of the game's minimum roster; ${n.targeted} still being chased.`
          : `At the game's minimum roster; ${n.targeted} still being chased.`)
      }
    >
      <b>
        {n.targeted}/{n.needed}
      </b>{' '}
      <span className="pos">{n.group}</span>
      {n.committed > 0 && <span className="plus">+{n.committed}</span>}
    </span>
  );
}

export default function TeamNeedsStrip({ needs }: { needs: TeamNeed[] }) {
  if (!needs.length) return null;
  const off = needs.filter((n) => n.side === 'OFF');
  const def = needs.filter((n) => n.side === 'DEF');
  const st = needs.filter((n) => n.side === 'ST');
  return (
    <div className="needs-strip">
      <div className="needs-row">
        <span className="needs-row-label">
          OFFENSIVE TARGETS
          <InfoDot title="Team Needs">
            <p>
              The game's own targets panel, copied: <b>targeted/needed</b> at every position, red
              while a need is unfilled.
            </p>
            <InfoRow term="Targeted">Board targets still being chased at the position.</InfoRow>
            <InfoRow term="Needed">
              How far next season's projected roster sits under the game's 57-man minimum
              composition.
            </InfoRow>
            <InfoRow term="+n">Commits already inbound at the position.</InfoRow>
            <p>
              One difference: seniors and draft entries leave the projection here immediately. The
              game itself carries them until week 4 of the offseason.
            </p>
          </InfoDot>
        </span>
        <div className="needs-cells">
          {off.map((n) => (
            <NeedCell key={n.group} n={n} />
          ))}
        </div>
      </div>
      <div className="needs-row">
        <span className="needs-row-label">DEFENSIVE TARGETS</span>
        <div className="needs-cells">
          {def.map((n) => (
            <NeedCell key={n.group} n={n} />
          ))}
        </div>
        <span className="needs-row-label st">SPECIAL TEAMS</span>
        <div className="needs-cells">
          {st.map((n) => (
            <NeedCell key={n.group} n={n} />
          ))}
        </div>
      </div>
    </div>
  );
}
