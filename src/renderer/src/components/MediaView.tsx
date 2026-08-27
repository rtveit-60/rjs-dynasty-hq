import { useMemo, useState } from 'react';
import type { MediaEvent } from '../../../shared/types.ts';
import { brandName } from '../lib/brands.ts';
import { spaceOut } from '../lib/format.ts';
import { useHQ } from '../store.ts';

const FILTERS: { key: string; label: string; match: (e: MediaEvent) => boolean }[] = [
  { key: 'all', label: 'ALL', match: () => true },
  { key: 'mine', label: 'MY TEAM', match: (e) => e.aboutUser },
  { key: 'results', label: 'RESULTS', match: (e) => e.type === 'userGame' || e.type === 'bigGame' },
  { key: 'recruiting', label: 'RECRUITING', match: (e) => e.type === 'commit' },
  {
    key: 'coaching',
    label: 'COACHING & ROSTER',
    match: (e) => e.type === 'coachChange' || e.type === 'rosterMove'
  },
  { key: 'polls', label: 'POLLS', match: (e) => e.type === 'pollMove' }
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

function Story({ e, lead }: { e: MediaEvent; lead: boolean }) {
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
          No stories yet — play or sim a week and the wire lights up when the save updates.
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
