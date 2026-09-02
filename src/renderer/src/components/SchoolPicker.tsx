import { useMemo, useState } from 'react';
import type { TeamInfo } from '../../../shared/types.ts';
import { useHQ } from '../store.ts';
import TeamLogo from './TeamLogo.tsx';

function SchoolRow({ team, onPick }: { team: TeamInfo; onPick: (row: number) => void }) {
  return (
    <button className="school-row" onClick={() => onPick(team.row)}>
      <TeamLogo
        row={team.row}
        size={22}
        fallback={<span className="swatch" style={{ background: team.colors.primary }} />}
      />
      <span>
        <div className="nm">{team.longName}</div>
        <div className="nick">
          {team.nickName}
          {team.headCoach ? ` · HC ${team.headCoach}` : ''}
        </div>
      </span>
    </button>
  );
}

export default function SchoolPicker() {
  const snapshot = useHQ((s) => s.snapshot);
  const status = useHQ((s) => s.status);
  const setSchool = useHQ((s) => s.setSchool);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const all = snapshot?.teams ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (t) =>
        t.longName.toLowerCase().includes(needle) ||
        t.nickName.toLowerCase().includes(needle) ||
        (t.headCoach ?? '').toLowerCase().includes(needle)
    );
  }, [snapshot, q]);

  const mine = filtered.filter((t) => t.isUserTeam);
  const rest = filtered.filter((t) => !t.isUserTeam);
  const pick = (row: number) => void setSchool(row);

  return (
    <div className="hero">
      <div className="hero-card" style={{ width: 760 }}>
        <div className="hero-mark" style={{ fontSize: 34 }}>
          Whose program is this?
        </div>
        <p className="hero-tag">
          {snapshot
            ? 'Pick your school. Search by school, mascot, or coach name.'
            : status.kind === 'error'
              ? 'Could not read the save.'
              : 'Reading your dynasty save…'}
        </p>
        {snapshot && (
          <>
            <div style={{ marginTop: 20 }}>
              <input
                className="search"
                placeholder="Search schools or coaches…"
                aria-label="Search schools or coaches"
                value={q}
                autoFocus
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            {mine.length > 0 && (
              <>
                <div className="section-h">
                  <h3>Your Program</h3>
                  <div className="rule" />
                </div>
                <div className="school-grid" style={{ maxHeight: 'none', overflow: 'visible' }}>
                  {mine.map((t) => (
                    <SchoolRow key={t.row} team={t} onPick={pick} />
                  ))}
                </div>
              </>
            )}

            {rest.length > 0 && (
              <>
                {mine.length > 0 && (
                  <div className="section-h">
                    <h3>All Schools</h3>
                    <div className="rule" />
                  </div>
                )}
                <div className="school-grid" style={mine.length ? { marginTop: 0 } : undefined}>
                  {rest.map((t) => (
                    <SchoolRow key={t.row} team={t} onPick={pick} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
