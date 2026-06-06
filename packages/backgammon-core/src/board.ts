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

/** Are all of a player's checkers in their home board (and none on the bar)? */
export const allHome = (board: Board, player: Player): boolean => {
  if (board.bar[player] > 0) return false;
  const homeStart = player === 'white' ? 0 : 18;
  const homeEnd = player === 'white' ? 5 : 23;
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
