import { useState } from 'react';
import type { Snapshot } from '../../../shared/types.ts';
import { fmt, stars } from '../lib/format.ts';
import InfoDot from './InfoDot.tsx';
import { NameLink } from './ProfileModal.tsx';
import ResourceModal from './ResourceModal.tsx';

type School = NonNullable<Snapshot['school']>;

function GradeBadge({ grade }: { grade: string | null }) {
  if (!grade) return null;
  return <span className={`grade ${grade.startsWith('A') ? 'good' : ''}`}>{grade}</span>;
}

export default function BudgetView({ school, browsing = false }: { school: School; browsing?: boolean }) {
  const [fundraising, setFundraising] = useState(false);
  const b = school.budget;
  if (!b) return <div className="empty">No budget data found in this save.</div>;
  const spent = b.spending.reduce((sum, s) => sum + s.points, 0);
  const maxPillar = Math.max(...b.pillars.map((p) => p.points), 1);
  const maxSpend = Math.max(...b.spending.map((s) => s.points), 1);
  const nilTargets = (school.board?.targets ?? []).filter((t) => t.nilOffer > 0);
  const nilCommitted = nilTargets.reduce((sum, t) => sum + t.nilOffer, 0);

  return (
    <>
      {!browsing && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" className="btn" onClick={() => setFundraising(true)}>
            FUNDRAISING
          </button>
        </div>
      )}
      {fundraising && !browsing && <ResourceModal kind="nil" onClose={() => setFundraising(false)} />}
      <div className="statgrid" style={{ marginTop: 10 }}>
        <div className="stat">
          <div className="lbl">
            Program Budget <GradeBadge grade={b.overallGrade} />
          </div>
          <div className="num">{fmt(b.total)}</div>
          <div className="sub">dynasty points this season</div>
        </div>
        <div className="stat">
          <div className="lbl">Spent</div>
          <div className="num">{fmt(spent)}</div>
          <div className="sub">{Math.round((spent / Math.max(b.total, 1)) * 100)}% of budget</div>
        </div>
        <div className="stat">
          <div className="lbl">Remaining</div>
          <div className="num">{fmt(b.remaining)}</div>
          <div className="sub">unallocated</div>
        </div>
        <div className="stat">
          <div className="lbl">Rollover</div>
          <div className="num">{fmt(b.rollover)}</div>
          <div className="sub">carried from last season</div>
        </div>
      </div>

      <div className="two-col" style={{ marginTop: 12 }}>
        <div className="panel">
          <div className="panel-title">Where it comes from</div>
          {b.pillars.map((p) => (
            <div key={p.label} className="bar-row">
              <span>{p.label}</span>
              <span className="track">
                <span className="fill" style={{ width: `${(p.points / maxPillar) * 100}%` }} />
              </span>
              <GradeBadge grade={p.grade} />
              <span className="pts">{fmt(p.points)}</span>
            </div>
          ))}
        </div>
        <div className="panel">
          <div className="panel-title">
            Where it goes
            <InfoDot title="Spending">
              <p>
                Each line's percentage is its share of your total budget. <b>lg avg</b> is what the
                other 137 programs put on the same line, as a benchmark.
              </p>
              <p>
                Weekly staff points are each coach's recruiting-hours allowance, refreshed every
                week.
              </p>
            </InfoDot>
          </div>
          {b.spending.map((s) => {
            const pct = Math.round((s.points / Math.max(b.total, 1)) * 100);
            return (
              <div key={s.label} className="bar-row">
                <span>{s.label}</span>
                <span className="track">
                  <span className="fill" style={{ width: `${(s.points / maxSpend) * 100}%` }} />
                </span>
                <span className="pct-pair">
                  <b>{pct}%</b>
                  {s.leaguePct !== null && <span className="lg">lg avg {s.leaguePct}%</span>}
                </span>
                <span className="pts">{fmt(s.points)}</span>
              </div>
            );
          })}
          <div className="section-h" style={{ margin: '14px 0 6px' }}>
            <h3>Weekly staff points</h3>
            <div className="rule" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="chip">
              <span className="k">HC</span> <b>{fmt(b.staffWeekly.hc)}</b>
            </span>
            <span className="chip">
              <span className="k">OC</span> <b>{fmt(b.staffWeekly.oc)}</b>
            </span>
            <span className="chip">
              <span className="k">DC</span> <b>{fmt(b.staffWeekly.dc)}</b>
            </span>
          </div>
        </div>
      </div>

      {nilTargets.length > 0 && (
        <>
          <div className="section-h">
            <h3>NIL commitments on the board</h3>
            <div className="rule" />
            <span className="count">{fmt(nilCommitted)} points committed</span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Recruit</th>
                  <th>Rating</th>
                  <th className="num">Offer</th>
                  <th className="num">Expects</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[...nilTargets]
                  .sort((a, b2) => b2.nilOffer - a.nilOffer)
                  .map((t) => (
                    <tr key={`${t.name}-${t.nationalRank}`}>
                      <td className="pname">
                        <NameLink req={{ kind: 'player', row: t.playerRow }}>{t.name}</NameLink>
                      </td>
                      <td>
                        <span className="stars-cell" title={`${t.stars} stars`}>
                          {stars(t.stars).slice(0, t.stars)}
                          <span className="off">{stars(t.stars).slice(t.stars)}</span>
                        </span>
                      </td>
                      <td className="num">{t.nilOffer}</td>
                      <td className="num">{t.nilExpectation}</td>
                      <td>
                        {t.nilOffer >= t.nilExpectation ? (
                          <span className="commit">Meets expectation</span>
                        ) : (
                          <span style={{ color: 'var(--warn)' }}>Short by {t.nilExpectation - t.nilOffer}</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
