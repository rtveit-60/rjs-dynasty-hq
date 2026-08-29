import { useEffect, useMemo, useRef, useState } from 'react';
import type { LeagueLeaders, MediaEvent } from '../../../shared/types.ts';
import { AWARD_NAMES } from '../../../shared/awards.ts';
import { useHQ } from '../store.ts';
import InfoDot from './InfoDot.tsx';
import { NameLink } from './ProfileModal.tsx';
import Story from './Story.tsx';
import Ticker from './Ticker.tsx';

const fmtVal = (key: string, v: number): string =>
  key === 'sacks' ? String(Math.round(v * 10) / 10) : v.toLocaleString('en-US');

function LeaderList({
  leaders,
  keys,
  count
}: {
  leaders: LeagueLeaders | null;
  keys: string[];
  count: number;
}) {
  if (!leaders) return <div className="hqm-wait">Computing season leaders…</div>;
  return (
    <>
      {keys.map((k) => {
        const cat = leaders.categories.find((c) => c.key === k);
        if (!cat || !cat.rows.length) return null;
        return (
          <div key={k} className="hqm-block">
            <div className="hqm-sub">{cat.label}</div>
            {cat.rows.slice(0, count).map((r, i) => (
              <div key={r.playerRow} className="hqm-row">
                <span className="i">{i + 1}</span>
                <span className="n">
                  <NameLink req={{ kind: 'player', row: r.playerRow }}>{r.name}</NameLink>
                  <span className="t"> · {r.team}</span>
                </span>
                <span className="v">{fmtVal(cat.key, r.value)}</span>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

/** The awards module: the game's own award names over stat-projected watch lists. */
const AWARD_BAND: { enumKey: string; cat: 'total' | 'pass' | 'rush' | 'recv' }[] = [
  { enumKey: 'HEISMAN', cat: 'total' },
  { enumKey: 'BEST_QB', cat: 'pass' },
  { enumKey: 'BEST_RB', cat: 'rush' },
  { enumKey: 'BEST_REC', cat: 'recv' }
];

/**
 * The league dashboard: ticker up top, headlines beside your program's season
 * numbers, then the full Top 25, leaders and the award watch. Everything reads
 * from the snapshot except the leaders sweep, fetched once per parse.
 */
export default function MediaHQ({
  media,
  onOpenWire,
  onOpenStory
}: {
  media: MediaEvent[];
  onOpenWire: () => void;
  onOpenStory?: (e: MediaEvent) => void;
}) {
  const snapshot = useHQ((s) => s.snapshot);
  const parsedAt = useHQ((s) => s.snapshot?.parsedAt);
  const [leaders, setLeaders] = useState<LeagueLeaders | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const page = (dir: number) =>
    railRef.current?.scrollBy({ left: dir * railRef.current.clientWidth, behavior: 'smooth' });

  useEffect(() => {
    let alive = true;
    void window.hq
      .getLeagueLeaders()
      .then((l) => alive && setLeaders(l))
      .catch(() => alive && setLeaders(null));
    return () => {
      alive = false;
    };
  }, [parsedAt]);

  const teams = snapshot?.teams ?? [];
  const games = snapshot?.games ?? [];
  const school = snapshot?.school;
  const userRow = school?.team.row ?? null;

  const season = useMemo(() => {
    let w = 0;
    let l = 0;
    let pf = 0;
    let pa = 0;
    const results: boolean[] = [];
    for (const g of [...games].sort((a, b) => a.week - b.week)) {
      if (g.status === 'unplayed' || userRow === null) continue;
      if (g.homeRow !== userRow && g.awayRow !== userRow) continue;
      const won = (g.status === 'home') === (g.homeRow === userRow);
      won ? w++ : l++;
      results.push(won);
      pf += g.homeRow === userRow ? g.homeScore : g.awayScore;
      pa += g.homeRow === userRow ? g.awayScore : g.homeScore;
    }
    let streak = 0;
    for (let i = results.length - 1; i >= 0 && results[i] === results[results.length - 1]; i--) streak++;
    const streakLabel = results.length ? (results[results.length - 1] ? 'W' : 'L') + streak : '—';
    return { w, l, pf, pa, games: w + l, streakLabel };
  }, [games, userRow]);

  const nextGame = useMemo(() => {
    if (userRow === null) return null;
    const mine = games
      .filter((g) => g.status === 'unplayed' && (g.homeRow === userRow || g.awayRow === userRow))
      .sort((a, b) => a.week - b.week)[0];
    if (!mine) return null;
    const oppRow = mine.homeRow === userRow ? mine.awayRow : mine.homeRow;
    const opp = teams.find((t) => t.row === oppRow);
    return { at: mine.homeRow !== userRow, opp, week: mine.week };
  }, [games, teams, userRow]);

  const top25 = useMemo(
    () => teams.filter((t) => t.rank > 0 && t.rank <= 25).sort((a, b) => a.rank - b.rank),
    [teams]
  );
  const records = useMemo(() => {
    const out = new Map<number, { w: number; l: number }>();
    for (const g of games) {
      if (g.status === 'unplayed') continue;
      const bump = (row: number, won: boolean) => {
        const r = out.get(row) ?? { w: 0, l: 0 };
        won ? r.w++ : r.l++;
        out.set(row, r);
      };
      bump(g.homeRow, g.status === 'home');
      bump(g.awayRow, g.status === 'away');
    }
    return out;
  }, [games]);

  const me = userRow !== null ? teams.find((t) => t.row === userRow) : null;
  const rankDelta = me && me.rank > 0 && me.lastWeekRank > 0 ? me.lastWeekRank - me.rank : 0;
  const mine = userRow !== null ? leaders?.teams.find((t) => t.teamRow === userRow) : null;
  const per = (v: number): string => (season.games > 0 ? (v / season.games).toFixed(1) : '—');
  const stat = (v: number | undefined, f: (n: number) => string = String): string =>
    leaders && mine ? f(v ?? 0) : '…';
  const sp = school?.splits?.scope === 'current' && (school?.splits?.games ?? 0) > 0 ? school!.splits : null;
  const pctOf = (part: number, whole: number): string =>
    whole > 0 ? Math.round((part / whole) * 100) + '%' : '—';

  return (
    <>
      <Ticker teams={teams} games={games} leaders={leaders} />

      <div className="hq-cols">
        <div className="hqm hq-heads">
          <div className="hqm-h">
            <span>HEADLINES</span>
            <span className="hq-pager">
              <button className="hqm-link" onClick={() => page(-1)} aria-label="Previous story">
                ←
              </button>
              <button className="hqm-link" onClick={() => page(1)} aria-label="Next story">
                →
              </button>
              <button className="hqm-link" onClick={onOpenWire}>
                OPEN THE WIRE →
              </button>
            </span>
          </div>
          {media.length ? (
            <div className="hq-scroll" ref={railRef}>
              {media.slice(0, 8).map((e) => (
                <div key={e.id} className="hq-card">
                  <Story e={e} lead={false} onOpen={onOpenStory} />
                </div>
              ))}
            </div>
          ) : (
            <div className="hqm-wait" style={{ padding: '14px 12px' }}>
              The wire fills in after your next save write.
            </div>
          )}
        </div>
        <div className="hqm">
          <div className="hqm-h">
            <span>YOUR PROGRAM</span>
            {me && me.rank > 0 && <span className="r">#{me.rank} AP</span>}
          </div>
          <div className="hqm-kv">
            <span className="k">RECORD</span>
            <span className="dots" />
            <span className="v">
              {season.w}–{season.l}
            </span>
            <span className="k">AP POLL</span>
            <span className="dots" />
            <span className="v">
              {me && me.rank > 0 ? `#${me.rank}` : 'NR'}
              {rankDelta > 0 && <span className="up"> ▲{rankDelta}</span>}
              {rankDelta < 0 && <span className="dn"> ▼{-rankDelta}</span>}
            </span>
            <span className="k">STREAK</span>
            <span className="dots" />
            <span className="v">{season.streakLabel}</span>
            <span className="k">NEXT UP</span>
            <span className="dots" />
            <span className="v">
              {nextGame && nextGame.opp ? (
                <>
                  {nextGame.at ? 'at ' : 'vs '}
                  <NameLink req={{ kind: 'school', row: nextGame.opp.row }}>
                    {nextGame.opp.shortName || nextGame.opp.displayName}
                  </NameLink>{' '}
                  · WK {nextGame.week}
                </>
              ) : (
                '—'
              )}
            </span>
            <span className="k">PPG</span>
            <span className="dots" />
            <span className="v">{season.games > 0 ? (season.pf / season.games).toFixed(1) : '—'}</span>
            <span className="k">PTS ALLOWED</span>
            <span className="dots" />
            <span className="v">{season.games > 0 ? (season.pa / season.games).toFixed(1) : '—'}</span>
            <span className="k">TOTAL YPG</span>
            <span className="dots" />
            <span className="v">{stat((mine?.passYds ?? 0) + (mine?.rushYds ?? 0), per)}</span>
            <span className="k">PASS YPG</span>
            <span className="dots" />
            <span className="v">{stat(mine?.passYds, per)}</span>
            <span className="k">RUSH YPG</span>
            <span className="dots" />
            <span className="v">{stat(mine?.rushYds, per)}</span>
            <span className="k">OFF TDS</span>
            <span className="dots" />
            <span className="v">{stat(mine?.offTds)}</span>
            <span className="k">FGS</span>
            <span className="dots" />
            <span className="v">{stat(mine?.fgs)}</span>
            <span className="k">3RD DOWN</span>
            <span className="dots" />
            <span className="v">{sp ? pctOf(sp.thirdConv, sp.thirdDowns) : '—'}</span>
            <span className="k">TO MARGIN</span>
            <span className="dots" />
            <span className="v">
              {sp ? (sp.takeaways - sp.giveaways > 0 ? '+' : '') + (sp.takeaways - sp.giveaways) : '—'}
            </span>
            <span className="k">SACKS</span>
            <span className="dots" />
            <span className="v">{stat(mine?.sacks, (n) => String(Math.round(n * 10) / 10))}</span>
            <span className="k">INTS</span>
            <span className="dots" />
            <span className="v">{stat(mine?.ints)}</span>
          </div>
        </div>
      </div>

      <div className="hq-mods">
        <div className="hqm">
          <div className="hqm-h">
            <span>AP TOP 25</span>
            <span className="r">WK {snapshot?.season?.week ?? ''}</span>
          </div>
          <div className="hqm-body hq-top25">
            {top25.map((t) => {
              const rec = records.get(t.row);
              const delta = t.lastWeekRank > 0 ? t.lastWeekRank - t.rank : 0;
              return (
                <div key={t.row} className="hqm-row">
                  <span className="i">{t.rank}</span>
                  <span className="n">
                    <NameLink req={{ kind: 'school', row: t.row }}>{t.displayName}</NameLink>
                    {rec && (
                      <span className="t">
                        {' '}
                        {rec.w}–{rec.l}
                      </span>
                    )}
                  </span>
                  <span className="v">
                    {t.lastWeekRank === 0 ? (
                      <span className="up">NEW</span>
                    ) : delta > 0 ? (
                      <span className="up">▲{delta}</span>
                    ) : delta < 0 ? (
                      <span className="dn">▼{-delta}</span>
                    ) : (
                      <span style={{ color: 'var(--ink-3)' }}>—</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="hqm">
          <div className="hqm-h">
            <span>OFFENSE LEADERS</span>
          </div>
          <div className="hqm-body">
            <LeaderList leaders={leaders} keys={['pass', 'rush', 'recv']} count={3} />
          </div>
        </div>
        <div className="hqm">
          <div className="hqm-h">
            <span>DEFENSE LEADERS</span>
          </div>
          <div className="hqm-body">
            <LeaderList leaders={leaders} keys={['tackles', 'sacks', 'ints']} count={3} />
          </div>
        </div>
      </div>

      <div className="hqm hq-awards">
        <div className="hqm-h">
          <span>
            AWARD RACES{' '}
            <InfoDot title="Award races">
              <p>
                The award names are the game's own, read from its data. The standings are watch
                lists projected from this season's stats; the game crowns real winners at the
                national awards show.
              </p>
            </InfoDot>
          </span>
          <span className="r">PROJECTED</span>
        </div>
        <div className="hq-award-cols">
          {AWARD_BAND.map(({ enumKey, cat }) => {
            const c = leaders?.categories.find((x) => x.key === cat);
            return (
              <div key={enumKey} className="hqm-block">
                <div className="hqm-sub">{AWARD_NAMES[enumKey] ?? enumKey}</div>
                {(c?.rows ?? []).slice(0, 3).map((r, i) => (
                  <div key={r.playerRow} className="hqm-row">
                    <span className="i">{i + 1}</span>
                    <span className="n">
                      <NameLink req={{ kind: 'player', row: r.playerRow }}>{r.name}</NameLink>
                      <span className="t"> · {r.team}</span>
                    </span>
                    <span className="v">{fmtVal(cat, r.value)}</span>
                  </div>
                ))}
                {!c?.rows.length && <div className="hqm-wait">Computing…</div>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
