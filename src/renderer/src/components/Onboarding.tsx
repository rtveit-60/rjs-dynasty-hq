import { useEffect } from 'react';
import { relTime } from '../lib/format.ts';
import { useHQ } from '../store.ts';

export default function Onboarding() {
  const detected = useHQ((s) => s.detectedSaves);
  const refreshDetected = useHQ((s) => s.refreshDetected);
  const useSave = useHQ((s) => s.useSave);
  const pickSave = useHQ((s) => s.pickSave);
  const veilOn = useHQ((s) => s.settings?.hideUnscouted === true);
  const setHideUnscouted = useHQ((s) => s.setHideUnscouted);

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

        {/* First-run choice; the same switch lives in Setup > Scouting veil. Off by default. */}
        <div className="hero-opt">
          <div className="hero-opt-k">Scouting veil</div>
          <p className="hero-opt-p">
            The save holds every recruit's true ratings. Show them all, or keep a recruit's
            overall, dev trait, gem/bust and attributes hidden until your program has fully scouted
            them, the way the game does. Change it any time in Setup.
          </p>
          <div className="set-actions">
            <button className={`filter ${!veilOn ? 'active' : ''}`} onClick={() => void setHideUnscouted(false)}>
              Show everything
            </button>
            <button className={`filter ${veilOn ? 'active' : ''}`} onClick={() => void setHideUnscouted(true)}>
              Hide until scouted
            </button>
          </div>
        </div>

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
          to a separate _RJ copy — the original file always keeps its exact bytes.
        </p>
      </div>
    </div>
  );
}
