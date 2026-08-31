import type { Board, Player } from './types.js';

export const POINT_COUNT = 24;
export const CHECKERS_PER_SIDE = 15;

export const opponent = (player: Player): Player => (player === 'white' ? 'black' : 'white');

/** The standard backgammon opening position. */
export const createInitialBoard = (): Board => {
  const points = new Array<number>(POINT_COUNT).fill(0);
  // White (positive): 24-pt, 13-pt, 8-pt, 6-pt in white numbering.
  points[23] = 2;
  points[12] = 5;
  points[7] = 3;
  points[5] = 5;
  // Black (negative): mirror across index 23 - i.
  points[0] = -2;
  points[11] = -5;
  points[16] = -3;
  points[18] = -5;
  return {
    points,
    bar: { white: 0, black: 0 },
    off: { white: 0, black: 0 },
  };
};

export const cloneBoard = (board: Board): Board => ({
  points: [...board.points],
  bar: { ...board.bar },
  off: { ...board.off },
});

/** Number of mover's checkers on a point in absolute coordinates (>= 0). */
export const checkersOn = (board: Board, player: Player, index: number): number => {
  const v = board.points[index];
  return player === 'white' ? Math.max(0, v) : Math.max(0, -v);
};

/**
 * First and last index of a player's home board — the six points they bear off
 * from. White's is 0..5, black's the mirror.
 *
 * One definition, because the AI plays for it and the rules decide games by it:
 * `detectResult` calls a loss a backgammon when the loser still has a checker in
 * the winner's home board, and the evaluation has to price exactly that range or
 * it plays for a rule the engine no longer applies.
 */
export const homeRange = (player: Player): readonly [number, number] => (player === 'white' ? [0, 5] : [18, 23]);

/** Is `index` inside the player's own home board? */
export const inHomeBoard = (player: Player, index: number): boolean => {
  const [start, end] = homeRange(player);
  return index >= start && index <= end;
};

/** Are all of a player's checkers in their home board (and none on the bar)? */
export const allHome = (board: Board, player: Player): boolean => {
  if (board.bar[player] > 0) return false;
  const [homeStart, homeEnd] = homeRange(player);
  let homeCount = board.off[player];
  for (let i = homeStart; i <= homeEnd; i++) {
    homeCount += checkersOn(board, player, i);
  }
  return homeCount === CHECKERS_PER_SIDE;
};

/**
 * Pip count: total distance (in pips) the player must travel to bear off every
 * checker. A borne-off checker contributes 0; the bar contributes a full 25.
 */
export const pipCount = (board: Board, player: Player): number => {
  let pips = board.bar[player] * 25;
  for (let i = 0; i < POINT_COUNT; i++) {
    const n = checkersOn(board, player, i);
    if (n === 0) continue;
    // Distance to bear off: white travels index+1, black travels 24-index.
    const distance = player === 'white' ? i + 1 : POINT_COUNT - i;
    pips += n * distance;
  }
  return pips;
};
