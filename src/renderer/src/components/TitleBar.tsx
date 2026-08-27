import { useHQ } from '../store.ts';
import StatusPill from './StatusPill.tsx';

export default function TitleBar() {
  const snapshot = useHQ((s) => s.snapshot);
  const settings = useHQ((s) => s.settings);

  const season = snapshot?.season;

  return (
    <header className="titlebar">
      <div className="wordmark">
        <span className="rj">RJ&rsquo;S</span> DYNASTY HQ
      </div>
      {settings?.savePath && (
        <div className="titlebar-meta">
          <span>{snapshot?.fileName ?? '…'}</span>
          {season && (
            <>
              <span>·</span>
              <span>
                {season.seasonYear} — Year {season.dynastyYear}, Week {season.week}
              </span>
            </>
          )}
        </div>
      )}
      <div style={{ flex: 1 }} />
      <span className="no-drag">
        <StatusPill />
      </span>
    </header>
  );
}
