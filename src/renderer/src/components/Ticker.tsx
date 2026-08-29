import { useMemo, useState } from 'react';
import type { GameInfo, LeagueLeaders, TeamInfo } from '../../../shared/types.ts';
import { AWARD_SHORT } from '../../../shared/awards.ts';
import { NameLink } from './ProfileModal.tsx';

type Mode = 'top25' | 'leaders' | 'awards';

const MODE_LABEL: Record<Mode, string> = {
  top25: 'TOP 25',
  leaders: 'STAT LEADERS',
  awards: 'AWARD RACES'
};

/**
 * Projection watch lists for the award races. The names are the game's own
 * (AWARD_SHORT, generated from its data); the standings are ours, computed
 * from season stats — the game crowns real winners at the awards show.
 */
const AWARD_WATCH: { enumKey: string; cat: LeagueLeaders['categories'][number]['key'] }[] = [
  { enumKey: 'HEISMAN', cat: 'total' },
  { enumKey: 'BEST_QB', cat: 'pass' },
  { enumKey: 'BEST_RB', cat: 'rush' },
  { enumKey: 'BEST_REC', cat: 'recv' },
  { enumKey: 'BEST_LB', cat: 'tackles' },
  { enumKey: 'BEST_DE', cat: 'sacks' },
  { enumKey: 'BEST_DB', cat: 'ints' }
];

function shortTeam(t: TeamInfo | undefined): string {
  return t?.shortName || t?.displayName || '';
}

const fmtVal = (key: string, v: number): string =>
  key === 'sacks' ? String(Math.round(v * 10) / 10) : v.toLocaleString('en-US');

/**
 * The Media HQ ticker. The cap opens a mode menu — Top 25, Stat Leaders,
 * Award Races — and the strip marquees its items, pausing on hover.
 */
export default function Ticker({
  teams,
  games,
  leaders
}: {
  teams: TeamInfo[];
  games: GameInfo[];
  leaders: LeagueLeaders | null;
}) {
  const [mode, setMode] = useState<Mode>('top25');
  const [menuOpen, setMenuOpen] = useState(false);

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

  const top25 = useMemo(
    () =>
      teams
        .filter((t) => t.rank > 0 && t.rank <= 25)
        .sort((a, b) => a.rank - b.rank),
    [teams]
  );

  const items = useMemo(() => {
    if (mode === 'top25') {
      return top25.map((t) => {
        const rec = records.get(t.row);
        const delta = t.lastWeekRank > 0 ? t.lastWeekRank - t.rank : 0;
        return (
          <span key={`t${t.row}`} className="tk-item">
            <span className="rk">{t.rank}</span>
            <NameLink req={{ kind: 'school', row: t.row }} className="tk-team">
              {shortTeam(t)}
            </NameLink>
            {rec && (
              <span className="rec">
                {rec.w}–{rec.l}
              </span>
            )}
            {delta > 0 && <span className="up">▲{delta}</span>}
            {delta < 0 && <span className="dn">▼{-delta}</span>}
          </span>
        );
      });
    }
    if (!leaders) {
      return [
        <span key="wait" className="tk-item">
          <span className="rec">Computing season leaders…</span>
        </span>
      ];
    }
    if (mode === 'leaders') {
      return leaders.categories.flatMap((c) =>
        c.rows.slice(0, 2).map((r, i) => (
          <span key={`${c.key}${i}`} className="tk-item">
            <span className="rk">{c.short}</span>
            <NameLink req={{ kind: 'player', row: r.playerRow }} className="tk-team">
              {r.name}
            </NameLink>
            <span className="rec">{r.team}</span>
            <b>{fmtVal(c.key, r.value)}</b>
          </span>
        ))
      );
    }
    return AWARD_WATCH.flatMap((a) => {
      const cat = leaders.categories.find((c) => c.key === a.cat);
      const r = cat?.rows[0];
      if (!r) return [];
      return [
        <span key={a.cat} className="tk-item">
          <span className="rk">{(AWARD_SHORT[a.enumKey] ?? a.enumKey).toUpperCase()}</span>
          <NameLink req={{ kind: 'player', row: r.playerRow }} className="tk-team">
            {r.name}
          </NameLink>
          <span className="rec">{r.team}</span>
          <b>{fmtVal(a.cat, r.value)}</b>
          <span className="proj">PROJ</span>
        </span>
      ];
    });
  }, [mode, top25, records, leaders]);

  // Marquee only when there is something to scroll; content doubles for a
  // seamless loop, duration scales with length.
  const duration = Math.max(24, items.length * 4);

  return (
    <div className="ticker">
      <span className="tk-cap" onClick={() => setMenuOpen((o) => !o)}>
        {MODE_LABEL[mode]} <span className="car">▾</span>
      </span>
      {menuOpen && (
        <>
          <div className="tk-menu-veil" onClick={() => setMenuOpen(false)} />
          <div className="tk-menu">
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
              <button
                key={m}
                className={m === mode ? 'active' : ''}
                onClick={() => {
                  setMode(m);
                  setMenuOpen(false);
                }}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="tk-strip">
        <div className="tk-track" style={{ animationDuration: `${duration}s` }}>
          {items}
          {items}
        </div>
      </div>
    </div>
  );
}
