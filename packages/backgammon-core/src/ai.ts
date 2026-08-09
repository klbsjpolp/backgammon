import type { Board, GameState, Move, Player } from './types.js';
import { CHECKERS_PER_SIDE, checkersOn, opponent, pipCount } from './board.js';
import { canDouble, currentLegalMoves, playMove } from './game.js';

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

// --- Doubling cube strategy ------------------------------------------------

/** Being on roll is worth roughly half a roll, i.e. about four pips. */
const ON_ROLL_PIPS = 4;

/**
 * Rough win probability for `player`, in [0, 1]. This is a heuristic built for
 * cube decisions, not a rollout: it takes the pip race as the backbone, corrects
 * it by the positional factors that most often override a raw pip lead (primes,
 * exposed blots, checkers on the bar), and squashes the result through a
 * logistic.
 *
 * The lead is scaled by how much racing is left, because the same pip lead means
 * very different things at 160 pips and at 40.
 */
export const winProbability = (state: GameState, player: Player): number => {
  const opp = opponent(player);
  const board = state.board;
  if (board.off[player] === CHECKERS_PER_SIDE) return 1;
  if (board.off[opp] === CHECKERS_PER_SIDE) return 0;

  const myPips = pipCount(board, player);
  const oppPips = pipCount(board, opp);
  const onRoll = state.turn === player ? ON_ROLL_PIPS : -ON_ROLL_PIPS;

  // Positional edge, expressed in pips so it can be added to the race.
  const primeEdge = longestPrime(board, player) ** 2 - longestPrime(board, opp) ** 2;
  const shotEdge = directShots(board, opp) - directShots(board, player);
  const barEdge = board.bar[opp] - board.bar[player];
  const edge = primeEdge * 0.8 + shotEdge * 1.5 + barEdge * 6;

  const lead = oppPips - myPips + onRoll + edge;
  const scale = Math.sqrt(Math.max(20, (myPips + oppPips) / 2));
  return 1 / (1 + Math.exp((-0.55 * lead) / scale));
};

/**
 * Lower bound of the doubling window. Below this a double gives away more cube
 * ownership than it gains.
 */
const DOUBLE_POINT = 0.68;
/**
 * Upper bound: past this the position is "too good to double" — cashing one
 * point throws away the gammon that playing on would likely win.
 */
const TOO_GOOD_POINT = 0.85;
/**
 * Take point. The textbook figure is 25%; the cushion below it accounts for the
 * value of owning the cube after taking.
 */
const TAKE_POINT = 0.22;

/** Should `player` offer a double right now? */
export const shouldDouble = (state: GameState, player: Player): boolean => {
  if (!canDouble(state, player)) return false;
  const p = winProbability(state, player);
  return p >= DOUBLE_POINT && p <= TOO_GOOD_POINT;
};

/** Should `player` take (rather than drop) the double currently offered to them? */
export const shouldTakeDouble = (state: GameState, player: Player): boolean =>
  winProbability(state, player) >= TAKE_POINT;
