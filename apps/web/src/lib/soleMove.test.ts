import { describe, expect, it } from 'vitest';
import { OFF, type Move } from '@backgammon/core';
import { soleMoveFrom } from './soleMove';

const move = (from: number, to: number, die: number): Move => ({ from, to, die, hit: false });

describe('soleMoveFrom', () => {
  it('gives the move when a point has one', () => {
    expect(soleMoveFrom([move(23, 20, 3), move(12, 7, 5)], 23)).toEqual(move(23, 20, 3));
  });

  it('gives nothing when a point offers a choice of destinations', () => {
    expect(soleMoveFrom([move(23, 20, 3), move(23, 18, 5)], 23)).toBeNull();
  });

  it('gives nothing for a point with no move at all', () => {
    expect(soleMoveFrom([move(23, 20, 3)], 12)).toBeNull();
  });

  it('counts two dice bearing off the same checker as one move, and spends the first', () => {
    // A checker on the 2-point comes off with a 5 or a 6 once nothing is behind
    // it; either way it lands in the tray, so there is nothing to choose.
    expect(soleMoveFrom([move(1, OFF, 5), move(1, OFF, 6)], 1)).toEqual(move(1, OFF, 5));
  });
});
