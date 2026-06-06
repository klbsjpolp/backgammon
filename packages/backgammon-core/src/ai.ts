import type { Board, GameState, Move, Player } from './types.js';
import { checkersOn, opponent, pipCount } from './board.js';
import { currentLegalMoves, playMove } from './game.js';

const inHomeBoard = (player: Player, index: number): boolean => (player === 'white' ? index <= 5 : index >= 18);

/**
 * Count the opponent's *direct* shots at the player's blots: for each blot, how
 * many die faces (1..6) land an opponent checker exactly on it. A strong proxy
 * for how exposed the position is (indirect/combination shots are ignored for
 * speed).
 */
const directShots = (board: Board, player: Player): number => {
  const opp = opponent(player);
  let shots = 0;
  for (let p = 0; p < 24; p++) {
    if (checkersOn(board, player, p) !== 1) continue; // only blots are hittable
    for (let d = 1; d <= 6; d++) {
      // An opponent checker hits p from `p + d` (white moves high->low) or
      // `p - d` (black moves low->high).
      const q = opp === 'white' ? p + d : p - d;
      if (q >= 0 && q < 24 && checkersOn(board, opp, q) > 0) shots++;
    }
  }
  return shots;
};

/** Longest run of consecutive made points (a blockade/prime) owned by player. */
const longestPrime = (board: Board, player: Player): number => {
  let best = 0;
  let run = 0;
  for (let i = 0; i < 24; i++) {
    if (checkersOn(board, player, i) >= 2) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
};

/**
 * Static board evaluation from `player`'s perspective (higher is better). Beyond
 * the pip race it rewards made points, home-board structure and primes, and
 * penalizes blots by how many direct shots the opponent has at them.
 */
export const evaluateBoard = (board: Board, player: Player): number => {
  const opp = opponent(player);
  let score = 0;

  score += board.off[player] * 120;
  score -= board.bar[player] * 60;
  score += board.bar[opp] * 30;

  for (let i = 0; i < 24; i++) {
    const own = checkersOn(board, player, i);
    if (own >= 2) {
      score += 3;
      if (inHomeBoard(player, i)) score += 2; // home-board points are worth more
    }
  }

  const prime = longestPrime(board, player);
  score += prime * prime; // primes are worth more the longer they get

  score -= directShots(board, player) * 8;

  score -= pipCount(board, player);
  score += pipCount(board, opp) * 0.4;
  return score;
};

const MAX_NODES = 60_000;

/**
 * Choose the best full turn by searching every legal move sequence for the dice
 * and keeping the one whose resulting board evaluates highest. Unlike a greedy
 * per-move policy this avoids local optima (e.g. it will split a large double to
 * make a point rather than burying checkers). Falls back gracefully if the
 * search space is unusually large.
 */
export const chooseTurn = (state: GameState): Move[] => {
  const player = state.turn;
  let best: Move[] = [];
  let bestScore = -Infinity;
  let nodes = 0;

  const search = (s: GameState, acc: Move[]): void => {
    const ended = s.turn !== player || s.phase !== 'moving';
    const moves = ended ? [] : currentLegalMoves(s);
    if (ended || moves.length === 0) {
      const score = evaluateBoard(s.board, player);
      if (score > bestScore) {
        bestScore = score;
        best = [...acc];
      }
      return;
    }
    for (const move of moves) {
      if (nodes++ > MAX_NODES) return;
      acc.push(move);
      search(playMove(s, move), acc);
      acc.pop();
    }
  };

  search(state, []);
  return best;
};

/** Apply the AI's full chosen turn, returning the resulting state. */
export const applyAiTurn = (state: GameState): GameState => {
  let s = state;
  for (const move of chooseTurn(state)) {
    s = playMove(s, move);
  }
  return s;
};
