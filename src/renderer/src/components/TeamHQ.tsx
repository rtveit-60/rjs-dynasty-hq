import { useState } from 'react';
import { schemeLabel } from '../lib/format.ts';
import { useHQ } from '../store.ts';
import BudgetView from './BudgetView.tsx';
import DepthChartView from './DepthChartView.tsx';
import TeamLogo from './TeamLogo.tsx';
import PlaybookView from './PlaybookView.tsx';
import RosterTable from './RosterTable.tsx';
import TargetsView from './TargetsView.tsx';
import TendenciesView from './TendenciesView.tsx';

type Tab = 'roster' | 'depth' | 'targets' | 'budget' | 'tendencies' | 'playbook';

const TABS: { key: Tab; label: string }[] = [
  { key: 'roster', label: 'ROSTER' },
  { key: 'depth', label: 'DEPTH CHART' },
  { key: 'targets', label: 'TARGETS' },
  { key: 'budget', label: 'NIL & BUDGET' },
  { key: 'tendencies', label: 'TENDENCIES' },
  { key: 'playbook', label: 'PLAYBOOK' }
];

export default function TeamHQ() {
  const snapshot = useHQ((s) => s.snapshot);
  const [tab, setTab] = useState<Tab>('roster');
  const school = snapshot?.school;

  if (!school) {
    return (
      <div className="page">
        <div className="empty">Reading your dynasty save…</div>
      </div>
    );
  }

  const { team, roster } = school;

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <TeamLogo row={team.row} size={64} fallback={null} />
        <div>
          {team.city && (
            <div className="page-kicker">
              {team.city}, {team.state}
            </div>
          )}
          <h1 className="page-title">
            {team.longName} <span className="nick">{team.nickName}</span>
          </h1>
        </div>
      </div>
      <div className="page-sub">
        {team.headCoach && (
          <span className="chip">
            <span className="k">HC</span> <b>{team.headCoach}</b>
          </span>
        )}
        {team.offCoordinator && (
          <span className="chip">
            <span className="k">OC</span> <b>{team.offCoordinator}</b>
          </span>
        )}
        {team.defCoordinator && (
          <span className="chip">
            <span className="k">DC</span> <b>{team.defCoordinator}</b>
          </span>
        )}
        <span className="chip">
          <span className="k">OFF</span> <b>{schemeLabel(team.offScheme)}</b>
        </span>
        <span className="chip">
          <span className="k">DEF</span> <b>{schemeLabel(team.defScheme)}</b>
        </span>
        <span className="chip">
          <span className="k">ROSTER</span> <b>{roster.length}</b>
        </span>
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

      {tab === 'roster' && <RosterTable roster={roster} />}
      {tab === 'depth' && <DepthChartView school={school} />}
      {tab === 'targets' && <TargetsView school={school} />}
      {tab === 'budget' && <BudgetView school={school} />}
      {tab === 'tendencies' && <TendenciesView school={school} />}
      {tab === 'playbook' && <PlaybookView school={school} />}
    </div>
  );
}
