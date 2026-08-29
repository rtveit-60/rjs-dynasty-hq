import { useState } from 'react';
import type { StaffTendency } from '../../../shared/types.ts';
import { schemeLabel } from '../lib/format.ts';
import { useHQ } from '../store.ts';
import BudgetView from './BudgetView.tsx';
import DepthChartView from './DepthChartView.tsx';
import { NameLink } from './ProfileModal.tsx';
import TeamLogo from './TeamLogo.tsx';
import PlaybookView from './PlaybookView.tsx';
import ProgramDashboard from './ProgramDashboard.tsx';
import RosterTable from './RosterTable.tsx';
import TargetsView from './TargetsView.tsx';
import TeamHistoryView from './TeamHistoryView.tsx';
import TendenciesView from './TendenciesView.tsx';

type Tab = 'program' | 'roster' | 'depth' | 'targets' | 'budget' | 'tendencies' | 'playbook' | 'history';

const TABS: { key: Tab; label: string }[] = [
  { key: 'program', label: 'PROGRAM DASHBOARD' },
  { key: 'roster', label: 'ROSTER' },
  { key: 'depth', label: 'DEPTH CHART' },
  { key: 'targets', label: 'RECRUITING OFFICE' },
  { key: 'budget', label: 'NIL & BUDGET' },
  { key: 'tendencies', label: 'TENDENCIES' },
  { key: 'playbook', label: 'PLAYBOOK' },
  { key: 'history', label: 'TEAM HISTORY' }
];

export default function TeamHQ() {
  const snapshot = useHQ((s) => s.snapshot);
  const [tab, setTab] = useState<Tab>('program');
  const school = snapshot?.school;

  if (!school) {
    return (
      <div className="page">
        <div className="empty">Reading your dynasty save…</div>
      </div>
    );
  }

  const { team, roster, staff } = school;
  const hc = staff.find((s) => s.role === 'HC');
  const oc = staff.find((s) => s.role === 'OC');
  const dc = staff.find((s) => s.role === 'DC');
  const offLine = { k: 'OFF', scheme: schemeLabel(team.offScheme), playbook: schemeLabel(team.offPlaybook) };
  const defLine = { k: 'DEF', scheme: schemeLabel(team.defScheme), playbook: schemeLabel(team.defPlaybook) };

  return (
    <div className="page">
      <div className="hq-head">
        <TeamLogo row={team.row} size={72} fallback={null} />
        <div>
          <h1 className="page-title">
            <NameLink req={{ kind: 'school', row: team.row }}>
              {team.longName} <span className="nick">{team.nickName}</span>
            </NameLink>
          </h1>
          <div className="hq-meta">
            {team.city && (
              <span>
                {team.city}, {team.state}
              </span>
            )}
            {team.founded && <span>Est. {team.founded}</span>}
            <span>Roster {roster.length}</span>
          </div>
        </div>
      </div>

      <div className="accent-bar">
        <span className="half" style={{ background: team.colors.primary }} />
        <span className="half" style={{ background: team.colors.secondary ?? team.colors.primary }} />
        <span className="divider" />
      </div>

      <div className="staff-grid">
        {hc && <StaffHeadCard role="Head Coach" staff={hc} lines={[offLine, defLine]} />}
        {oc && <StaffHeadCard role="Offensive Coordinator" staff={oc} lines={[offLine]} />}
        {dc && <StaffHeadCard role="Defensive Coordinator" staff={dc} lines={[defLine]} />}
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'program' && <ProgramDashboard school={school} season={snapshot?.season ?? null} />}
      {tab === 'roster' && (
        <RosterTable roster={roster} proPotential={school.recruiting?.proPotential ?? []} />
      )}
      {tab === 'depth' && <DepthChartView school={school} />}
      {tab === 'targets' && <TargetsView school={school} />}
      {tab === 'budget' && <BudgetView school={school} />}
      {tab === 'tendencies' && <TendenciesView school={school} />}
      {tab === 'playbook' && <PlaybookView school={school} />}
      {tab === 'history' && <TeamHistoryView school={school} />}
    </div>
  );
}

function StaffHeadCard({
  role,
  staff,
  lines
}: {
  role: string;
  staff: StaffTendency;
  lines: { k: string; scheme: string; playbook: string }[];
}) {
  const hasRecord = staff.careerWins !== null && staff.careerLosses !== null;
  return (
    <div className="staff-card">
      <div className="staff-role">{role}</div>
      <div className="staff-topline">
        <span className="staff-name">
          <NameLink req={{ kind: 'coach', row: staff.coachRow }}>{staff.name}</NameLink>
        </span>
        {hasRecord && (
          <span className="staff-rec" title="Career record">
            {staff.careerWins}–{staff.careerLosses}
          </span>
        )}
      </div>
      {lines.map((line) => (
        <div key={line.k} className="staff-line">
          <span className="k">{line.k}</span>
          <b>{line.scheme}</b>
          <span className="book">· {line.playbook} playbook</span>
        </div>
      ))}
    </div>
  );
}
