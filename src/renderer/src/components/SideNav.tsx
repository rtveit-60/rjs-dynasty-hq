import { initials } from '../lib/format.ts';
import { useHQ, type NavKey } from '../store.ts';
import ThemeToggle from './ThemeToggle.tsx';

const ITEMS: { key: NavKey; label: string; soon?: boolean }[] = [
  { key: 'team', label: 'TEAM HQ' },
  { key: 'recruiting', label: 'RECRUITING' },
  { key: 'media', label: 'DYNASTY MEDIA' },
  { key: 'setup', label: 'SETUP' }
];

function UpdateBanner() {
  const updateReady = useHQ((s) => s.updateReady);
  if (!updateReady) return null;
  return (
    <button className="btn primary" style={{ width: '100%' }} onClick={() => void window.hq.installUpdate()}>
      v{updateReady} ready — Restart to update
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
        <div className="school-mark">{team ? initials(team.longName) : '·'}</div>
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
            disabled={item.soon}
            onClick={() => setNav(item.key)}
          >
            {item.label}
            {item.soon && <span className="soon">SOON</span>}
          </button>
        ))}
      </nav>
      <div className="rail-foot">
        <UpdateBanner />
        <ThemeToggle />
        <span>Read-only — your save file is never modified.</span>
      </div>
    </aside>
  );
}
