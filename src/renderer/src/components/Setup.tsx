import { useEffect, useState } from 'react';
import { useHQ } from '../store.ts';
import { useLogoVersion } from './TeamLogo.tsx';
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
        <h3>Team logos</h3>
        <div className="rule" />
      </div>
      <LogoSettings />

      <div className="section-h">
        <h3>Player portraits</h3>
        <div className="rule" />
      </div>
      <PortraitSettings />

      <div className="section-h">
        <h3>Dynasty Media branding</h3>
        <div className="rule" />
      </div>
      <BrandPackToggle />
      <p className="foot-note">
        Real network branding is rendered typographically inside the app. Switch to the fictional pack
        any time — existing stories re-label instantly.
      </p>

      <div className="section-h">
        <h3>App updates</h3>
        <div className="rule" />
      </div>
      <AutoUpdateToggle />
      <p className="foot-note">
        With automatic updates on, the app checks GitHub Releases once at launch — its only network
        call. Updates download in the background and never install until you click "Restart to
        update". Turn it off and the app makes no network requests at all.
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

function LogoSettings() {
  const settings = useHQ((s) => s.settings);
  const setSettings = useHQ((s) => s.applySettings);
  const bumpLogos = useLogoVersion((s) => s.bump);
  const [cached, setCached] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void window.hq.logoStatus().then((s) => setCached(s.cached));
  }, []);

  const runImport = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await window.hq.importLogos();
      setCached(r.cached);
      setMessage(
        `Imported ${r.matched} of ${r.total} school logos.` +
          (r.misses.length ? ` No match for: ${r.misses.join(', ')}.` : '')
      );
      bumpLogos();
    } catch (err) {
      setMessage(err instanceof Error ? err.message.replace(/^.*Error: /, '') : 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>
        {cached > 0
          ? `${cached} logos cached locally — schools show their real marks.`
          : 'No logos yet — schools show colored initials.'}
        {settings?.logosDir && (
          <span style={{ color: 'var(--ink-3)', wordBreak: 'break-all' }}>
            {' '}
            · local pack: {settings.logosDir}
          </span>
        )}
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn primary" disabled={busy} onClick={() => void runImport()}>
          {busy ? 'Importing…' : cached > 0 ? 'Re-import logos' : 'Import team logos (one-time download)'}
        </button>
        <button
          className="btn"
          onClick={() => void window.hq.pickLogosDir().then((s) => setSettings(s))}
        >
          Choose local logo folder…
        </button>
        {settings?.logosDir && (
          <button
            className="btn"
            onClick={() => void window.hq.clearLogosDir().then((s) => {
              setSettings(s);
              bumpLogos();
            })}
          >
            Clear folder
          </button>
        )}
      </div>
      {message && (
        <p style={{ color: 'var(--ink-2)', fontSize: 12, marginTop: 8 }}>{message}</p>
      )}
      <p className="foot-note">
        Import fetches each school's mark once from ESPN's public directory and caches it locally —
        the app stays fully offline afterward. A local folder (files named like{' '}
        <code>notre-dame.png</code>) takes priority and works with no download at all.
      </p>
    </>
  );
}

function PortraitSettings() {
  const settings = useHQ((s) => s.settings);
  const setSettings = useHQ((s) => s.applySettings);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (settings?.portraitsDir) void window.hq.countPortraits().then(setCount);
    else setCount(0);
  }, [settings?.portraitsDir]);

  return (
    <>
      <p style={{ color: 'var(--ink-2)', fontSize: 12.5, wordBreak: 'break-all' }}>
        {settings?.portraitsDir ?? 'No portrait pack selected — rosters show text only.'}
        {settings?.portraitsDir && count !== null && (
          <span style={{ color: 'var(--ink-3)' }}> · {count} portraits found</span>
        )}
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          className="btn"
          onClick={() => void window.hq.pickPortraits().then((r) => {
            setSettings(r.settings);
            setCount(r.count);
          })}
        >
          Choose portrait folder…
        </button>
        {settings?.portraitsDir && (
          <button
            className="btn"
            onClick={() => void window.hq.clearPortraits().then((r) => {
              setSettings(r.settings);
              setCount(0);
            })}
          >
            Clear
          </button>
        )}
      </div>
      <p className="foot-note">
        Point this at a folder of images named by portrait ID — <code>1234.png</code> (jpg and webp
        work too). Hover a player's name on the roster to see their portrait ID. Community portrait
        packs organized this way light up automatically.
      </p>
    </>
  );
}

function BrandPackToggle() {
  const pack = useHQ((s) => s.settings?.brandPack ?? 'real');
  const setBrandPack = useHQ((s) => s.setBrandPack);
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button className={`filter ${pack === 'real' ? 'active' : ''}`} onClick={() => void setBrandPack('real')}>
        Real networks
      </button>
      <button
        className={`filter ${pack === 'parody' ? 'active' : ''}`}
        onClick={() => void setBrandPack('parody')}
      >
        Fictional networks
      </button>
    </div>
  );
}
