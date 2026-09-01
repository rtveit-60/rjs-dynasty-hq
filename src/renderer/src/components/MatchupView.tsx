import { useEffect, useMemo, useState } from 'react';
import { AWARD_NAMES } from '../../../shared/awards.ts';
import type {
  GameInfo,
  LeagueLeaders,
  MatchupExtras,
  SeasonSplits,
  Snapshot,
  TeamInfo
} from '../../../shared/types.ts';
import FieldGraphic from './FieldGraphic.tsx';
import { NameLink } from './ProfileModal.tsx';
import TeamLogo from './TeamLogo.tsx';
import { useHQ } from '../store.ts';

type School = NonNullable<Snapshot['school']>;

/**
 * THIS WEEK'S MATCHUP — the HQ school's featured game as a broadcast pregame
 * board: the home team's real field paint behind two columns of tiles (home
 * left, away right): team form, offense, defense, then the series history and
 * each side's standout players. Everything on the board is save fact — stats
 * from the game's own team splits and the leaders sweep, the series from the
 * save's rivalry rows plus banked seasons, standouts from real awards, the
 * game's record book, and leaderboard placement (projections say so).
 */

/** Pick the game the board features: this week's, else the next, else the last. */
function featuredGame(
  games: GameInfo[],
  row: number,
  week: number,
  weekType: string
): { game: GameInfo; label: string } | null {
  const mine = games
    .filter((g) => g.homeRow === row || g.awayRow === row)
    .sort((a, b) => a.week - b.week);
  if (!mine.length) return null;
  // Offseason CurrentWeek is a stage index, not a football week — no exact match.
  const inSeason = weekType !== 'OffSeason';
  const thisWeek = inSeason ? mine.find((g) => g.week === week) : undefined;
  if (thisWeek) {
    return {
      game: thisWeek,
      label: thisWeek.status === 'unplayed' ? "THIS WEEK'S MATCHUP" : 'THIS WEEK — FINAL'
    };
  }
  const next = mine.find((g) => g.status === 'unplayed' && g.week > week) ?? mine.find((g) => g.status === 'unplayed');
  if (next) return { game: next, label: 'NEXT MATCHUP' };
  const played = mine.filter((g) => g.status !== 'unplayed');
  if (played.length) return { game: played[played.length - 1], label: 'LAST MATCHUP — FINAL' };
  return null;
}

interface Form {
  wins: number;
  losses: number;
  pf: number;
  pa: number;
  games: number;
  streak: { won: boolean; n: number } | null;
}

/** Season form for one team, straight from the snapshot's game results. */
function formFor(games: GameInfo[], row: number): Form {
  const played = games
    .filter((g) => (g.homeRow === row || g.awayRow === row) && g.status !== 'unplayed')
    .sort((a, b) => a.week - b.week);
  let wins = 0;
  let pf = 0;
  let pa = 0;
  const results: boolean[] = [];
  for (const g of played) {
    const home = g.homeRow === row;
    const won = (g.status === 'home') === home;
    if (won) wins++;
    results.push(won);
    pf += home ? g.homeScore : g.awayScore;
    pa += home ? g.awayScore : g.homeScore;
  }
  let streak: Form['streak'] = null;
  if (results.length) {
    const last = results[results.length - 1];
    let n = 0;
    for (let i = results.length - 1; i >= 0 && results[i] === last; i--) n++;
    streak = { won: last, n };
  }
  return { wins, losses: played.length - wins, pf, pa, games: played.length, streak };
}

const per = (total: number, games: number, digits = 1): string =>
  games > 0 ? (total / games).toFixed(digits) : '—';
const pct = (num: number, den: number): string =>
  den > 0 ? `${Math.round((num / den) * 100)}%` : '—';

interface Standout {
  key: string;
  playerRow: number | null;
  name: string;
  note: string;
  /** Highlight tier: records and reigning awards burn hotter than list places. */
  hot: boolean;
}

const RECORD_CATS: Record<string, 'pass' | 'rush' | 'recv'> = {
  PassYards: 'pass',
  RushYards: 'rush',
  ReceiveYards: 'recv'
};

