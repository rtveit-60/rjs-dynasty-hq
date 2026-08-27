import { useHQ } from '../store.ts';
import ThemeToggle from './ThemeToggle.tsx';

export default function Setup() {
  const settings = useHQ((s) => s.settings);
  const snapshot = useHQ((s) => s.snapshot);
  const pickSave = useHQ((s) => s.pickSave);
  const setSchool = useHQ((s) => s.setSchool);
  const setNav = useHQ((s) => s.setNav);

  return (
    <div className="page">
      <h1 className="page-title">Setup</h1>

      <div className="section-h">
        <h3>Dynasty Save</h3>
        <div className="rule" />
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 12.5, wordBreak: 'break-all' }}>
        {settings?.savePath ?? 'No save selected'}
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn" onClick={() => void pickSave()}>
          Change save file…
        </button>
        <button className="btn" onClick={() => void window.hq.revealSave()}>
          Show in folder
        </button>
      </div>

      <div className="section-h">
        <h3>School</h3>
        <div className="rule" />
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>
        {snapshot?.school ? `${snapshot.school.team.longName} ${snapshot.school.team.nickName}` : '—'}
      </p>
      <div style={{ marginTop: 10 }}>
        <button
          className="btn"
          onClick={() => {
            void setSchool(null);
            setNav('team');
          }}
        >
          Change school…
        </button>
      </div>

      <div className="section-h">
        <h3>Appearance</h3>
        <div className="rule" />
      </div>
      <ThemeToggle />

      <div className="section-h">
        <h3>App updates</h3>
        <div className="rule" />
      </div>
      <AutoUpdateToggle />
      <p className="foot-note">
        With automatic updates on, the app checks GitHub Releases once at launch. Updates download in
        the background and never install until you click "Restart to update".
      </p>
    </div>
  );
}

function AutoUpdateToggle() {
  const enabled = useHQ((s) => s.settings?.autoUpdate ?? true);
  const setAutoUpdate = useHQ((s) => s.setAutoUpdate);
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button className={`filter ${enabled ? 'active' : ''}`} onClick={() => void setAutoUpdate(true)}>
        Automatic
      </button>
      <button className={`filter ${!enabled ? 'active' : ''}`} onClick={() => void setAutoUpdate(false)}>
        Off
      </button>
    </div>
  );
}
