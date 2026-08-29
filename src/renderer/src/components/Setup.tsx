import { useHQ } from '../store.ts';
import InfoDot from './InfoDot.tsx';
import ScaleControl from './ScaleControl.tsx';
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
        <h3>Dynasty save</h3>
        <InfoDot title="Dynasty save">
          <p>
            The app watches this file and refreshes every view when the game writes a new save. It
            reads a copy, never the file itself, so the game can save freely at any time.
          </p>
          <p>Saves live under Documents\EA SPORTS College Football 27\saves.</p>
        </InfoDot>
        <div className="rule" />
      </div>
      <p className="set-value">{settings?.savePath ?? 'No save selected'}</p>
      <div className="set-actions">
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
      <p className="set-value">
        {snapshot?.school ? `${snapshot.school.team.longName} ${snapshot.school.team.nickName}` : '—'}
      </p>
      <div className="set-actions">
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
        <InfoDot title="Appearance">
          <p>
            <b>Theme</b> follows Windows in Auto, or stays fixed on Light or Dark.
          </p>
          <p>
            <b>Fit</b> scales the whole interface with the window: maximized on a monitor it fills
            edge to edge, tucked into a corner it shrinks to match.
          </p>
          <p>
            <b>A−/A+</b> bias the size either way, with Fit on or off. Ctrl+= and Ctrl+− step it
            from anywhere; Ctrl+0 resets.
          </p>
        </InfoDot>
        <div className="rule" />
      </div>
      <div className="set-actions">
        <ThemeToggle />
        <ScaleControl />
      </div>

      <div className="section-h">
        <h3>App updates</h3>
        <InfoDot title="App updates">
          <p>
            With automatic updates on, the app checks GitHub Releases once at launch. A new version
            downloads in the background and installs only when you click the restart button in the
            side rail.
          </p>
          <p>With updates off, the app makes no network requests at all.</p>
        </InfoDot>
        <div className="rule" />
      </div>
      <AutoUpdateToggle />
    </div>
  );
}

function AutoUpdateToggle() {
  const enabled = useHQ((s) => s.settings?.autoUpdate ?? true);
  const setAutoUpdate = useHQ((s) => s.setAutoUpdate);
  return (
    <div className="set-actions">
      <button className={`filter ${enabled ? 'active' : ''}`} onClick={() => void setAutoUpdate(true)}>
        Automatic
      </button>
      <button className={`filter ${!enabled ? 'active' : ''}`} onClick={() => void setAutoUpdate(false)}>
        Off
      </button>
    </div>
  );
}
