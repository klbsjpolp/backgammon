import type { Board, GameState, Move, Player } from './types.js';
import { checkersOn, opponent, pipCount } from './board.js';
import { applyMove } from './moves.js';
import { currentLegalMoves, playMove } from './game.js';

/**
 * Static board evaluation from `player`'s perspective (higher is better). A
 * deliberately simple heuristic: race on pips, bear off, avoid blots, value
 * made points, and reward putting the opponent on the bar.
 */
export const evaluateBoard = (board: Board, player: Player): number => {
  const opp = opponent(player);
  let score = 0;

  score += board.off[player] * 100;
  score -= board.bar[player] * 50;
  score += board.bar[opp] * 25;

  for (let i = 0; i < 24; i++) {
    const own = checkersOn(board, player, i);
    if (own === 1)
      score -= 12; // exposed blot
    else if (own >= 2) score += 4; // made point
  }

  score -= pipCount(board, player);
  score += pipCount(board, opp) * 0.5;
  return score;
};

/**
 * Greedily choose the sequence of checker moves for the player on roll: at each
 * step pick the legal move that yields the best static evaluation. Returns the
 * moves in play order (possibly empty when the turn must be passed).
 */
export const chooseTurn = (state: GameState): Move[] => {
  const player = state.turn;
  const sequence: Move[] = [];
  let s = state;

  while (s.phase === 'moving' && s.turn === player) {
    const moves = currentLegalMoves(s);
    if (moves.length === 0) break;

    let best = moves[0];
    let bestScore = -Infinity;
    for (const move of moves) {
      const score = evaluateBoard(applyMove(s.board, player, move), player);
      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
    }
    sequence.push(best);
    s = playMove(s, best);
  }

  return sequence;
};

/** Apply the AI's full chosen turn, returning the resulting state. */
export const applyAiTurn = (state: GameState): GameState => {
  let s = state;
  for (const move of chooseTurn(state)) {
    s = playMove(s, move);
  }
  return s;
};
