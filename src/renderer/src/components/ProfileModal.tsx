import { useEffect, useRef, useState } from 'react';
import type {
  CoachProfile,
  GameLogRow,
  PlayerProfile,
  Profile,
  ProfileRequest,
  SchoolProfile,
  SchoolSeason,
  SeasonStatRow,
  StatLine
} from '../../../shared/types.ts';
import {
  archetypeLabel,
  devClass,
  devLabel,
  heightFt,
  ovrTier,
  prestigeLabel,
  spaceOut,
  stars,
  yearAbbrev
} from '../lib/format.ts';
import { useHQ } from '../store.ts';
import TeamLogo from './TeamLogo.tsx';

const RANK_COLOR: Record<string, string> = {
  Bronze: '#a9713f',
  Silver: '#9aa3ad',
  Gold: '#c9a227',
  Platinum: '#6fd3d0'
};

const ROLE_SHORT: Record<string, string> = {
  HeadCoach: 'Head Coach',
  OffensiveCoordinator: 'Offensive Coordinator',
  DefensiveCoordinator: 'Defensive Coordinator'
};

function ord(n: number): string {
  if (n <= 0) return '—';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** A clickable name that opens (or stacks) another profile. */
export function NameLink({
  req,
  children,
  className = ''
}: {
  req: ProfileRequest | null;
  children: React.ReactNode;
  className?: string;
}) {
  const openProfile = useHQ((s) => s.openProfile);
  if (!req) return <span className={className}>{children}</span>;
  return (
    <button
      type="button"
      className={`name-link ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        openProfile(req);
      }}
    >
      {children}
    </button>
  );
}

export default function ProfileModal() {
  const stack = useHQ((s) => s.profileStack);
  const back = useHQ((s) => s.backProfile);
  const close = useHQ((s) => s.closeProfiles);
  const top = stack[stack.length - 1] ?? null;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'empty'>('idle');
  const cache = useRef(new Map<string, Profile>());
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!top) {
      setProfile(null);
      setState('idle');
      return;
    }
    const key = `${top.kind}:${top.row}`;
    const hit = cache.current.get(key);
    if (hit) {
      setProfile(hit);
      setState('ready');
      return;
    }
    let alive = true;
    setState('loading');
    void window.hq
      .getProfile(top)
      .then((p) => {
        if (!alive) return;
        if (p) cache.current.set(key, p);
        setProfile(p);
        setState(p ? 'ready' : 'empty');
      })
      .catch(() => alive && setState('empty'));
    return () => {
      alive = false;
    };
  }, [top]);

  // Fresh save write → new numbers; drop the cache so reopened cards re-read.
  const parsedAt = useHQ((s) => s.snapshot?.parsedAt);
  useEffect(() => {
    cache.current.clear();
  }, [parsedAt]);

  useEffect(() => {
    if (!top) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [top, back]);

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [profile]);

  if (!top) return null;

  return (
    <div className="pf-overlay" onMouseDown={close}>
      <div className="pf-panel" ref={panelRef} onMouseDown={(e) => e.stopPropagation()}>
        <div className="pf-controls">
          {stack.length > 1 && (
            <button type="button" className="pf-btn" onClick={back}>
              ‹ Back
            </button>
          )}
          <button type="button" className="pf-btn pf-close" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>
        {state === 'loading' && <div className="pf-wait">Reading the save…</div>}
        {state === 'empty' && <div className="pf-wait">Nothing in the save for this one.</div>}
        {state === 'ready' && profile?.kind === 'player' && <PlayerBody p={profile} />}
        {state === 'ready' && profile?.kind === 'coach' && <CoachBody c={profile} />}
        {state === 'ready' && profile?.kind === 'school' && <SchoolBody s={profile} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits

function useTeamColors(teamRow: number | null): { a: string; b: string } {
  const teams = useHQ((s) => s.snapshot?.teams);
  const t = teamRow !== null ? teams?.find((x) => x.row === teamRow) : null;
  return { a: t?.colors.primary ?? 'var(--ink-3)', b: t?.colors.secondary ?? t?.colors.primary ?? 'var(--ink-3)' };
}

function AccentRule({ a, b }: { a: string; b: string }) {
  return (
    <div className="pf-rule">
      <span style={{ background: a }} />
      <span style={{ background: b }} />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="pf-section">{children}</div>;
}

/**
 * Transpose season rows into per-category tables — each stat category becomes
 * one table with a row per season plus a career line, the way box-score sites
 * lay a career out.
 */
function categoryOrder(seasons: SeasonStatRow[], career: StatLine[]): string[] {
  const seen: string[] = [];
  for (const line of [...seasons.flatMap((s) => s.lines), ...career]) {
    if (line.category !== 'Games' && !seen.includes(line.category)) seen.push(line.category);
  }
  return seen;
}

function StatHistory({ p }: { p: PlayerProfile }) {
  const cats = categoryOrder(p.seasons, p.career);
  if (!cats.length) return null;
  return (
    <>
      {cats.map((cat) => {
        const rows = p.seasons
          .map((s) => ({ s, line: s.lines.find((l) => l.category === cat) }))
          .filter((x) => x.line) as { s: SeasonStatRow; line: StatLine }[];
        const careerLine = p.career.find((l) => l.category === cat);
        if (!rows.length && !careerLine) return null;
        const header = (rows[0]?.line ?? careerLine)!.cells.map((c) => c.label);
        return (
          <div key={cat}>
            <SectionTitle>{cat}</SectionTitle>
            <div className="pf-scroll">
              <table className="pf-table">
                <thead>
                  <tr>
                    <th className="l">SEASON</th>
                    <th className="l">TEAM</th>
                    <th>GP</th>
                    {header.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...rows].reverse().map(({ s, line }) => (
                    <tr key={s.year}>
                      <td className="l">{s.year}</td>
                      <td className="l">
                        <NameLink req={s.teamRow !== null ? { kind: 'school', row: s.teamRow } : null}>
                          {s.team || '—'}
                        </NameLink>
                      </td>
                      <td>{s.gamesPlayed}</td>
                      {header.map((h) => (
                        <td key={h}>{line.cells.find((c) => c.label === h)?.value ?? '—'}</td>
                      ))}
                    </tr>
                  ))}
                  {careerLine && (
                    <tr className="pf-career">
                      <td className="l">Career</td>
                      <td className="l" />
                      <td>{p.career.find((l) => l.category === 'Games')?.cells[0]?.value ?? ''}</td>
                      {header.map((h) => (
                        <td key={h}>{careerLine.cells.find((c) => c.label === h)?.value ?? '—'}</td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}

function GameLog({ games }: { games: GameLogRow[] }) {
  if (!games.length) return null;
  const cats: string[] = [];
  for (const g of games) for (const l of g.lines) if (!cats.includes(l.category)) cats.push(l.category);
  const year = games[0]?.year;
  return (
    <>
      {cats.map((cat) => {
        const rows = games
          .map((g) => ({ g, line: g.lines.find((l) => l.category === cat) }))
          .filter((x) => x.line) as { g: GameLogRow; line: StatLine }[];
        if (!rows.length) return null;
        const header = rows[0].line.cells.map((c) => c.label);
        return (
          <div key={cat}>
            <SectionTitle>
              {year ? `${year} Game Log — ${cat}` : `Game Log — ${cat}`}
            </SectionTitle>
            <div className="pf-scroll">
              <table className="pf-table">
                <thead>
                  <tr>
                    <th className="l">WK</th>
                    <th className="l">OPPONENT</th>
                    <th className="l">RESULT</th>
                    {header.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...rows].reverse().map(({ g, line }, i) => (
                    <tr key={`${g.year}-${g.week}-${i}`}>
                      <td className="l">{g.week}</td>
                      <td className="l">
                        <span className="pf-va">{g.home ? 'vs' : 'at'}</span>{' '}
                        <NameLink req={g.opponentRow !== null ? { kind: 'school', row: g.opponentRow } : null}>
                          {g.opponent || 'TBD'}
                        </NameLink>
                      </td>
                      <td className={`l pf-res ${g.result.startsWith('W') ? 'w' : g.result.startsWith('L') ? 'ls' : ''}`}>
                        {g.result || '—'}
                      </td>
                      {header.map((h) => (
                        <td key={h}>{line.cells.find((c) => c.label === h)?.value ?? '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Player

function PlayerBody({ p }: { p: PlayerProfile }) {
  const colors = useTeamColors(p.teamRow);
  const hurt = p.injury && p.injury !== 'Uninjured';
  return (
    <div className="pf-body">
      <div className="pf-head">
        {p.teamRow !== null && <TeamLogo row={p.teamRow} size={56} fallback={null} />}
        <div className="pf-id">
          <div className="pf-name">
            {p.name}
            {p.jersey !== null && <span className="pf-jersey">#{p.jersey}</span>}
          </div>
          <div className="pf-meta">
            <span>
              {p.position}
              {p.archetype ? ` · ${archetypeLabel(p.archetype)}` : ''}
            </span>
            <span>
              {heightFt(p.heightIn)} · {p.weightLb} lb
            </span>
            {p.schoolYear && <span>{yearAbbrev(p.schoolYear, p.redshirt)}</span>}
            {p.homeTown && (
              <span>
                {p.homeTown}, {spaceOut(p.homeState)}
              </span>
            )}
          </div>
          <div className="pf-meta">
            {p.teamName && (
              <NameLink req={p.teamRow !== null ? { kind: 'school', row: p.teamRow } : null}>{p.teamName}</NameLink>
            )}
            {p.yearsWithTeam > 0 && <span>Year {p.yearsWithTeam}</span>}
            <span className={devClass(p.devTrait)}>{devLabel(p.devTrait)}</span>
            {hurt && <span className="pf-hurt">{spaceOut(p.injury)}</span>}
            {p.awards > 0 && <span>{p.awards} award{p.awards > 1 ? 's' : ''}</span>}
          </div>
        </div>
        <span className={`ovr ${ovrTier(p.overall)} pf-ovr`}>{p.overall}</span>
      </div>
      <AccentRule {...colors} />

      {p.recruit && (
        <div className="pf-recruit">
          <span className="pf-stars">{stars(p.recruit.stars)}</span>
          {p.recruit.nationalRank > 0 && <span>Natl #{p.recruit.nationalRank}</span>}
          {p.recruit.positionRank > 0 && <span>
            {p.position} #{p.recruit.positionRank}
          </span>}
          {p.recruit.stateRank > 0 && <span>State #{p.recruit.stateRank}</span>}
          {p.recruit.offers > 0 && <span>{p.recruit.offers} offers</span>}
          {p.recruit.committedTo && <span className="pf-commit">Committed — {p.recruit.committedTo}</span>}
        </div>
      )}

      {p.stops.length > 1 && (
        <div className="pf-stops">
          {p.stops.map((s, i) => (
            <span key={`${s.team}-${s.fromYear}`}>
              {i > 0 && <span className="pf-arrow">→</span>}
              <NameLink req={s.teamRow !== null ? { kind: 'school', row: s.teamRow } : null}>{s.team}</NameLink>
              <span className="pf-since"> ’{String(s.fromYear).slice(2)}</span>
            </span>
          ))}
        </div>
      )}

      <StatHistory p={p} />
      <GameLog games={p.games} />

      {!p.seasons.length && !p.career.length && !p.games.length && (
        <div className="pf-none">No game action recorded yet.</div>
      )}

      {p.ratings.length > 0 && (
        <>
          <SectionTitle>Ratings</SectionTitle>
          <div className="rc-ratings">
            {p.ratings.map((r) => (
              <div key={r.label} className="rc-stat" title={r.label}>
                <span className="rc-stat-k">{r.label}</span>
                <span className={`rc-stat-v ${ovrTier(r.value)}`}>{r.value}</span>
                <span className="rc-bar">
                  <span style={{ width: `${Math.max(0, Math.min(100, r.value))}%` }} />
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {(p.mental.length > 0 || p.physical.length > 0) && (
        <>
          <SectionTitle>Abilities</SectionTitle>
          <div className="pf-chips">
            {p.mental.map((a) => (
              <span key={a.name} className="chip">
                {spaceOut(a.name)}
                {a.rank && (
                  <>
                    &nbsp;<b style={{ color: RANK_COLOR[a.rank] ?? 'var(--ink-3)' }}>{a.rank}</b>
                  </>
                )}
              </span>
            ))}
            {p.physical.map((a, i) => (
              <span key={i} className="chip">
                <span className="k">PHYS</span>&nbsp;
                <b style={{ color: RANK_COLOR[a.rank] ?? 'var(--ink-3)' }}>{a.rank}</b>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coach

function CoachBody({ c }: { c: CoachProfile }) {
  const colors = useTeamColors(c.teamRow);
  const led: [string, string][] = c.career
    ? [
        ['Overall', `${c.career.wins}–${c.career.losses}`],
        ['At current school', `${c.career.winsAtSchool}–${c.career.lossesAtSchool}`],
        ['Bowls', `${c.career.bowlWins}–${c.career.bowlLosses}`],
        ['Playoff', `${c.career.playoffWins}–${c.career.playoffLosses}`],
        ['Conf title games', `${c.career.confChampWins}–${c.career.confChampLosses}`],
        ['Natl title games', `${c.career.natlChampWins}–${c.career.natlChampLosses}`],
        ['vs rivals', `${c.career.rivalWins}–${c.career.rivalLosses}`],
        ['vs Top 25', `${c.career.top25Wins}–${c.career.top25Losses}`],
        ['Players drafted', String(c.career.draftPicks)],
        ['First-rounders', String(c.career.firstRoundPicks)],
        ['Top-5 classes', String(c.career.top5Classes)],
        ['Times fired', String(c.career.timesFired)]
      ]
    : [];
  return (
    <div className="pf-body">
      <div className="pf-head">
        {c.teamRow !== null && <TeamLogo row={c.teamRow} size={56} fallback={null} />}
        <div className="pf-id">
          <div className="pf-name">{c.name}</div>
          <div className="pf-meta">
            <span>{ROLE_SHORT[c.role] ?? spaceOut(c.role)}</span>
            {c.teamName ? (
              <NameLink req={c.teamRow !== null ? { kind: 'school', row: c.teamRow } : null}>{c.teamName}</NameLink>
            ) : (
              <span>Unattached</span>
            )}
            {c.age > 0 && <span>Age {c.age}</span>}
            {c.homeState && <span>{spaceOut(c.homeState)}</span>}
          </div>
          <div className="pf-meta">
            {c.almaMater && (
              <span>
                <span className="pf-va">Alma mater</span>{' '}
                <NameLink req={c.almaMaterRow !== null ? { kind: 'school', row: c.almaMaterRow } : null}>
                  {c.almaMater}
                </NameLink>
              </span>
            )}
            {c.yearsCoaching > 0 && <span>{c.yearsCoaching} yrs coaching</span>}
            {c.seasonsWithTeam > 0 && <span>{c.seasonsWithTeam} at school</span>}
            {c.prestige && <span>Prestige {prestigeLabel(c.prestige)}</span>}
            {c.wasPlayer && <span>Former player</span>}
          </div>
        </div>
        {(c.seasonWins > 0 || c.seasonLosses > 0) && (
          <div className="pf-season-rec">
            <b>
              {c.seasonWins}–{c.seasonLosses}
            </b>
            <span>this season</span>
          </div>
        )}
      </div>
      <AccentRule {...colors} />

      <div className="pf-chips">
        {c.personality && <span className="chip">{spaceOut(c.personality)}</span>}
        {c.backstory && <span className="chip">{spaceOut(c.backstory)}</span>}
        {c.archetype && <span className="chip">{spaceOut(c.archetype)}</span>}
        {c.specialty && (
          <span className="chip">
            <span className="k">SPECIALTY</span>&nbsp;{spaceOut(c.specialty)}
          </span>
        )}
        {c.pipeline && (
          <span className="chip">
            <span className="k">PIPELINE</span>&nbsp;{spaceOut(c.pipeline)}
          </span>
        )}
      </div>

      {(c.securityStatus || c.contractLength > 0) && (
        <div className="pf-contract">
          {c.securityStatus && (
            <span className={`pf-sec ${c.securityStatus === 'HotSeat' ? 'hot' : c.securityStatus === 'Low' ? 'low' : ''}`}>
              {spaceOut(c.securityStatus)}
              {c.securityPct > 0 && ` · ${Math.round(c.securityPct)}%`}
            </span>
          )}
          {c.contractLength > 0 && (
            <span>
              Contract: year {Math.max(1, c.contractLength - c.contractYears + 1)} of {c.contractLength}
            </span>
          )}
        </div>
      )}

      {led.length > 0 && (
        <>
          <SectionTitle>Career</SectionTitle>
          <div className="pf-ledger">
            {led.map(([k, v]) => (
              <div key={k}>
                <b>{v}</b>
                <span>{k}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {c.stops.length > 0 && (
        <>
          <SectionTitle>Coaching History</SectionTitle>
          <div className="pf-scroll">
            <table className="pf-table">
              <thead>
                <tr>
                  <th className="l">YEARS</th>
                  <th className="l">SCHOOL</th>
                  <th className="l">ROLE</th>
                  <th>RECORD</th>
                </tr>
              </thead>
              <tbody>
                {c.stops.map((s, i) => (
                  <tr key={i}>
                    <td className="l">
                      {s.fromYear === null && s.toYear === null
                        ? 'Earlier'
                        : s.toYear === null
                          ? `${s.fromYear}–present`
                          : s.fromYear === s.toYear
                            ? String(s.fromYear)
                            : `${s.fromYear}–${s.toYear}`}
                    </td>
                    <td className="l">
                      <NameLink req={s.teamRow !== null ? { kind: 'school', row: s.teamRow } : null}>
                        {s.team || '—'}
                      </NameLink>
                    </td>
                    <td className="l">{ROLE_SHORT[s.role] ?? spaceOut(s.role)}</td>
                    <td>{s.wins !== null ? `${s.wins}–${s.losses}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// School — season browser

function SeasonBrowser({ seasons }: { seasons: SchoolSeason[] }) {
  // seasons arrive newest first; index 0 is the season underway.
  const [idx, setIdx] = useState(0);
  const season = seasons[Math.min(idx, seasons.length - 1)];
  if (!season) return null;
  const older = () => setIdx((i) => Math.min(i + 1, seasons.length - 1));
  const newer = () => setIdx((i) => Math.max(i - 1, 0));
  return (
    <>
      <div className="pf-seasnav">
        <button type="button" className="pf-btn" onClick={older} disabled={idx >= seasons.length - 1} aria-label="Earlier season">
          ‹
        </button>
        <span className="pf-seaslabel">
          {season.year} Season{season.current ? <span className="pf-live"> · in progress</span> : ''}
        </span>
        <button type="button" className="pf-btn" onClick={newer} disabled={idx <= 0} aria-label="Later season">
          ›
        </button>
      </div>

      <div className="pf-seassum">
        <b>
          {season.wins}–{season.losses}
          {season.ties ? `–${season.ties}` : ''}
        </b>
        {season.conference && (
          <span>
            {season.conference}
            {season.confWins + season.confLosses > 0 ? ` ${season.confWins}–${season.confLosses}` : ''}
          </span>
        )}
        {season.confStanding > 0 && season.conference !== 'Independent' && <span>{ord(season.confStanding)}</span>}
        {season.finalRank > 0 && season.finalRank <= 25 && (
          <span>
            {season.current ? '' : 'Final '}#{season.finalRank}
          </span>
        )}
        {season.coachName && <span>Coach {season.coachName}</span>}
        {season.pointsFor !== null && (
          <span>
            PF {season.pointsFor} · PA {season.pointsAgainst}
          </span>
        )}
        {season.postseason && (
          <span className="pf-post">{season.postseason.replace('— Win', '— won').replace('— Loss', '— lost')}</span>
        )}
      </div>

      {season.schedule.length > 0 ? (
        <div className="pf-scroll">
          <table className="pf-table">
            <thead>
              <tr>
                <th className="l">WK</th>
                <th className="l">OPPONENT</th>
                <th className="l">RESULT</th>
                <th className="l">TV</th>
                <th>ATT</th>
              </tr>
            </thead>
            <tbody>
              {season.schedule.map((g, i) => (
                <tr key={i}>
                  <td className="l">{g.weekType === 'RegularSeason' ? g.week : spaceOut(g.weekType)}</td>
                  <td className="l">
                    <span className="pf-va">{g.home ? 'vs' : 'at'}</span>{' '}
                    <NameLink req={g.opponentRow !== null ? { kind: 'school', row: g.opponentRow } : null}>
                      {g.opponent}
                    </NameLink>
                    {g.bowlName && <span className="pf-bowl"> · {g.bowlName}</span>}
                  </td>
                  <td className={`l pf-res ${g.outcome === 'W' ? 'w' : g.outcome === 'L' ? 'ls' : ''}`}>
                    {g.outcome ? `${g.outcome} ${g.scoreUs}–${g.scoreThem}` : '—'}
                  </td>
                  <td className="l">{g.network && g.network !== 'TBD' ? g.network : ''}</td>
                  <td>{g.attendance > 0 ? g.attendance.toLocaleString('en-US') : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="pf-none">
          The game keeps game-by-game results for the current season only; seasons played while the
          app is running are kept from here on.
        </div>
      )}

      {season.stats.length > 0 && (
        <>
          {season.stats.map((line) => (
            <div key={line.category}>
              <SectionTitle>{line.category}</SectionTitle>
              <div className="pf-ledger">
                {line.cells.map((c) => (
                  <div key={c.label}>
                    <b>{c.value}</b>
                    <span>{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      <SectionTitle>Year by Year</SectionTitle>
      <div className="pf-scroll">
        <table className="pf-table">
          <tbody>
            {seasons.map((y, i) => (
              <tr
                key={y.year}
                className={`pf-yearrow ${i === idx ? 'sel' : ''}`}
                onClick={() => setIdx(i)}
              >
                <td className="l">{y.year}</td>
                <td>
                  {y.wins}–{y.losses}
                  {y.ties ? `–${y.ties}` : ''}
                </td>
                <td className="l">
                  {y.conference}
                  {y.conference && y.confWins + y.confLosses > 0 ? ` (${y.confWins}–${y.confLosses})` : ''}
                </td>
                <td>{y.finalRank > 0 && y.finalRank <= 25 ? `#${y.finalRank}` : '—'}</td>
                <td className="l">{y.coachName}</td>
                <td className="l">{y.postseason.replace('— Win', '— won').replace('— Loss', '— lost')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// School

function SchoolBody({ s }: { s: SchoolProfile }) {
  const at = s.allTime;
  const ledger: [string, string][] = at
    ? [
        ['All-time', `${at.wins}–${at.losses}–${at.ties}`],
        ['At home', `${at.homeWins}–${at.homeLosses}`],
        ['Bowl record', `${at.bowlsWon}–${at.bowlsMade - at.bowlsWon}`],
        ['Natl titles', `${at.natlChampsWon}`],
        ['CFP trips', `${at.cfpMade}`],
        ['NY6 bowls won', `${at.ny6Won} of ${at.ny6Made}`],
        ['vs rivals', `${at.rivalryWins}–${at.rivalryLosses}`],
        ['Heismans', String(at.heismans)],
        ['All-Americans', String(at.allAmericans)],
        ['Players drafted', String(at.playersDrafted)],
        ['Weeks in Top 25', String(at.weeksRankedTop25)],
        ['Top-25 classes', String(at.top25Classes)]
      ]
    : [];
  return (
    <div className="pf-body">
      <div className="pf-head">
        <TeamLogo row={s.row} size={56} fallback={null} />
        <div className="pf-id">
          <div className="pf-name">
            {s.name} <span className="pf-nick">{s.nickName}</span>
          </div>
          <div className="pf-meta">
            {s.city && (
              <span>
                {s.city}, {s.state}
              </span>
            )}
            {s.conference && <span>{s.conference}</span>}
            {s.founded ? <span>Est. {s.founded}</span> : null}
          </div>
          <div className="pf-meta">
            {s.rank > 0 && s.rank <= 25 && <span>#{s.rank}</span>}
            <span>
              {s.wins}–{s.losses} this season
            </span>
            {s.confStanding > 0 && s.conference && s.conference !== 'Independent' && (
              <span>{ord(s.confStanding)} in conference</span>
            )}
            {s.offenseRank > 0 && <span>Off #{s.offenseRank}</span>}
            {s.defenseRank > 0 && <span>Def #{s.defenseRank}</span>}
          </div>
        </div>
      </div>
      <AccentRule a={s.colors.primary} b={s.colors.secondary ?? s.colors.primary} />

      {s.staff.length > 0 && (
        <div className="pf-staffline">
          {s.staff.map((m) => (
            <span key={m.row}>
              <span className="k">{m.role.replace('Coordinator', 'Coord.')}</span>{' '}
              <NameLink req={{ kind: 'coach', row: m.row }}>{m.name}</NameLink>
            </span>
          ))}
        </div>
      )}

      {s.seasons.length > 0 && <SeasonBrowser key={s.row} seasons={s.seasons} />}

      {ledger.length > 0 && (
        <>
          <SectionTitle>Program History</SectionTitle>
          <div className="pf-ledger">
            {ledger.map(([k, v]) => (
              <div key={k}>
                <b>{v}</b>
                <span>{k}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
