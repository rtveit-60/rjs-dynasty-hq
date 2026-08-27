import type { Snapshot } from '../../../shared/types.ts';

type School = NonNullable<Snapshot['school']>;

export default function ProgramDashboard({ school }: { school: School }) {
  const rc = school.recruiting;
  if (!rc) {
    return <div className="empty">Reading your dynasty save…</div>;
  }

  return (
    <div className="two-col" style={{ marginTop: 16 }}>
      <div className="panel">
        <div className="panel-title">Your Pipelines</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {rc.pipelines.map((p) => (
            <span key={p.pipeline} className="chip" title={`Influence ${p.value}`}>
              <b>{p.label}</b>&nbsp;
              <span style={{ color: p.tier >= 4 ? 'var(--dev-elite)' : 'var(--ink-3)' }}>{p.level}</span>
            </span>
          ))}
          {!rc.pipelines.length && <span style={{ color: 'var(--ink-3)' }}>No established pipelines.</span>}
        </div>
      </div>
      <div className="panel">
        <div className="panel-title">Program Grades</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {rc.reportCard.map((g) => (
            <span key={g.label} className="chip">
              {g.label}&nbsp;<span className={`grade ${g.grade.startsWith('A') ? 'good' : ''}`}>{g.grade}</span>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {rc.proPotential.map((g) => (
            <span key={g.label} className="chip" title={`Pro potential — ${g.label}`}>
              <span className="k">{g.label}</span>&nbsp;
              <span className={`grade ${g.grade.startsWith('A') ? 'good' : ''}`}>{g.grade}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
