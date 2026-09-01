import { useMemo, useState } from 'react';
import type { MediaEvent } from '../../../shared/types.ts';
import { useHQ } from '../store.ts';
import ArticleModal from './ArticleModal.tsx';
import InfoDot, { InfoRow } from './InfoDot.tsx';
import CfpBracketView from './CfpBracketView.tsx';
import MediaHQ from './MediaHQ.tsx';
import Story, { WirePost, weekLabel } from './Story.tsx';

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
  }
];

const STORY_CAP = 60;
const POST_CAP = 80;

export default function MediaView() {
  const media = useHQ((s) => s.media);
  const [tab, setTab] = useState<'hq' | 'bracket' | 'wire' | 'social'>('hq');
  const [filter, setFilter] = useState('all');
  const [reading, setReading] = useState<MediaEvent | null>(null);

  const articles = useMemo(() => media.filter((e) => e.format !== 'post'), [media]);
  const posts = useMemo(() => media.filter((e) => e.format === 'post'), [media]);

  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const filtered = useMemo(() => articles.filter(active.match), [articles, active]);
  const feedPosts = useMemo(
    () => (filter === 'mine' ? posts.filter((e) => e.aboutUser) : posts),
    [posts, filter]
  );

  const group = (list: MediaEvent[], cap: number) => {
    const out: { label: string; stories: MediaEvent[] }[] = [];
    for (const e of list.slice(0, cap)) {
      const label = weekLabel(e);
      const last = out[out.length - 1];
      if (last && last.label === label) last.stories.push(e);
      else out.push({ label, stories: [e] });
    }
    return out;
  };
  const groups = useMemo(() => group(filtered, STORY_CAP), [filtered]);
  const postGroups = useMemo(() => group(feedPosts, POST_CAP), [feedPosts]);

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
        <button className={`tab ${tab === 'bracket' ? 'active' : ''}`} onClick={() => setTab('bracket')}>
          CFP BRACKET
        </button>
        <button className={`tab ${tab === 'wire' ? 'active' : ''}`} onClick={() => setTab('wire')}>
          THE WIRE
          {articles.length > 0 && <span className="tab-count">{articles.length}</span>}
        </button>
        <button className={`tab ${tab === 'social' ? 'active' : ''}`} onClick={() => setTab('social')}>
          SOCIAL
          {posts.length > 0 && <span className="tab-count">{posts.length}</span>}
        </button>
        <InfoDot title="Dynasty Media">
          <p>
            Coverage written from what actually changed between saves: results, rankings, commits,
            transfers, coaching moves, awards. Every line is built from your dynasty's own numbers.
          </p>
          <InfoRow term="Media HQ">
            The league desk. The ticker's cap switches between the Top 25, stat leaders and award
            races; the modules read polls, schedules and season stats straight from the save.
          </InfoRow>
          <InfoRow term="CFP Bracket">
            The College Football Playoff, rebuilt from the save's own playoff games — the current
            season once it reaches December, otherwise the most recent completed bracket.
          </InfoRow>
          <InfoRow term="The Wire">
            The article feed. Click any story to read the full write-up, bylined by the press corps
            covering your league.
          </InfoRow>
          <InfoRow term="Social">
            The posting side of the media ecosystem — rumors, scoops, follow-ups and takes from
            insiders, beat writers and the louder accounts.
          </InfoRow>
          <p>
            Award races are the app's stat-based projections until the game's own awards show
            crowns the winners.
          </p>
        </InfoDot>
      </div>

      {tab === 'hq' && (
        <MediaHQ media={articles} onOpenWire={() => setTab('wire')} onOpenStory={setReading} />
      )}

      {tab === 'bracket' && <CfpBracketView />}

      {tab === 'wire' && (
        <>
          <div className="page-sub" style={{ marginTop: 14 }}>
            <span className="chip">
              <span className="k">STORIES</span> <b>{articles.length}</b>
            </span>
            <span className="chip">
              <span className="k">ABOUT YOU</span> <b>{articles.filter((e) => e.aboutUser).length}</b>
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
                  <Story key={e.id} e={e} lead={gi === 0 && si === 0} onOpen={setReading} />
                ))}
              </div>
            </div>
          ))}
          {filtered.length > STORY_CAP && (
            <p className="foot-note">Showing the {STORY_CAP} most recent stories.</p>
          )}
        </>
      )}

      {tab === 'social' && (
        <>
          <div className="page-sub" style={{ marginTop: 14 }}>
            <span className="chip">
              <span className="k">POSTS</span> <b>{posts.length}</b>
            </span>
            <button
              className={`filter ${filter === 'mine' ? 'active' : ''}`}
              onClick={() => setFilter(filter === 'mine' ? 'all' : 'mine')}
            >
              MY TEAM
            </button>
          </div>

          {!feedPosts.length && (
            <div className="empty">
              Quiet timeline. The press corps posts when the save gives them something to post about.
            </div>
          )}

          <div className="soc-feed">
            {postGroups.map((g) => (
              <div key={g.label}>
                <div className="section-h">
                  <h3>{g.label}</h3>
                  <div className="rule" />
                </div>
                {g.stories.map((e) => (
                  <WirePost key={e.id} e={e} />
                ))}
              </div>
            ))}
          </div>
          {feedPosts.length > POST_CAP && (
            <p className="foot-note">Showing the {POST_CAP} most recent posts.</p>
          )}
        </>
      )}

      {reading && <ArticleModal e={reading} onClose={() => setReading(null)} />}
    </div>
  );
}
