import { useEffect, useMemo, useState } from 'react';
import {
  CFP_ROUND_LABEL,
  buildCfpBracket,
  hasCfpGames,
  linkCfpTree,
  type BracketNode,
  type CfpBracket,
  type CfpGame,
  type CfpRound
} from '../../../shared/cfp-bracket.ts';
import { CfpMarkGroup } from './BowlIcon.tsx';
import { NameLink } from './ProfileModal.tsx';
import TeamLogo from './TeamLogo.tsx';
import { useHQ } from '../store.ts';

const ROUND_ORDER: CfpRound[] = ['first', 'quarter', 'semi', 'final'];

/** Resolve a team row to its team record from the snapshot's team list. */
function useTeamLookup() {
  const teams = useHQ((s) => s.snapshot?.teams);
  return useMemo(() => {
    const byRow = new Map((teams ?? []).map((t) => [t.row, t] as const));
    return (row: number | null) => (row === null ? null : (byRow.get(row) ?? null));
  }, [teams]);
}

/**
 * Vertical order per round. When the bracket links into a tree (final exists)
 * a top-to-bottom traversal orders each round so winners sit beside the game
 * they came from; otherwise games keep their natural order.
 */
function orderByRound(bracket: CfpBracket, tree: BracketNode | null): Record<CfpRound, CfpGame[]> {
  const out: Record<CfpRound, CfpGame[]> = { first: [], quarter: [], semi: [], final: [] };
  if (!tree) {
    for (const g of bracket.games) out[g.round].push(g);
    return out;
  }
  // Depth-first, top slot before bottom — deepest round first so each column
  // reads top-to-bottom in bracket order.
  const walk = (node: BracketNode) => {
    if (node.top.feeder) walk(node.top.feeder);
    if (node.bottom.feeder) walk(node.bottom.feeder);
    out[node.game.round].push(node.game);
  };
  walk(tree);
  return out;
}

function GameCard({ game, lookup }: { game: CfpGame; lookup: ReturnType<typeof useTeamLookup> }) {
  const rows: [number, number][] = [
    [game.homeRow, game.homeScore],
    [game.awayRow, game.awayScore]
  ];
  return (
    <div className={`cfp-game${game.played ? '' : ' pending'}`}>
      {rows.map(([row, score], i) => {
        const team = lookup(row);
        const won = game.winnerRow === row;
        return (
          <div key={i} className={`cfp-slot${won ? ' won' : ''}`}>
            <TeamLogo row={row} size={18} fallback={null} />
            <span className="cfp-team">
              <NameLink req={{ kind: 'school', row }}>
                {team?.shortName || team?.displayName || `#${row}`}
              </NameLink>
            </span>
            <span className="cfp-score">{game.played ? score : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

function Champion({ bracket, lookup }: { bracket: CfpBracket; lookup: ReturnType<typeof useTeamLookup> }) {
  if (bracket.championRow === null) return null;
  const team = lookup(bracket.championRow);
  return (
    <div className="cfp-champ">
      <svg width={78} height={36} viewBox="0 0 120 54" className="cfp-champ-mark" aria-hidden="true">
        <CfpMarkGroup cx={60} bottom={54} h={54} />
      </svg>
      <div className="cfp-champ-body">
        <div className="cfp-champ-kicker">National Champion</div>
        <div className="cfp-champ-name">
          <TeamLogo row={bracket.championRow} size={26} fallback={null} />
          <NameLink req={{ kind: 'school', row: bracket.championRow }}>
            {team?.displayName || team?.shortName || `#${bracket.championRow}`}
          </NameLink>
        </div>
      </div>
    </div>
  );
}

export default function CfpBracketView() {
  const snapshot = useHQ((s) => s.snapshot);
  const lookup = useTeamLookup();
  const [banked, setBanked] = useState<CfpBracket | null>(null);
  const [loadedBanked, setLoadedBanked] = useState(false);

  const currentGames = snapshot?.games ?? [];
  const seasonYear = snapshot?.season?.seasonYear ?? 0;
  const current = useMemo(
    () => (hasCfpGames(currentGames) ? buildCfpBracket(currentGames, seasonYear, true) : null),
    [currentGames, seasonYear]
  );

  // Reach for a banked bracket only when the current season has no playoff yet.
  const parsedAt = snapshot?.parsedAt;
  useEffect(() => {
    if (current) {
      setBanked(null);
      setLoadedBanked(true);
      return;
    }
    let alive = true;
    setLoadedBanked(false);
    if (typeof window.hq.getBankedCfpBracket !== 'function') {
      setLoadedBanked(true);
      return;
    }
    void window.hq.getBankedCfpBracket().then((b) => {
      if (!alive) return;
      setBanked(b);
      setLoadedBanked(true);
    });
    return () => {
      alive = false;
    };
  }, [current, parsedAt]);

  const bracket = current ?? banked;

  if (!bracket) {
    return (
      <div className="empty" style={{ marginTop: 20 }}>
        {loadedBanked
          ? 'No playoff on record yet — the bracket fills in once the season reaches the College Football Playoff.'
          : 'Reading the bracket…'}
      </div>
    );
  }

  const tree = linkCfpTree(bracket);
  const ordered = orderByRound(bracket, tree);

  return (
    <div className="cfp-wrap">
      <div className="cfp-head">
        <div className="cfp-title">
          {bracket.seasonYear} College Football Playoff
          {!bracket.isCurrent && <span className="cfp-past"> · last completed</span>}
        </div>
        <Champion bracket={bracket} lookup={lookup} />
      </div>

      <div className="cfp-board">
        {ROUND_ORDER.map((round) => {
          const games = ordered[round];
          if (!games.length) return null;
          return (
            <div key={round} className={`cfp-col cfp-col-${round}`}>
              <div className="cfp-col-head">{CFP_ROUND_LABEL[round]}</div>
              <div className="cfp-col-games">
                {games.map((g, i) => (
                  <GameCard key={i} game={g} lookup={lookup} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
