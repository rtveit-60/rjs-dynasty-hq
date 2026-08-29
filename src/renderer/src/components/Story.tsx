import type { MediaEvent } from '../../../shared/types.ts';
import { brandName } from '../lib/brands.ts';
import { spaceOut } from '../lib/format.ts';
import { useHQ } from '../store.ts';

export function Masthead({ outlet }: { outlet: string }) {
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

/** A social post from one of the wire's personalities — the social timeline row. */
export function WirePost({ e }: { e: MediaEvent }) {
  const b = e.byline!;
  const initials = b.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('');
  return (
    <article className={`soc-post ${e.aboutUser ? 'user-story' : ''}`}>
      <div className="soc-avatar" aria-hidden="true">
        {initials}
      </div>
      <div className="soc-main">
        <div className="soc-head">
          <b>{b.name}</b>
          <span className="soc-handle">{b.handle}</span>
          <span className="soc-dot">·</span>
          <span className="soc-outlet">{b.outletName}</span>
        </div>
        <p className="soc-text">{e.headline}</p>
        <div className="soc-meta">
          <span>{weekLabel(e)}</span>
          <span className="tag">{b.role}</span>
        </div>
      </div>
    </article>
  );
}

export default function Story({
  e,
  lead,
  onOpen
}: {
  e: MediaEvent;
  lead: boolean;
  onOpen?: (e: MediaEvent) => void;
}) {
  if (e.format === 'post' && e.byline) return <WirePost e={e} />;
  const open = onOpen ? () => onOpen(e) : undefined;
  return (
    <article
      className={`story ${lead ? 'lead' : ''} ${e.aboutUser ? 'user-story' : ''} ${open ? 'openable' : ''}`}
      onClick={open}
      onKeyDown={open ? (ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), open()) : undefined}
      role={open ? 'button' : undefined}
      tabIndex={open ? 0 : undefined}
    >
      <Masthead outlet={e.outlet} />
      <h2>{e.headline}</h2>
      <div className="dek">{e.dek}</div>
      {(lead ? e.body : e.body.slice(0, 1)).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {e.byline && (
        <div className="story-by">
          By {e.byline.name} · {e.byline.role}
        </div>
      )}
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
        {open && <span className="read-cue">READ →</span>}
      </div>
    </article>
  );
}
