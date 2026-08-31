import type { Board, GameState, Move, Player } from './types.js';
import { CHECKERS_PER_SIDE, POINT_COUNT, checkersOn, opponent, pipCount } from './board.js';
import { applyLegalMove, canDouble, currentLegalMoves } from './game.js';

const inHomeBoard = (player: Player, index: number): boolean => (player === 'white' ? index <= 5 : index >= 18);

/** First and last index of a player's home board, in absolute coordinates. */
const homeRange = (player: Player): [number, number] => (player === 'white' ? [0, 5] : [18, 23]);

/**
 * Count the opponent's *direct* shots at the player's blots: for each blot, how
 * many die faces (1..6) land an opponent checker exactly on it. A strong proxy
 * for how exposed the position is (indirect/combination shots are ignored for
 * speed).
 *
 * A checker on the bar is a hitter too, and the loudest one on the board: it has
 * to come in on the far quadrant, it comes in before anything else can be
 * played, and every one of the six faces is a candidate. Reading shots off
 * `points` alone missed all of that, so the AI was blindest to the danger
 * exactly when it was greatest — leaving blots across its own home board while
 * the opponent sat on the bar waiting to enter on top of one.
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
  if (board.bar[opp] > 0) {
    for (let d = 1; d <= 6; d++) {
      // Entry lands on the point `d` deep into the player's home board: white
      // enters at 24 - d, black at d - 1.
      const entry = opp === 'white' ? POINT_COUNT - d : d - 1;
      if (checkersOn(board, player, entry) === 1) shots++;
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

/** Checkers on a point beyond which the extra ones are doing nothing. */
const BURY_DEPTH = 4;
/** Per buried checker. */
const BURY_COST = 2;

/**
 * Checkers the opponent has borne off before the AI starts playing to save the
 * backgammon, and the whole of the trade.
 *
 * An anchor in the winner's home board is the last thing that can still win the
 * game outright — they have to bear off around it and will eventually be forced
 * to leave a shot — so breaking it early throws away real winning chances for a
 * point that was never in danger. Breaking it late throws away the third point.
 * Eight measured best: leaving at five costs games, waiting until eleven leaves
 * twice as many backgammons on the table.
 */
const BACKGAMMON_ALARM = 8;
/** Per trapped checker, at the moment the opponent bears off their last. */
const BACKGAMMON_RISK = 40;

/**
 * Checkers piled beyond the fourth on a point.
 *
 * Nothing else here dislikes a tall stack. A made point scores the same whether
 * it holds two checkers or six, and the pip count is indifferent to *which*
 * checker moves — so a play that brought an outfield checker round and one that
 * dropped another checker onto a home-board point the AI already owned came out
 * exactly equal, and the search took whichever it saw first. That is the tidy,
 * useless endgame the AI kept playing: material stacked where it can never be
 * hit and can never do anything either, while the checkers that still had a
 * journey ahead of them sat where they were.
 */
const buriedCheckers = (board: Board, player: Player): number => {
  let total = 0;
  for (let i = 0; i < POINT_COUNT; i++) {
    total += Math.max(0, checkersOn(board, player, i) - BURY_DEPTH);
  }
  return total;
};

/**
 * What a loss is about to cost beyond the single point it has to cost.
 *
 * A loss with nothing borne off is a gammon and pays double; a loss with nothing
 * off *and* a checker still on the bar or in the winner's home board is a
 * backgammon and pays triple. Both are read off the position at the instant the
 * winner's fifteenth checker comes off, so a game that is already lost is still
 * worth playing — and the evaluation had no term for any of it. It scored a
 * position purely by how likely it was to win, which makes every lost game
 * equally lost, so the AI held its anchor in the winner's home board to the end
 * and was backgammoned in one self-play game out of seven.
 *
 * The penalty counts trapped checkers rather than firing all-or-nothing. The
 * stake only actually falls when the last one leaves, but a search four
 * half-moves deep needs a slope to walk down, not a cliff at the end of it.
 */
const lossStakes = (board: Board, player: Player): number => {
  if (board.off[player] > 0) return 0; // the first checker off settles both
  // How far into their bear-off the opponent is, from the alarm point to all
  // fifteen off.
  const progress = (board.off[opponent(player)] - BACKGAMMON_ALARM) / (CHECKERS_PER_SIDE - BACKGAMMON_ALARM);
  if (progress <= 0) return 0;
  const [start, end] = homeRange(opponent(player));
  let trapped = board.bar[player];
  for (let i = start; i <= end; i++) trapped += checkersOn(board, player, i);
  return progress * trapped * BACKGAMMON_RISK;
};

/**
 * Static board evaluation from `player`'s perspective (higher is better). Beyond
 * the pip race it rewards made points, home-board structure and primes, and
 * penalizes blots by how many direct shots the opponent has at them, checkers
 * stacked past the point of being useful, and — once the game is being lost —
 * the extra points a gammon or a backgammon would hand over.
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
  score -= buriedCheckers(board, player) * BURY_COST;
  score -= lossStakes(board, player);

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
      search(applyLegalMove(s, move), acc);
      acc.pop();
    }
  };

  search(state, []);
  return best;
};

/** Apply the AI's full chosen turn, returning the resulting state. */
export const applyAiTurn = (state: GameState): GameState => {
  let s = state;
  // The sequence came out of `chooseTurn`, which only ever walks legal moves.
  for (const move of chooseTurn(state)) {
    s = applyLegalMove(s, move);
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
