import type { GameInfo } from './types.ts';

/**
 * The College Football Playoff bracket, reconstructed from the save's own
 * playoff game rows. The 12-team format labels its games by BowlGame.Name —
 * "CFP First Round" (4 games, seeds 5–12), "CFP Quarterfinal" (4, the top-4
 * byes enter here), "CFP Semifinal" (2), "National Championship" (1). No seed
 * field exists in the save, so the bracket topology is rebuilt purely by
 * linking each round's winner to the next round's game that contains them —
 * which is exact, not inferred.
 */

export type CfpRound = 'first' | 'quarter' | 'semi' | 'final';

export const CFP_ROUND_LABEL: Record<CfpRound, string> = {
  first: 'First Round',
  quarter: 'Quarterfinals',
  semi: 'Semifinals',
  final: 'National Championship'
};

export interface CfpGame {
  round: CfpRound;
  bowlName: string;
  homeRow: number;
  awayRow: number;
  homeScore: number;
  awayScore: number;
  played: boolean;
  /** Winner's team row, or null when the game hasn't been played. */
  winnerRow: number | null;
}

export interface CfpBracket {
  seasonYear: number;
  /** True when this is the season currently underway, false for a banked past year. */
  isCurrent: boolean;
  games: CfpGame[];
  championRow: number | null;
}

/** Which playoff round a bowl name denotes, or null for a non-playoff bowl. */
export function cfpRoundOf(bowlName: string | null | undefined): CfpRound | null {
  if (!bowlName) return null;
  if (/national championship/i.test(bowlName)) return 'final';
  if (/first round/i.test(bowlName)) return 'first';
  if (/quarterfinal/i.test(bowlName)) return 'quarter';
  if (/semifinal/i.test(bowlName)) return 'semi';
  return null;
}

/** True once at least one CFP bracket game exists in a game list. */
export function hasCfpGames(games: GameInfo[]): boolean {
  return games.some((g) => cfpRoundOf(g.bowlName));
}

/**
 * Build the bracket from a season's league-wide game list. Returns null when
 * the list carries no playoff games. Games that are scheduled but unplayed
 * (later rounds of a live bracket) come through with played=false.
 */
export function buildCfpBracket(
  games: GameInfo[],
  seasonYear: number,
  isCurrent: boolean
): CfpBracket | null {
  const bracket: CfpGame[] = [];
  for (const g of games) {
    const round = cfpRoundOf(g.bowlName);
    if (!round) continue;
    const played = g.status !== 'unplayed';
    bracket.push({
      round,
      bowlName: g.bowlName!,
      homeRow: g.homeRow,
      awayRow: g.awayRow,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      played,
      winnerRow: !played ? null : g.status === 'home' ? g.homeRow : g.awayRow
    });
  }
  if (!bracket.length) return null;
  const final = bracket.find((g) => g.round === 'final');
  return {
    seasonYear,
    isCurrent,
    games: bracket,
    championRow: final?.winnerRow ?? null
  };
}

/** One participant slot in a rendered bracket node. */
export interface BracketSlot {
  teamRow: number | null;
  score: number | null;
  won: boolean;
  /** The prior-round game this team advanced from; null = a first-round team or a top-4 bye. */
  feeder: BracketNode | null;
  /** True when this slot is a top-4 seed entering at the quarterfinals (no prior game). */
  bye: boolean;
}

export interface BracketNode {
  game: CfpGame;
  top: BracketSlot;
  bottom: BracketSlot;
}

/**
 * Link the flat bracket into a tree rooted at the championship, so a renderer
 * can lay it out left-to-right. Each participant resolves to the earlier-round
 * game they won (their feeder); a quarterfinalist with no such game is a bye.
 * Returns null until the final exists (a bracket still in its early rounds
 * renders from the flat `games` list instead).
 */
export function linkCfpTree(bracket: CfpBracket): BracketNode | null {
  const final = bracket.games.find((g) => g.round === 'final');
  if (!final) return null;
  const prior: Record<CfpRound, CfpRound | null> = {
    final: 'semi',
    semi: 'quarter',
    quarter: 'first',
    first: null
  };

  const nodeFor = (game: CfpGame): BracketNode => ({
    game,
    top: slotFor(game, game.homeRow, game.homeScore, game.round),
    bottom: slotFor(game, game.awayRow, game.awayScore, game.round)
  });

  const slotFor = (game: CfpGame, teamRow: number, score: number, round: CfpRound): BracketSlot => {
    const feederRound = prior[round];
    let feeder: BracketNode | null = null;
    if (feederRound) {
      const fg = bracket.games.find(
        (g) => g.round === feederRound && g.winnerRow === teamRow
      );
      if (fg) feeder = nodeFor(fg);
    }
    return {
      teamRow,
      score,
      won: game.winnerRow === teamRow,
      feeder,
      // A quarterfinalist with no first-round game they won is a top-4 bye.
      bye: round === 'quarter' && feeder === null
    };
  };

  return nodeFor(final);
}
