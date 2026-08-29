import { useEffect, useMemo, useState } from 'react';
import type { LeagueLeaders, MediaEvent } from '../../../shared/types.ts';
import { brandName } from '../lib/brands.ts';
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

/**
 * The league dashboard: ticker up top, the lead story beside your program's
 * numbers, then movers, leaders and the award watch. Everything reads from
 * the snapshot except the leaders sweep, fetched once per parse.
 */
export default function MediaHQ({
  media,
  onOpenWire
}: {
  media: MediaEvent[];
  onOpenWire: () => void;
}) {
  const snapshot = useHQ((s) => s.snapshot);
  const parsedAt = useHQ((s) => s.snapshot?.parsedAt);
  const pack = useHQ((s) => s.settings?.brandPack ?? 'real');
  const [leaders, setLeaders] = useState<LeagueLeaders | null>(null);

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

  const record = useMemo(() => {
    let w = 0;
    let l = 0;
    for (const g of games) {
      if (g.status === 'unplayed' || userRow === null) continue;
      if (g.homeRow !== userRow && g.awayRow !== userRow) continue;
      const won = (g.status === 'home') === (g.homeRow === userRow);
      won ? w++ : l++;
    }
    return { w, l };
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

  const movers = useMemo(
    () =>
      teams
        .filter((t) => (t.rank > 0 && t.rank <= 25) || (t.lastWeekRank > 0 && t.lastWeekRank <= 25))
        .map((t) => ({ t, delta: t.lastWeekRank > 0 && t.rank > 0 ? t.lastWeekRank - t.rank : t.rank > 0 ? 99 : -99 }))
        .filter((m) => m.delta !== 0)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 7),
    [teams]
  );

  const me = userRow !== null ? teams.find((t) => t.row === userRow) : null;
  const rankDelta = me && me.rank > 0 && me.lastWeekRank > 0 ? me.lastWeekRank - me.rank : 0;
  const commits = (school?.recruiting?.recruits ?? []).filter(
    (r) => r.committedTo === school?.team.longName
  ).length;
  const boardCount = school?.board?.targets.length ?? 0;
  const lead = media[0] ?? null;
  const wire = media.slice(lead ? 1 : 0, (lead ? 1 : 0) + 4);

  return (
    <>
      <Ticker teams={teams} games={games} leaders={leaders} />

      <div className="hq-cols">
        <div className="hq-lead">
          {lead ? (
            <Story e={lead} lead />
          ) : (
            <div className="empty">The wire fills in after your next save write.</div>
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
              {record.w}–{record.l}
            </span>
            <span className="k">AP POLL</span>
            <span className="dots" />
            <span className="v">
              {me && me.rank > 0 ? `#${me.rank}` : 'NR'}
              {rankDelta > 0 && <span className="up"> ▲{rankDelta}</span>}
              {rankDelta < 0 && <span className="dn"> ▼{-rankDelta}</span>}
            </span>
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
            <span className="k">COMMITS</span>
            <span className="dots" />
            <span className="v">{commits}</span>
            <span className="k">BOARD</span>
            <span className="dots" />
            <span className="v">{boardCount}</span>
          </div>
        </div>
      </div>

      <div className="hq-mods">
        <div className="hqm">
          <div className="hqm-h">
            <span>POLL MOVERS</span>
            <span className="r">WK {snapshot?.season?.week ?? ''}</span>
          </div>
          <div className="hqm-body">
            {movers.length === 0 && <div className="hqm-wait">No movement this week.</div>}
            {movers.map(({ t, delta }) => (
              <div key={t.row} className="hqm-row">
                <span className="i">{t.rank > 0 ? t.rank : '–'}</span>
                <span className="n">
                  <NameLink req={{ kind: 'school', row: t.row }}>{t.displayName}</NameLink>
                </span>
                <span className="v">
                  {delta === 99 ? (
                    <span className="up">NEW</span>
                  ) : delta === -99 ? (
                    <span className="dn">OUT</span>
                  ) : delta > 0 ? (
                    <span className="up">▲{delta}</span>
                  ) : (
                    <span className="dn">▼{-delta}</span>
                  )}
                </span>
              </div>
            ))}
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
                Watch lists projected from this season's stats, using the game's own award names.
                The game itself crowns winners at the national awards show; until then these
                standings are the app's read, not the game's.
              </p>
            </InfoDot>
          </span>
          <span className="r">PROJECTED</span>
        </div>
        <div className="hq-award-cols">
          {(
            [
              ['Best Quarterback', 'pass'],
              ['Best Running Back', 'rush'],
              ['Best Receiver', 'recv']
            ] as const
          ).map(([label, key]) => {
            const cat = leaders?.categories.find((c) => c.key === key);
            return (
              <div key={key} className="hqm-block">
                <div className="hqm-sub">{label}</div>
                {(cat?.rows ?? []).slice(0, 3).map((r, i) => (
                  <div key={r.playerRow} className="hqm-row">
                    <span className="i">{i + 1}</span>
                    <span className="n">
                      <NameLink req={{ kind: 'player', row: r.playerRow }}>{r.name}</NameLink>
                      <span className="t"> · {r.team}</span>
                    </span>
                    <span className="v">{fmtVal(key, r.value)}</span>
                  </div>
                ))}
                {!cat?.rows.length && <div className="hqm-wait">Computing…</div>}
              </div>
            );
          })}
        </div>
      </div>

      {wire.length > 0 && (
        <div className="hqm hq-wirefeed">
          <div className="hqm-h">
            <span>LATEST FROM THE WIRE</span>
            <button className="hqm-link" onClick={onOpenWire}>
              OPEN THE WIRE →
            </button>
          </div>
          <div className="hqm-body">
            {wire.map((e) => (
              <button key={e.id} className="hq-headline" onClick={onOpenWire}>
                <span className="o">{e.byline ? e.byline.outletName : brandName(e.outlet, pack)}</span>
                <span className="h">{e.headline}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
