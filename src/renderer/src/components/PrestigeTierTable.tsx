import { PRESTIGE_TIER_SPECS, type PrestigeTierSpec } from '../../../shared/prestige.ts';

const pct = (v: number) => `${(v * 100).toFixed(v * 100 < 1 ? 1 : v * 100 % 1 ? 1 : 0)}%`;
const cell: React.CSSProperties = { padding: '4px 8px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
const head: React.CSSProperties = { ...cell, textAlign: 'left', fontSize: 10.5, letterSpacing: '.08em', color: 'var(--ink-3)' };

/**
 * The prestige tiers' actual numbers, read from the same constants the rules
 * use so the dialog can never drift from what is charged. Each charge is the
 * larger of the flat leg and the percentage-of-score leg.
 */
export default function PrestigeTierTable() {
  const tiers = Object.values(PRESTIGE_TIER_SPECS);
  const rows: { label: string; value: (t: PrestigeTierSpec) => string }[] = [
    { label: 'Even-odds loss (head coach)', value: (t) => `${t.lossBase} pts or ${pct(t.lossPct)} of score, × weight` },
    { label: 'Coordinator share', value: (t) => pct(t.coordShare) },
    { label: 'Skid compounds from', value: (t) => `${t.streakStart} straight losses` },
    { label: 'Per further loss', value: (t) => `× ${t.streakRate}` },
    { label: 'Season ends on hot seat', value: (t) => `${t.hotSeatFlat} pts or ${pct(t.hotSeatPct)}` },
    { label: 'Season ends on low security', value: (t) => (t.lowFlat || t.lowPct ? `${t.lowFlat} pts or ${pct(t.lowPct)}` : 'no charge') },
    { label: 'Fired', value: (t) => `${t.firedFlat} pts or ${pct(t.firedPct)}` }
  ];
  return (
    <div style={{ overflowX: 'auto', margin: '8px 0' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
        <thead>
          <tr>
            <th style={head} />
            {tiers.map((t) => (
              <th key={t.key} style={head}>
                {t.label.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} style={{ borderTop: '1px solid var(--line-soft)' }}>
              <td style={{ ...cell, color: 'var(--ink-2)', whiteSpace: 'normal' }}>{r.label}</td>
              {tiers.map((t) => (
                <td key={t.key} style={cell}>
                  {r.value(t)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The loss weight, spelled out with its actual multipliers. */
export function PrestigeWeightNotes() {
  return (
    <ul style={{ margin: '4px 0 8px', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.45 }}>
      <li>
        <b>Weight</b> = 0.5 + 1.5 × upset, where upset (0–2) adds the rank gap (a #1 losing to an unranked team
        counts 1.0; both unranked, 0) and the pre-game record gap (win% difference when the loser was the
        better team, damped until each side has played 3 games). An even game weighs 0.5, the worst upset 3.5.
      </li>
      <li>
        Then <b>stakes</b>: postseason × 1.5, rivalry game × 1.3, lost at home × 1.15.
      </li>
      <li>
        Then <b>margin</b>: lost by 21 or more × 1.25; lost by 3 or fewer, or in overtime, × 0.85.
      </li>
      <li>
        <b>Skid</b>: once the streak reaches the tier’s threshold the whole loss charge is multiplied by the
        tier’s rate once per game at or past it (Balanced: 3rd straight loss × 1.5, 4th × 2.25, 5th × 3.38).
      </li>
    </ul>
  );
}
