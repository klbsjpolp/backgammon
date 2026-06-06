import { describe, expect, it } from 'vitest';
import {
  applyAiTurn,
  applyMove,
  applyRoll,
  BAR,
  OFF,
  canDouble,
  chooseTurn,
  createInitialBoard,
  createInitialState,
  createRng,
  evaluateBoard,
  legalMoves,
  offerDouble,
  pipCount,
  playMove,
  respondDouble,
  roll,
  type Board,
  type GameState,
  type Player,
} from '../src/index.js';

const makeBoard = (
  points: Record<number, number>,
  bar: Partial<Record<Player, number>> = {},
  off: Partial<Record<Player, number>> = {},
): Board => {
  const arr = new Array<number>(24).fill(0);
  for (const [k, v] of Object.entries(points)) arr[Number(k)] = v;
  return {
    points: arr,
    bar: { white: 0, black: 0, ...bar },
    off: { white: 0, black: 0, ...off },
  };
};

const movingState = (board: Board, turn: Player, remaining: number[]): GameState => ({
  ...createInitialState(turn),
  board,
  phase: 'moving',
  roll: [remaining[0], remaining[1] ?? remaining[0]],
  remaining,
});

describe('board setup', () => {
  it('opens with the standard position and equal pip counts of 167', () => {
    const board = createInitialBoard();
    expect(pipCount(board, 'white')).toBe(167);
    expect(pipCount(board, 'black')).toBe(167);
    const total = board.points.reduce((sum, v) => sum + Math.abs(v), 0);
    expect(total).toBe(30); // 15 white + 15 black checkers placed
  });
});

describe('bar re-entry', () => {
  it('forces entry from the bar and blocks closed entry points', () => {
    // White on the bar; black holds 23,22,21,20 (blocks dice 1..4). Only die 5
    // (-> index 19) and die 6 (-> index 18) can enter.
    const board = makeBoard({ 12: 14, 23: -2, 22: -2, 21: -2, 20: -2 }, { white: 1 });
    const moves = legalMoves(board, 'white', [5, 2]);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ from: BAR, to: 19, die: 5, hit: false });
  });
});

describe('hitting', () => {
  it('sends a hit blot to the bar', () => {
    const board = makeBoard({ 10: 1, 7: -1 });
    const after = applyMove(board, 'white', { from: 10, to: 7, die: 3, hit: true });
    expect(after.points[7]).toBe(1); // white now occupies the point
    expect(after.points[10]).toBe(0);
    expect(after.bar.black).toBe(1);
  });
});

describe('bearing off', () => {
  it('bears a checker off with an exact die', () => {
    const board = makeBoard({ 5: 2, 3: 1 }, {}, { white: 12 });
    const moves = legalMoves(board, 'white', [6, 1]);
    expect(moves).toContainEqual({ from: 5, to: OFF, die: 6, hit: false });
    // Cannot overshoot the 4-point (index 3) with a 6 while the 6-point is occupied.
    expect(moves.some((m) => m.from === 3 && m.to === OFF)).toBe(false);
  });

  it('allows overshoot bear-off only from the highest occupied point', () => {
    const board = makeBoard({ 3: 1 }, {}, { white: 14 });
    const moves = legalMoves(board, 'white', [6, 6, 6, 6]);
    expect(moves).toContainEqual({ from: 3, to: OFF, die: 6, hit: false });
  });

  it('bears off correctly for black (mirrored)', () => {
    const board = makeBoard({ 18: -2 }, {}, { black: 13 });
    const moves = legalMoves(board, 'black', [6, 1]);
    expect(moves).toContainEqual({ from: 18, to: OFF, die: 6, hit: false });
    const after = applyMove(board, 'black', { from: 18, to: OFF, die: 6, hit: false });
    expect(after.off.black).toBe(14);
    expect(after.points[18]).toBe(-1);
  });
});

describe('use-both-dice rule', () => {
  it('forces the higher die when only one of two can be played', () => {
    // Single white checker on the 24-point (index 23). Both 6 (->17) and 5
    // (->18) are individually playable, but the 12-point is blocked so the
    // second die can never follow. The rule requires playing the higher die.
    const board = makeBoard({ 23: 1, 12: -2, 6: -13 }, {}, { white: 14 });
    const moves = legalMoves(board, 'white', [6, 5]);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ from: 23, to: 17, die: 6 });
  });
});

describe('win detection', () => {
  const bearOffLast = (black: Record<number, number>, blackOff: number) => {
    const board = makeBoard({ 0: 1, ...black }, {}, { white: 14, black: blackOff });
    const state = movingState(board, 'white', [1, 1]);
    return playMove(state, { from: 0, to: OFF, die: 1, hit: false });
  };

  it('scores a single game when the loser has borne a checker off', () => {
    const next = bearOffLast({ 20: -14 }, 1);
    expect(next.phase).toBe('gameOver');
    expect(next.result).toMatchObject({ winner: 'white', kind: 'single', points: 1 });
  });

  it('scores a gammon when the loser has borne nothing off', () => {
    const next = bearOffLast({ 20: -15 }, 0);
    expect(next.result).toMatchObject({ kind: 'gammon', points: 2 });
  });

  it('scores a backgammon when the loser is still in the winner home board', () => {
    // A black checker on index 3 sits in white's home board.
    const next = bearOffLast({ 3: -1, 20: -14 }, 0);
    expect(next.result).toMatchObject({ kind: 'backgammon', points: 3 });
  });
});

describe('doubling cube', () => {
  it('doubles and hands the cube to the taker on accept', () => {
    const offered = offerDouble(createInitialState('white'));
    expect(offered.phase).toBe('doubleOffered');
    const taken = respondDouble(offered, true);
    expect(taken.cube).toEqual({ value: 2, owner: 'black' });
    expect(taken.phase).toBe('rolling');
  });

  it('ends the game on decline, conceding the cube stake', () => {
    const dropped = respondDouble(offerDouble(createInitialState('white')), false);
    expect(dropped.phase).toBe('gameOver');
    expect(dropped.result).toMatchObject({ winner: 'white', points: 1 });
  });

  it('only lets the cube owner double', () => {
    const state = { ...createInitialState('white'), cube: { value: 2, owner: 'black' as Player } };
    expect(canDouble(state, 'white')).toBe(false);
  });
});

describe('ai', () => {
  it('uses both dice when a full sequence is available', () => {
    const state = applyRoll(createInitialState('white'), [3, 1]);
    expect(chooseTurn(state)).toHaveLength(2);
  });

  it('evaluation penalizes a blot exposed to a direct shot', () => {
    const exposed = makeBoard({ 12: 1, 6: -1 }); // black on 6 hits the 12-blot with a 6
    const safe = makeBoard({ 12: 1, 0: -1 }); // black on 0 has no direct shot
    expect(evaluateBoard(exposed, 'white')).toBeLessThan(evaluateBoard(safe, 'white'));
  });
});

describe('full game simulation', () => {
  it('plays a seeded AI-vs-AI game to completion with a clean win', () => {
    let s = createInitialState('white');
    const rng = createRng(1234);
    let guard = 0;
    while (s.phase !== 'gameOver' && guard++ < 5000) {
      if (s.phase === 'rolling') s = roll(s, rng);
      else if (s.phase === 'moving') s = applyAiTurn(s);
      else break;
    }
    expect(s.phase).toBe('gameOver');
    expect(s.result).not.toBeNull();
    expect(s.board.off[s.result!.winner]).toBe(15);
  });
});
