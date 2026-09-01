import { useEffect, useState } from 'react';
import type { GameDirStatus } from '../../../shared/types.ts';
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

      <GameFolderSection />

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

      <DiagnosticsSection />
    </div>
  );
}

function GameFolderSection() {
  const [status, setStatus] = useState<GameDirStatus | null>(null);
  useEffect(() => {
    void window.hq.gameStatus().then(setStatus);
  }, []);

  const sourceLabel =
    status?.source === 'setting'
      ? 'set by you'
      : status?.source
        ? 'detected automatically'
        : null;

  return (
    <>
      <div className="section-h">
        <h3>Game installation</h3>
        <InfoDot title="Game installation">
          <p>
            Where College Football 27 is installed. The app reads the game's own files from here —
            team art, field paint, playcall diagrams and the data behind names and mappings — and
            never writes to them.
          </p>
          <p>
            Steam installs are found automatically, including ones on other drives. If the game
            lives somewhere else, point the app at the folder that contains the game (the one
            holding its Data folder).
          </p>
        </InfoDot>
        <div className="rule" />
      </div>
      <p className="set-value">
        {status === null ? '…' : (status.root ?? 'Not found — choose the install folder')}
        {sourceLabel && <span className="set-note"> · {sourceLabel}</span>}
      </p>
      {status?.settingInvalid && (
        <p className="set-warn">
          The folder you set is not a College Football 27 install anymore; the app is
          auto-detecting instead.
        </p>
      )}
      {status?.rejected && (
        <p className="set-warn">
          {status.rejected} is not a College Football 27 install (no Data\layout.toc inside), so it
          was not saved.
        </p>
      )}
      <div className="set-actions">
        <button className="btn" onClick={() => void window.hq.chooseGameDir().then(setStatus)}>
          Choose game folder…
        </button>
        {status?.configured && (
          <button className="btn" onClick={() => void window.hq.clearGameDir().then(setStatus)}>
            Auto-detect
          </button>
        )}
      </div>
    </>
  );
}

function DiagnosticsSection() {
  const [firstLine, setFirstLine] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void window.hq.getDiagnostics().then((text) => setFirstLine(text.split('\n')[0] ?? ''));
  }, []);

  const copy = (): void => {
    void window.hq
      .getDiagnostics()
      .then((text) => navigator.clipboard.writeText(text))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <>
      <div className="section-h">
        <h3>Diagnostics</h3>
        <InfoDot title="Diagnostics">
          <p>
            The app keeps a small local log of what it does — parses, edits, and any errors, each
            error under a short code like HQ-3F2A. Nothing ever leaves your machine.
          </p>
          <p>
            When something misbehaves, <b>Copy report</b> puts your version, environment and the
            recent log on the clipboard — paste that into a bug report and the code pins down the
            failure.
          </p>
        </InfoDot>
        <div className="rule" />
      </div>
      <p className="set-value">{firstLine || '…'}</p>
      <div className="set-actions">
        <button className="btn" onClick={copy}>
          {copied ? 'Copied' : 'Copy report'}
        </button>
        <button className="btn" onClick={() => void window.hq.openLogs()}>
          Open log folder
        </button>
      </div>
    </>
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