const RECORD_LABEL: Record<string, string> = {
  PassYards: 'passing yards',
  PassTds: 'passing TDs',
  RushYards: 'rushing yards',
  RushTds: 'rushing TDs',
  ReceiveYards: 'receiving yards',
  ReceiveTds: 'receiving TDs',
  Receptions: 'receptions',
  Sacks: 'sacks',
  Interceptions: 'interceptions'
};

const AWARD_RACES: { enumKey: string; cat: 'total' | 'pass' | 'rush' | 'recv' }[] = [
  { enumKey: 'HEISMAN', cat: 'total' },
  { enumKey: 'BEST_QB', cat: 'pass' },
  { enumKey: 'BEST_RB', cat: 'rush' },
  { enumKey: 'BEST_REC', cat: 'recv' }
];

const statLabel = (t: string): string => RECORD_LABEL[t] ?? t.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

/** Everything save-sourced that makes a player on this side worth a line. */
function standoutsFor(
  team: TeamInfo,
  snapshot: Snapshot,
  leaders: LeagueLeaders | null,
  extras: MatchupExtras | null
): Standout[] {
  const out: Standout[] = [];
  const eraStart = snapshot.season ? snapshot.season.seasonYear - (snapshot.season.dynastyYear - 1) : 0;

  // Record holders: a record-book row set during this dynasty, credited to this school.
  for (const r of extras?.records ?? []) {
    if (r.teamName !== team.displayName || (eraStart && r.year < eraStart)) continue;
    out.push({
      key: `rec-${r.scope}-${r.statType}`,
      playerRow: null,
      name: `${r.firstName} ${r.lastName}`.trim(),
      note: `Holds the FBS ${r.scope} record — ${r.value.toLocaleString()} ${statLabel(r.statType)} ('${String(r.year).slice(2)})`,
      hot: true
    });
  }

  // Reigning national award winners credited to this program — players only
  // (the show also crowns coaches; position reads HC/AC for those).
  for (const w of snapshot.annualAwards?.winners ?? []) {
    if (w.teamName !== team.displayName || w.position === 'HC' || w.position === 'AC') continue;
    out.push({
      key: `aw-${w.awardType}-${w.name}`,
      playerRow: null,
      name: w.name,
      note: `Reigning ${AWARD_NAMES[w.awardType] ?? w.awardType} winner ('${String(snapshot.annualAwards!.year).slice(2)})`,
      hot: true
    });
  }

  // This week's Players of the Week.
  for (const a of snapshot.weeklyAwards) {
    if (a.teamRow !== team.row) continue;
    out.push({
      key: `potw-${a.playerRow}-${a.side}`,
      playerRow: a.playerRow,
      name: a.name,
      note: `${a.confRow === null ? 'National' : 'Conference'} ${a.side === 'off' ? 'offensive' : 'defensive'} Player of the Week (wk ${a.week})`,
      hot: true
    });
  }

  if (leaders) {
    const catRows = new Map(leaders.categories.map((c) => [c.key, c] as const));

    // Award-race standing (the app's stat projections, labeled as such).
    for (const race of AWARD_RACES) {
      const rows = catRows.get(race.cat)?.rows ?? [];
      const idx = rows.findIndex((r) => r.teamRow === team.row);
      if (idx < 0 || idx > 3) continue;
      const r = rows[idx];
      out.push({
        key: `race-${race.enumKey}-${r.playerRow}`,
        playerRow: r.playerRow,
        name: r.name,
        note: `#${idx + 1} in the ${AWARD_NAMES[race.enumKey] ?? race.enumKey} watch (projected)`,
        hot: idx === 0
      });
    }

    // Chasing a season record: a leader within 70% of the book's mark.
    for (const rec of extras?.records ?? []) {
      if (rec.scope !== 'season') continue;
      const cat = RECORD_CATS[rec.statType];
      if (!cat) continue;
      const mine = (catRows.get(cat)?.rows ?? []).find((r) => r.teamRow === team.row);
      if (!mine || mine.value < rec.value * 0.7 || mine.value >= rec.value) continue;
      out.push({
        key: `chase-${rec.statType}-${mine.playerRow}`,
        playerRow: mine.playerRow,
        name: mine.name,
        note: `Chasing the FBS season record — ${mine.value.toLocaleString()} of ${rec.value.toLocaleString()} ${statLabel(rec.statType)}`,
        hot: true
      });
    }

    // National top-10 leaderboard spots.
    for (const c of leaders.categories) {
      c.rows.forEach((r, i) => {
        if (r.teamRow !== team.row || i > 9) return;
        out.push({
          key: `lead-${c.key}-${r.playerRow}`,
          playerRow: r.playerRow,
          name: r.name,
          note: `#${i + 1} nationally in ${c.label.toLowerCase()} (${r.value.toLocaleString()}${r.sub ? ` · ${r.sub}` : ''})`,
          hot: i === 0
        });
      });
    }
  }

  // One line per player: the first (highest-priority) fact wins.
  const seen = new Set<string>();
  return out
    .filter((s) => {
      const k = s.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 6);
}

function Tile({ title, tag, children }: { title: string; tag?: string | null; children: React.ReactNode }) {
  return (
    <div className="panel mu-tile">
      <div className="mu-tile-head">
        <span>{title}</span>
        {tag ? <span className="mu-tag">{tag}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="mu-row">
      <span className="k">{k}</span>
      <span className={`v${strong ? ' strong' : ''}`}>{v}</span>
    </div>
  );
}

function TeamHeadCell({ team, form, right }: { team: TeamInfo; form: Form; right?: boolean }) {
  return (
    <div className={`mu-team${right ? ' right' : ''}`}>
      <TeamLogo row={team.row} size={44} fallback={null} />
      <div className="mu-team-id">
        {team.rank > 0 && team.rank <= 25 && <span className="mu-rank">#{team.rank}</span>}
        <span className="mu-team-name">{team.displayName}</span>
        <span className="mu-team-rec">
          {form.wins}–{form.losses}
        </span>
      </div>
    </div>
  );
}

export default function MatchupView({ school }: { school: School }) {
  const snapshot = useHQ((s) => s.snapshot);
  const [leaders, setLeaders] = useState<LeagueLeaders | null>(null);
  const [extras, setExtras] = useState<MatchupExtras | null>(null);

  const row = school.team.row;
  const games = snapshot?.games ?? [];
  const week = snapshot?.season?.week ?? 0;
  const weekType = snapshot?.season?.weekType ?? '';
  const featured = useMemo(
    () => featuredGame(games, row, week, weekType),
    [games, row, week, weekType]
  );

  const homeRow = featured?.game.homeRow ?? -1;
  const awayRow = featured?.game.awayRow ?? -1;
  const parsedAt = snapshot?.parsedAt;

  useEffect(() => {
    let alive = true;
    void window.hq.getLeagueLeaders().then((l) => alive && setLeaders(l));
    return () => {
      alive = false;
    };
  }, [parsedAt]);

  useEffect(() => {
    setExtras(null);
    if (homeRow < 0 || awayRow < 0) return;
    // Guard for dev hot reload: a renderer newer than its preload has no
    // bridge method yet — the tab then renders from the snapshot alone.
    if (typeof window.hq.getMatchupExtras !== 'function') return;
    let alive = true;
    void window.hq.getMatchupExtras(homeRow, awayRow).then((x) => alive && setExtras(x));
    return () => {
      alive = false;
    };
  }, [homeRow, awayRow, parsedAt]);

  if (!snapshot || !featured) {
    return (
      <div className="empty">
        No scheduled game in the save right now — the board lights up when a schedule exists.
      </div>
    );
  }

  const { game, label } = featured;
  const teamsByRow = new Map(snapshot.teams.map((t) => [t.row, t] as const));
  const home = teamsByRow.get(game.homeRow);
  const away = teamsByRow.get(game.awayRow);
  if (!home || !away) return <div className="empty">Reading the matchup from the save…</div>;

  const homeForm = formFor(games, home.row);
  const awayForm = formFor(games, away.row);
  const oppRow = home.row === row ? away.row : home.row;
  const rivalry = school.history?.rivalries.find((r) => r.rivalRow === oppRow) ?? null;
  const seasonYear = snapshot.season?.seasonYear ?? 0;

  // The series list: banked prior seasons plus any earlier meeting this season.
  const meetings = [
    ...(extras?.meetings.filter((m) => m.year !== seasonYear) ?? []),
    ...games
      .filter(
        (g) =>
          g.status !== 'unplayed' &&
          g.week !== game.week &&
          ((g.homeRow === home.row && g.awayRow === away.row) ||
            (g.homeRow === away.row && g.awayRow === home.row))
      )
      .map((g) => ({
        year: seasonYear,
        week: g.week,
        weekType: g.weekType,
        homeRow: g.homeRow,
        awayRow: g.awayRow,
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        bowlName: g.bowlName ?? null
      }))
  ]
    .sort((a, b) => b.year - a.year || b.week - a.week)
    .slice(0, 8);

  const paneOrder: ['home' | 'away', TeamInfo, Form][] = [
    ['home', home, homeForm],
    ['away', away, awayForm]
  ];

  const splitsFor = (side: 'home' | 'away'): SeasonSplits | null =>
    side === 'home' ? (extras?.home ?? null) : (extras?.away ?? null);
  const totalsFor = (t: TeamInfo) => leaders?.teams.find((x) => x.teamRow === t.row) ?? null;

  const homeStandouts = standoutsFor(home, snapshot, leaders, extras);
  const awayStandouts = standoutsFor(away, snapshot, leaders, extras);

  const played = game.status !== 'unplayed';
  const rivalryName = rivalry ? (rivalry.secondaryName || rivalry.name) : null;

  return (
    <div className="mu-stage">
      <div className="mu-field" aria-hidden="true">
        <FieldGraphic team={home} />
      </div>

      <div className="panel mu-head">
        <TeamHeadCell team={home} form={homeForm} />
        <div className="mu-center">
          <div className="mu-label">{label}</div>
          {played ? (
            <div className="mu-score">
              {game.homeScore}
              <span className="mu-score-sep">–</span>
              {game.awayScore}
              {game.overtime && <span className="mu-ot">OT</span>}
            </div>
          ) : (
            <div className="mu-vs">VS</div>
          )}
          <div className="mu-sub">
            {game.bowlName ? `${game.bowlName} · ` : ''}
            {`Week ${game.week}`}
            {game.network ? ` · ${game.network}` : ''}
            {game.gotw ? ' · GAME OF THE WEEK' : ''}
          </div>
          {rivalryName && <div className="mu-rivalry-plate">{rivalryName.toUpperCase()}</div>}
        </div>
        <TeamHeadCell team={away} form={awayForm} right />
      </div>

      <div className="mu-cols-head">
        <span>HOME</span>
        <span>AWAY</span>
      </div>

      <div className="mu-grid">
        {paneOrder.map(([side, t, f]) => (
          <Tile key={`team-${side}`} title={`${t.shortName || t.displayName} · Team`}>
            <Row k="Record" v={`${f.wins}–${f.losses}`} strong />
            <Row k="AP rank" v={t.rank > 0 && t.rank <= 25 ? `#${t.rank}` : 'NR'} />
            <Row k="Points per game" v={per(f.pf, f.games)} />
            <Row k="Points allowed" v={per(f.pa, f.games)} />
            <Row
              k="Streak"
              v={f.streak ? `${f.streak.won ? 'W' : 'L'}${f.streak.n}` : '—'}
            />
          </Tile>
        ))}

        {paneOrder.map(([side, t]) => {
          const sp = splitsFor(side);
          const tot = totalsFor(t);
          const tag = sp?.scope === 'lastSeason' ? 'LAST SEASON' : null;
          return (
            <Tile key={`off-${side}`} title="Offense" tag={tag}>
              <Row k="Yards per game" v={sp ? per(sp.rushYds + sp.passYds, sp.games) : '—'} strong />
              <Row k="Passing YPG" v={sp ? per(sp.passYds, sp.games) : '—'} />
              <Row k="Rushing YPG" v={sp ? per(sp.rushYds, sp.games) : '—'} />
              <Row k="3rd down" v={sp ? pct(sp.thirdConv, sp.thirdDowns) : '—'} />
              <Row k="Red zone TD" v={sp ? pct(sp.redzoneTds, sp.redzoneTrips) : '—'} />
              <Row k="Offensive TDs" v={tot ? String(tot.offTds) : '—'} />
            </Tile>
          );
        })}

        {paneOrder.map(([side, t]) => {
          const sp = splitsFor(side);
          const tot = totalsFor(t);
          const tag = sp?.scope === 'lastSeason' ? 'LAST SEASON' : null;
          const margin = sp ? sp.takeaways - sp.giveaways : null;
          return (
            <Tile key={`def-${side}`} title="Defense" tag={tag}>
              <Row
                k="Yards allowed"
                v={sp ? per(sp.defRushYds + sp.defPassYds, sp.games) : '—'}
                strong
              />
              <Row k="vs pass" v={sp ? per(sp.defPassYds, sp.games) : '—'} />
              <Row k="vs run" v={sp ? per(sp.defRushYds, sp.games) : '—'} />
              <Row k="Sacks" v={sp ? String(sp.sacks) : tot ? String(tot.sacks) : '—'} />
              <Row k="Interceptions" v={tot ? String(tot.ints) : '—'} />
              <Row
                k="Turnover margin"
                v={margin === null ? '—' : margin > 0 ? `+${margin}` : String(margin)}
              />
            </Tile>
          );
        })}
      </div>

      <div className="panel mu-tile mu-series">
        <div className="mu-tile-head">
          <span>Matchup History</span>
          {rivalry && (
            <span className="mu-tag">
              {rivalry.usWins > rivalry.themWins
                ? `${school.team.shortName || school.team.displayName} lead ${rivalry.usWins}–${rivalry.themWins}`
                : rivalry.themWins > rivalry.usWins
                  ? `${teamsByRow.get(oppRow)?.shortName ?? 'Rivals'} lead ${rivalry.themWins}–${rivalry.usWins}`
                  : `Series tied ${rivalry.usWins}–${rivalry.themWins}`}
            </span>
          )}
        </div>
        {rivalry && (
          <div className="mu-series-line">
            {rivalry.name}
            {rivalry.streakLength > 1 &&
              rivalry.streakOurs !== null &&
              ` · ${rivalry.streakOurs ? school.team.shortName : teamsByRow.get(oppRow)?.shortName} have won ${rivalry.streakLength} straight`}
            {rivalry.lastScoreUs + rivalry.lastScoreThem > 0 &&
              ` · last meeting ${Math.max(rivalry.lastScoreUs, rivalry.lastScoreThem)}–${Math.min(rivalry.lastScoreUs, rivalry.lastScoreThem)}`}
          </div>
        )}
        {meetings.length ? (
          <div className="mu-meetings">
            {meetings.map((m) => {
              const mh = teamsByRow.get(m.homeRow);
              const ma = teamsByRow.get(m.awayRow);
              const homeWon = m.homeScore >= m.awayScore;
              const w = homeWon ? mh : ma;
              const l = homeWon ? ma : mh;
              const ws = Math.max(m.homeScore, m.awayScore);
              const ls = Math.min(m.homeScore, m.awayScore);
              return (
                <div key={`${m.year}-${m.week}`} className="mu-meeting">
                  <span className="yr">’{String(m.year).slice(2)}</span>
                  <span className="line">
                    <b>{w?.shortName ?? '—'}</b> {ws}, {l?.shortName ?? '—'} {ls}
                  </span>
                  <span className="ctx">{m.bowlName ?? (m.weekType === 'RegularSeason' ? `wk ${m.week}` : m.weekType)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          !rivalry && <div className="mu-none">First meeting on record in this dynasty.</div>
        )}
      </div>

      <div className="mu-grid">
        {[
          ['home', home, homeStandouts] as const,
          ['away', away, awayStandouts] as const
        ].map(([side, t, list]) => (
          <Tile key={`stars-${side}`} title={`${t.shortName || t.displayName} · Players to Watch`}>
            {list.length ? (
              list.map((s) => (
                <div key={s.key} className={`mu-star${s.hot ? ' hot' : ''}`}>
                  <span className="nm">
                    {s.playerRow !== null ? (
                      <NameLink req={{ kind: 'player', row: s.playerRow }}>{s.name}</NameLink>
                    ) : (
                      s.name
                    )}
                  </span>
                  <span className="note">{s.note}</span>
                </div>
              ))
            ) : (
              <div className="mu-none">No award winners or national leaders on this side yet.</div>
            )}
          </Tile>
        ))}
      </div>
    </div>
  );
}
