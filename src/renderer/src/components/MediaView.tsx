import { useMemo, useState } from 'react';
import type { MediaEvent } from '../../../shared/types.ts';
import { brandName } from '../lib/brands.ts';
import { spaceOut } from '../lib/format.ts';
import { useHQ } from '../store.ts';
import InfoDot from './InfoDot.tsx';

const FILTERS: { key: string; label: string; match: (e: MediaEvent) => boolean }[] = [
  { key: 'all', label: 'ALL', match: () => true },
  { key: 'mine', label: 'MY TEAM', match: (e) => e.aboutUser },
  { key: 'results', label: 'RESULTS', match: (e) => e.type === 'userGame' || e.type === 'bigGame' },
  { key: 'recruiting', label: 'RECRUITING', match: (e) => e.type === 'commit' },
  {
    key: 'coaching',
    label: 'COACHING & ROSTER',
    match: (e) => e.type === 'coachChange' || e.type === 'rosterMove' || e.type === 'hotSeat'
  },
  { key: 'polls', label: 'POLLS', match: (e) => e.type === 'pollMove' },
  { key: 'wire', label: 'THE WIRE', match: (e) => e.format === 'post' }
];

const STORY_CAP = 60;

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

function weekLabel(e: MediaEvent): string {
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

function Story({ e, lead }: { e: MediaEvent; lead: boolean }) {
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

export default function MediaView() {
  const media = useHQ((s) => s.media);
  const [filter, setFilter] = useState('all');

  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const filtered = useMemo(() => media.filter(active.match), [media, active]);

  const groups = useMemo(() => {
    const out: { label: string; stories: MediaEvent[] }[] = [];
    for (const e of filtered.slice(0, STORY_CAP)) {
      const label = weekLabel(e);
      const last = out[out.length - 1];
      if (last && last.label === label) last.stories.push(e);
      else out.push({ label, stories: [e] });
    }
    return out;
  }, [filtered]);

  return (
    <div className="page">
      <div className="page-kicker">The Dynasty Wire</div>
      <h1 className="page-title">
        Dynasty <span className="nick">Media</span>
      </h1>
      <div className="page-sub">
        <span className="chip">
          <span className="k">STORIES</span> <b>{media.length}</b>
        </span>
        <span className="chip">
          <span className="k">ABOUT YOU</span> <b>{media.filter((e) => e.aboutUser).length}</b>
        </span>
        <InfoDot title="Dynasty Media">
          <p>
            Coverage written from what actually changed between saves: results, rankings, commits,
            transfers, coaching moves. Nothing here is canned; every line is built from your
            dynasty's own numbers.
          </p>
          <p>
            <b>The Wire</b> filter shows the press corps' running feed: rumors, scoops and takes
            from the outlets and personalities that cover your league.
          </p>
        </InfoDot>
      </div>

      <div className="filters" style={{ marginTop: 16 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`filter ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!filtered.length && (
        <div className="empty">
          No stories yet. Play or sim a week; the wire fills in when the save updates.
        </div>
      )}

      {groups.map((g, gi) => (
        <div key={g.label}>
          <div className="section-h">
            <h3>{g.label}</h3>
            <div className="rule" />
          </div>
          <div className="wire-grid">
            {g.stories.map((e, si) => (
              <Story key={e.id} e={e} lead={gi === 0 && si === 0} />
            ))}
          </div>
        </div>
      ))}
      {filtered.length > STORY_CAP && (
        <p className="foot-note">Showing the {STORY_CAP} most recent stories.</p>
      )}
    </div>
  );
}
