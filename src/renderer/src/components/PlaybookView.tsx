import type { Snapshot } from '../../../shared/types.ts';
import { prestigeLabel, schemeLabel } from '../lib/format.ts';

type School = NonNullable<Snapshot['school']>;

export default function PlaybookView({ school }: { school: School }) {
  const { team, staff } = school;
  const oc = staff.find((s) => s.role === 'OC');
  const dc = staff.find((s) => s.role === 'DC');
  const hc = staff.find((s) => s.role === 'HC');

  const sides = [
    {
      key: 'OFFENSE',
      scheme: schemeLabel(team.offScheme),
      raw: team.offScheme,
      caller: oc ?? hc,
      callerRole: oc ? 'Offensive Coordinator' : 'Head Coach'
    },
    {
      key: 'DEFENSE',
      scheme: schemeLabel(team.defScheme),
      raw: team.defScheme,
      caller: dc ?? hc,
      callerRole: dc ? 'Defensive Coordinator' : 'Head Coach'
    }
  ];

  return (
    <>
      <div className="two-col" style={{ marginTop: 16 }}>
        {sides.map((side) => (
          <div key={side.key} className="panel">
            <div className="panel-title">{side.key}</div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 34,
                lineHeight: 1,
                textTransform: 'uppercase',
                margin: '6px 0 2px'
              }}
            >
              {side.scheme}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{side.raw}</div>
            {side.caller && (
              <p style={{ marginTop: 14, fontSize: 12.5, color: 'var(--ink-2)' }}>
                Run by <b style={{ color: 'var(--ink)' }}>{side.caller.name}</b> ({side.callerRole},{' '}
                {prestigeLabel(side.caller.prestige)} prestige)
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="foot-note">
        Scheme selections are read live from the save. Playbook art and play lists live in the game's
        asset files rather than the dynasty save, so this view sticks to what's authoritative.
      </p>
    </>
  );
}
