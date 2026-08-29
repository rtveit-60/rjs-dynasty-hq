import type { CoachContract } from '../../../shared/types.ts';

/**
 * The save stores the AD's mandate as an enum ladder with no prose, so the
 * wording here is ours. Anything unmapped falls back to a spaced-out enum
 * rather than showing raw CamelCase.
 */
const EXPECTATION: Record<string, string> = {
  Win4Games: 'Win 4 games',
  Win5Games: 'Win 5 games',
  Win6Games: 'Win 6 games',
  Win7Games: 'Win 7 games',
  Win8Games: 'Win 8 games',
  Win9Games: 'Win 9 games',
  WinConfChamp: 'Win the conference',
  WinNY6Bowl: "Win a New Year's Six bowl"
};

/** Ladder order, for judging whether this season's progress clears the bar. */
const RUNG = [
  'Win4Games',
  'Win5Games',
  'Win6Games',
  'Win7Games',
  'Win8Games',
  'Win9Games',
  'WinConfChamp',
  'WinNY6Bowl'
];

const SECURITY: Record<string, { label: string; color: string }> = {
  Safe: { label: 'Safe', color: 'var(--good)' },
  SafeForNow: { label: 'Safe for now', color: 'var(--ink-2)' },
  Low: { label: 'Low', color: 'var(--dev-elite)' },
  HotSeat: { label: 'Hot seat', color: 'var(--bad)' }
};

const spaced = (s: string) => s.replace(/([a-z])([A-Z0-9])/g, '$1 $2');
const label = (e: string) => (e ? (EXPECTATION[e] ?? spaced(e)) : '');

export default function ContractPanel({ contract }: { contract: CoachContract }) {
  const goal = label(contract.expectation);
  const progress = label(contract.progress);
  const sec = SECURITY[contract.securityStatus] ?? {
    label: contract.securityStatus || 'Unknown',
    color: 'var(--ink-2)'
  };
  const goalRung = RUNG.indexOf(contract.expectation);
  const gotRung = RUNG.indexOf(contract.progress);
  const met = goalRung >= 0 && gotRung >= goalRung;
  const active = contract.seasonGoals.filter((g) => g.status === 'InProgress');
  const done = contract.seasonGoals.filter((g) => /complete|achiev|met|success/i.test(g.status));

  return (
    <div className="panel">
      <div className="panel-title">Athletic Director</div>

      <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
        Mandate for {contract.coachName}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 30,
          lineHeight: 1.05,
          textTransform: 'uppercase',
          margin: '4px 0 10px'
        }}
      >
        {goal || 'No mandate set'}
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 12 }}>
        {progress ? (
          <>
            Banked so far:{' '}
            <b style={{ color: met ? 'var(--good)' : 'var(--ink)' }}>{progress}</b>
            {met && <span style={{ color: 'var(--good)', fontWeight: 700 }}> · met</span>}
          </>
        ) : (
          <span style={{ color: 'var(--ink-3)' }}>Nothing banked yet this season.</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
          Job security
        </span>
        <b style={{ color: sec.color, fontSize: 13 }}>{sec.label}</b>
        <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>
          {contract.securityPct}%{contract.securityRank > 0 && ` · ${ordinal(contract.securityRank)} nationally`}
        </span>
        {contract.contractLength > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            Current contract{' '}
            <b style={{ color: 'var(--ink)', fontSize: 12, letterSpacing: 0 }}>
              Year{' '}
              {Math.min(
                Math.max(contract.contractLength - contract.yearsRemaining + 1, 1),
                contract.contractLength
              )}{' '}
              of {contract.contractLength}
            </b>
          </span>
        )}
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: 'var(--line-soft)',
          overflow: 'hidden',
          marginBottom: 12
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, contract.securityPct))}%`,
            height: '100%',
            background: sec.color
          }}
        />
      </div>

      {contract.seasonGoals.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
              Season goals
            </span>
            {active.length > 0 && (
              <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>
                {active.length} active{done.length > 0 && `, ${done.length} done`}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.7, marginBottom: 12 }}>
            {contract.seasonGoals.map((g) => {
              const st = /complete|achiev|met|success/i.test(g.status)
                ? { text: 'done', color: 'var(--good)' }
                : g.status === 'InProgress'
                  ? { text: 'in progress', color: 'var(--ink-3)' }
                  : { text: spaced(g.status).toLowerCase(), color: 'var(--ink-3)' };
              return (
                <div key={g.slot}>
                  <span style={{ color: 'var(--ink-3)' }}>{g.slot}.</span>{' '}
                  {g.label ? (
                    <span>{g.label}</span>
                  ) : (
                    <span style={{ color: 'var(--ink-3)', fontStyle: 'italic' }} title={`goal id ${g.id}`}>
                      goal text unavailable
                    </span>
                  )}{' '}
                  <span style={{ color: st.color, fontSize: 11.5 }}>· {st.text}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

    </div>
  );
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
