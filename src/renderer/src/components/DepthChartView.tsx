import { useMemo } from 'react';
import type { Snapshot } from '../../../shared/types.ts';
import { DEPTH_LABELS, DEPTH_SECTIONS, ovrTier } from '../lib/format.ts';

type School = NonNullable<Snapshot['school']>;

export default function DepthChartView({ school }: { school: School }) {
  const byRow = useMemo(() => new Map(school.roster.map((p) => [p.row, p])), [school.roster]);
  const slots = useMemo(() => new Map(school.depthChart.map((s) => [s.position, s])), [school.depthChart]);

  if (!school.depthChart.length) {
    return <div className="empty">No depth chart found in this save.</div>;
  }

  const known = new Set(DEPTH_SECTIONS.flatMap((s) => s.positions));
  const extras = school.depthChart.filter((s) => !known.has(s.position)).map((s) => s.position);
  const sections = extras.length
    ? [...DEPTH_SECTIONS, { title: 'Other', positions: extras }]
    : DEPTH_SECTIONS;

  return (
    <>
      {sections.map((section) => {
        const present = section.positions.filter((p) => slots.has(p));
        if (!present.length) return null;
        return (
          <div key={section.title}>
            <div className="section-h">
              <h3>{section.title}</h3>
              <div className="rule" />
            </div>
            <div className="dc-grid">
              {present.map((pos) => {
                const slot = slots.get(pos)!;
                return (
                  <div key={pos} className="dc-card">
                    <div className="dc-pos">
                      <b>{pos}</b>
                      <span>{DEPTH_LABELS[pos] ?? ''}</span>
                    </div>
                    {slot.playerRows.slice(0, 4).map((row, i) => {
                      const p = byRow.get(row);
                      if (!p) return null;
                      return (
                        <div key={`${row}-${i}`} className={`dc-row ${i === 0 ? 'starter' : ''}`}>
                          <span className="dc-depth">{i + 1}</span>
                          <span className="nm">
                            {p.firstName} {p.lastName}
                          </span>
                          <span className={ovrTier(p.overall)}>{p.overall}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}
