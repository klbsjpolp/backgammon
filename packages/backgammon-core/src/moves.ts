import type { Board, Move, Player } from './types.js';
import { BAR, OFF } from './types.js';
import { cloneBoard, opponent } from './board.js';

/**
 * Normalized frame: the mover's checkers are positive and travel 23 -> 0, the
 * mover bears off below index 0, the mover's home board is indices 0..5, and the
 * mover re-enters from the bar onto indices 18..23. Opponent checkers are
 * negative. White is the identity; black is mirrored across index 23 with sign
 * flipped. This collapses both directions into one set of rules.
 */
interface NormState {
  pts: number[];
  bar: number;
}

const toNorm = (board: Board, player: Player): NormState => {
  const pts = new Array<number>(24);
  for (let i = 0; i < 24; i++) {
    pts[i] = player === 'white' ? board.points[i] : -board.points[23 - i];
  }
  return { pts, bar: board.bar[player] };
};

/** Map a normalized index back to an absolute board index for the given player. */
const toAbsIndex = (player: Player, k: number): number => (player === 'white' ? k : 23 - k);

const cloneNorm = (s: NormState): NormState => ({ pts: [...s.pts], bar: s.bar });

/** All of the mover's checkers are in the home board (indices 0..5), none on bar. */
const allHomeNorm = (s: NormState): boolean => {
  if (s.bar > 0) return false;
  for (let k = 6; k < 24; k++) {
    if (s.pts[k] > 0) return false;
  }
  return true;
};

interface NormMove {
  /** Normalized source index, or -1 when entering from the bar. */
  fromK: number;
  /** Normalized destination index, or < 0 when bearing off. */
  toK: number;
  die: number;
  hit: boolean;
}

/** Legal single-die moves in the normalized frame for one die value. */
const genNorm = (s: NormState, die: number): NormMove[] => {
  const moves: NormMove[] = [];

  if (s.bar > 0) {
    // Must re-enter first. A die `d` enters onto normalized index 24 - d.
    const toK = 24 - die;
    if (s.pts[toK] >= -1) {
      moves.push({ fromK: -1, toK, die, hit: s.pts[toK] === -1 });
    }
    return moves;
  }

  const home = allHomeNorm(s);
  // Highest occupied mover point in the home board (for overshoot rule).
  let highestHome = -1;
  if (home) {
    for (let k = 5; k >= 0; k--) {
      if (s.pts[k] > 0) {
        highestHome = k;
        break;
      }
    }
  }

  for (let fromK = 0; fromK < 24; fromK++) {
    if (s.pts[fromK] <= 0) continue; // no mover checker here
    const toK = fromK - die;
    if (toK >= 0) {
      if (s.pts[toK] >= -1) {
        moves.push({ fromK, toK, die, hit: s.pts[toK] === -1 });
      }
      continue;
    }
    // toK < 0 => bearing off, only when every checker is home.
    if (!home) continue;
    if (toK === -1) {
      // Exact bear-off (die == fromK + 1) is always allowed.
      moves.push({ fromK, toK, die, hit: false });
    } else if (fromK === highestHome) {
      // Overshoot: only from the highest occupied home point.
      moves.push({ fromK, toK, die, hit: false });
    }
  }

  return moves;
};

const applyNorm = (s: NormState, m: NormMove): NormState => {
  const next = cloneNorm(s);
  if (m.fromK === -1) next.bar -= 1;
  else next.pts[m.fromK] -= 1;
  if (m.toK >= 0) {
    next.pts[m.toK] = m.hit ? 1 : next.pts[m.toK] + 1;
  }
  return next;
};

/** Maximum number of dice the mover can consume from `dice` (full search). */
const maxDepth = (s: NormState, dice: number[]): number => {
  if (dice.length === 0) return 0;
  let best = 0;
  const tried = new Set<number>();
  for (let i = 0; i < dice.length; i++) {
    const die = dice[i];
    if (tried.has(die)) continue;
    tried.add(die);
    const rest = dice.slice(0, i).concat(dice.slice(i + 1));
    for (const m of genNorm(s, die)) {
      const depth = 1 + maxDepth(applyNorm(s, m), rest);
      if (depth > best) best = depth;
      if (best === dice.length) return best;
    }
  }
  return best;
};

const toAbsMove = (player: Player, m: NormMove): Move => ({
  from: m.fromK === -1 ? BAR : toAbsIndex(player, m.fromK),
  to: m.toK < 0 ? OFF : toAbsIndex(player, m.toK),
  die: m.die,
  hit: m.hit,
});

const removeOne = (dice: number[], die: number): number[] => {
  const i = dice.indexOf(die);
  return dice.slice(0, i).concat(dice.slice(i + 1));
};

/**
 * The set of moves the mover may legally make right now, honoring the rule that
 * a player must use as many dice as possible and, when only one of two dice can
 * be played, must play the higher one.
 */
export const legalMoves = (board: Board, player: Player, remaining: number[]): Move[] => {
  const s = toNorm(board, player);
  const max = maxDepth(s, remaining);
  if (max === 0) return [];

  if (max === 1) {
    // Exactly one die will be played: it must be the highest die that has a move.
    const usable = [...new Set(remaining)].filter((d) => genNorm(s, d).length > 0);
    const die = Math.max(...usable);
    return genNorm(s, die).map((m) => toAbsMove(player, m));
  }

  const result: Move[] = [];
  for (const die of new Set(remaining)) {
    const rest = removeOne(remaining, die);
    for (const m of genNorm(s, die)) {
      if (1 + maxDepth(applyNorm(s, m), rest) === max) {
        result.push(toAbsMove(player, m));
      }
    }
  }
  return result;
};

const addChecker = (board: Board, player: Player, index: number): void => {
  board.points[index] += player === 'white' ? 1 : -1;
};

const removeChecker = (board: Board, player: Player, index: number): void => {
  board.points[index] += player === 'white' ? -1 : 1;
};

/** Apply a single validated move, returning a new board (the input is untouched). */
export const applyMove = (board: Board, player: Player, move: Move): Board => {
  const next = cloneBoard(board);
  const opp = opponent(player);

  if (move.from === BAR) next.bar[player] -= 1;
  else removeChecker(next, player, move.from);

  if (move.to === OFF) {
    next.off[player] += 1;
    return next;
  }

  if (move.hit) {
    // Clear the opponent blot and send it to the bar.
    next.points[move.to] = 0;
    next.bar[opp] += 1;
  }
  addChecker(next, player, move.to);
  return next;
};
