import { useEffect } from 'react';
import { relTime } from '../lib/format.ts';
import { useHQ } from '../store.ts';

export default function Onboarding() {
  const detected = useHQ((s) => s.detectedSaves);
  const refreshDetected = useHQ((s) => s.refreshDetected);
  const useSave = useHQ((s) => s.useSave);
  const pickSave = useHQ((s) => s.pickSave);

  useEffect(() => {
    void refreshDetected();
    const id = setInterval(() => void refreshDetected(), 15_000);
    return () => clearInterval(id);
  }, [refreshDetected]);

  return (
    <div className="hero">
      <div className="hero-card">
        <div className="hero-mark">
          <span className="rj">RJ&rsquo;S</span>
          <br />
          Dynasty HQ
        </div>
        <p className="hero-tag">
          Pick a College Football 27 dynasty save. The dashboard follows it from then on,
          refreshing every time the game writes.
        </p>

        {detected.length > 0 && (
          <div className="save-list">
            {detected.map((s) => (
              <button key={s.path} className="save-row" onClick={() => void useSave(s.path)}>
                <span className="nm">{s.name.replace(/-AUTOSAVE$/, '')}</span>
                {s.isAutosave && <span className="tag">Autosave</span>}
                <span className="meta">saved {relTime(s.modified)}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <button className="btn" onClick={() => void pickSave()}>
            Browse for a save file…
          </button>
        </div>

        <p className="foot-note">
          Your save is never modified. The app parses a copy, and player edits are written
          to a separate _RJsEdited copy — the original file always keeps its exact bytes.
        </p>
      </div>
    </div>
  );
}
