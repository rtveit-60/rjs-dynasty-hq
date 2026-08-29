import type { MediaEvent } from '../../../shared/types.ts';
import { brandName } from '../lib/brands.ts';
import { spaceOut } from '../lib/format.ts';
import { useHQ } from '../store.ts';

function Masthead({ outlet }: { outlet: string }) {
  const pack = useHQ((s) => s.settings?.brandPack ?? 'real');
  const name = brandName(outlet, pack);
  if (outlet === 'gameday') {
    const parts = name.split(' ');
    return (
      <span className={`mast mast-${outlet}`}>
        {parts[0]} <span className="accent">{parts.slice(1).join(' ')}</span>
      </span>
    );
  }
  return <span className={`mast mast-${outlet}`}>{name}</span>;
}

export function weekLabel(e: MediaEvent): string {
  if (e.weekType === 'RegularSeason') return `Week ${e.week} · ${e.seasonYear}`;
  if (/OffSeason|Offseason/.test(e.weekType)) return `Offseason · ${e.seasonYear}`;
  if (e.weekType === 'Preseason') return `Preseason · ${e.seasonYear}`;
  return `${spaceOut(e.weekType)} · ${e.seasonYear}`;
}

/** A short social-style post from one of the wire's fictional personalities. */
function WirePost({ e }: { e: MediaEvent }) {
  const b = e.byline!;
  return (
    <article className={`story wire-post ${e.aboutUser ? 'user-story' : ''}`}>
      <div className="post-head">
        <b>{b.name}</b>
        <span className="post-handle">{b.handle}</span>
        <span className="post-outlet">{b.outletName}</span>
      </div>
      <p className="post-text">{e.headline}</p>
      <div className="meta">
        <span>{weekLabel(e)}</span>
        <span className="tag">{b.role}</span>
      </div>
    </article>
  );
}

export default function Story({ e, lead }: { e: MediaEvent; lead: boolean }) {
  if (e.format === 'post' && e.byline) return <WirePost e={e} />;
  return (
    <article className={`story ${lead ? 'lead' : ''} ${e.aboutUser ? 'user-story' : ''}`}>
      <Masthead outlet={e.outlet} />
      <h2>{e.headline}</h2>
      <div className="dek">{e.dek}</div>
      {(lead ? e.body : e.body.slice(0, 1)).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      <div className="meta">
        <span>{weekLabel(e)}</span>
        {e.tags
          .filter(Boolean)
          .slice(0, 3)
          .map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
      </div>
    </article>
  );
}
