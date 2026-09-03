import { initials } from '../lib/format.ts';
import { useHQ, type NavKey } from '../store.ts';
import ScaleControl from './ScaleControl.tsx';
import TeamLogo from './TeamLogo.tsx';
import ThemeToggle from './ThemeToggle.tsx';

/* Full labels for the wide rail; short marks when the window narrows. */
const ITEMS: { key: NavKey; label: string; abbr: string }[] = [
  { key: 'team', label: 'TEAM HQ', abbr: 'HQ' },
  { key: 'recruiting', label: 'RECRUITING', abbr: 'REC' },
  { key: 'media', label: 'DYNASTY MEDIA', abbr: 'MED' },
  { key: 'carousel', label: 'COACHING CAROUSEL', abbr: 'CAR' },
  { key: 'settings', label: 'DYNASTY SETTINGS', abbr: 'DYN' },
  { key: 'setup', label: 'SETUP', abbr: 'SET' }
];

function UpdateBanner() {
  const updateReady = useHQ((s) => s.updateReady);
  if (!updateReady) return null;
  return (
    <button
      className="btn primary update-btn"
      style={{ width: '100%', justifyContent: 'center' }}
      title={`Version ${updateReady} downloaded. Restart to install.`}
      onClick={() => void window.hq.installUpdate()}
    >
      <span className="up-full">Restart to update · v{updateReady}</span>
      <span className="up-abbr">↻</span>
    </button>
  );
}

export default function SideNav() {
  const nav = useHQ((s) => s.nav);
  const setNav = useHQ((s) => s.setNav);
  const snapshot = useHQ((s) => s.snapshot);
  const team = snapshot?.school?.team;
  const season = snapshot?.season;

  return (
    <aside className="rail">
      <div className="school-block">
        {team ? (
          <TeamLogo
            row={team.row}
            size={40}
            fallback={<div className="school-mark">{initials(team.longName)}</div>}
          />
        ) : (
          <div className="school-mark">·</div>
        )}
        <div>
          <div className="school-name">{team ? team.longName : 'Loading…'}</div>
          <div className="school-sub">
            {team?.headCoach ? `HC ${team.headCoach}` : season ? `${season.seasonYear} Season` : '—'}
          </div>
          <div className="school-sub">
            {season ? `${season.seasonYear} Season · Year ${season.dynastyYear}` : ''}
          </div>
        </div>
      </div>
      <nav className="nav">
        {ITEMS.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${nav === item.key ? 'active' : ''}`}
            title={item.label}
            onClick={() => setNav(item.key)}
          >
            <span className="nav-full">{item.label}</span>
            <span className="nav-abbr">{item.abbr}</span>
          </button>
        ))}
      </nav>
      <div className="rail-fill" aria-hidden="true">
        {team?.state && (
          <img
            className="rail-state"
            src={`gameicon://state-${team.state.toLowerCase().replace(/[^a-z]/g, '')}`}
            alt=""
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
        {team && <TeamLogo row={team.row} size={170} fallback={null} />}
      </div>
      <div className="rail-foot">
        <UpdateBanner />
        <div className="rail-controls">
          <ThemeToggle />
          <ScaleControl />
        </div>
        <span className="rail-note">Your original save is never modified. Edits write a _RJ copy.</span>
      </div>
    </aside>
  );
}
