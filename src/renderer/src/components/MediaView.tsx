import { useMemo, useState } from 'react';
import type { MediaEvent } from '../../../shared/types.ts';
import { useHQ } from '../store.ts';
import InfoDot, { InfoRow } from './InfoDot.tsx';
import MediaHQ from './MediaHQ.tsx';
import Story, { weekLabel } from './Story.tsx';

const FILTERS: { key: string; label: string; match: (e: MediaEvent) => boolean }[] = [
  { key: 'all', label: 'ALL', match: () => true },
  { key: 'mine', label: 'MY TEAM', match: (e) => e.aboutUser },
  {
    key: 'results',
    label: 'RESULTS',
    match: (e) => e.type === 'userGame' || e.type === 'bigGame' || e.type === 'statLine' || e.type === 'streak'
  },
  { key: 'recruiting', label: 'RECRUITING', match: (e) => e.type === 'commit' },
  {
    key: 'coaching',
    label: 'COACHING & ROSTER',
    match: (e) =>
      e.type === 'coachChange' || e.type === 'rosterMove' || e.type === 'hotSeat' || e.type === 'draftPick'
  },
  { key: 'polls', label: 'POLLS', match: (e) => e.type === 'pollMove' },
  {
    key: 'awards',
    label: 'AWARDS',
    match: (e) => e.type === 'weeklyAward' || e.type === 'awardShow' || e.type === 'awardWin'
  },
  { key: 'wire', label: 'THE WIRE', match: (e) => e.format === 'post' }
];

const STORY_CAP = 60;

export default function MediaView() {
  const media = useHQ((s) => s.media);
  const [tab, setTab] = useState<'hq' | 'wire'>('hq');
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

      <div className="tabs">
        <button className={`tab ${tab === 'hq' ? 'active' : ''}`} onClick={() => setTab('hq')}>
          MEDIA HQ
        </button>
        <button className={`tab ${tab === 'wire' ? 'active' : ''}`} onClick={() => setTab('wire')}>
          THE WIRE
          {media.length > 0 && <span className="tab-count">{media.length}</span>}
        </button>
        <InfoDot title="Dynasty Media">
          <p>
            Coverage written from what actually changed between saves: results, rankings, commits,
            transfers, coaching moves. Every line is built from your dynasty's own numbers.
          </p>
          <InfoRow term="Media HQ">
            The league desk. The ticker's cap switches between the Top 25, stat leaders and award
            races; the modules read polls, schedules and season stats straight from the save.
          </InfoRow>
          <InfoRow term="The Wire">
            The full story feed, plus the press corps' running posts: rumors, scoops and takes from
            the outlets that cover your league.
          </InfoRow>
          <p>
            Award races are the app's stat-based projections until the game's own awards show
            crowns the winners.
          </p>
        </InfoDot>
      </div>

      {tab === 'hq' ? (
        <MediaHQ media={media} onOpenWire={() => setTab('wire')} />
      ) : (
        <>
          <div className="page-sub" style={{ marginTop: 14 }}>
            <span className="chip">
              <span className="k">STORIES</span> <b>{media.length}</b>
            </span>
            <span className="chip">
              <span className="k">ABOUT YOU</span> <b>{media.filter((e) => e.aboutUser).length}</b>
            </span>
          </div>

          <div className="filters" style={{ marginTop: 12 }}>
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
        </>
      )}
    </div>
  );
}
