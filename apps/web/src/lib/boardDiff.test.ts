import { describe, expect, it } from 'vitest';
import { createInitialState, type Board, type Player } from '@backgammon/core';
import { barPile, describeMotions, offPile, pointPile } from './boardDiff';

const boardOf = (points: Record<number, number>, rest: Partial<Board> = {}): Board => ({
  points: Array.from({ length: 24 }, (_, i) => points[i] ?? 0),
  bar: { white: 0, black: 0 },
  off: { white: 0, black: 0 },
  ...rest,
});

/** A board with one checker moved from `from` to `to`, as `playMove` would leave it. */
const afterMove = (before: Board, from: number, to: number, player: Player): Board => {
  const sign = player === 'white' ? 1 : -1;
  const points = [...before.points];
  points[from] -= sign;
  points[to] += sign;
  return { ...before, points };
};

describe('describeMotions', () => {
  it('reads a plain move off the two boards', () => {
    const before = boardOf({ 13: 5, 8: 3 });
    const motions = describeMotions(before, afterMove(before, 13, 8, 'white'));

    expect(motions).toEqual([{ player: 'white', from: pointPile(13), to: pointPile(8), kind: 'move' }]);
  });

  it('reads black moving the other way', () => {
    const before = boardOf({ 12: -5, 17: -3 });
    const motions = describeMotions(before, afterMove(before, 12, 17, 'black'));

    expect(motions).toEqual([{ player: 'black', from: pointPile(12), to: pointPile(17), kind: 'move' }]);
  });

  it('reports a hit as the move plus the blot leaving for the bar', () => {
    const before = boardOf({ 13: 5, 8: -1 });
    const after = boardOf({ 13: 4, 8: 1 }, { bar: { white: 0, black: 1 } });

    expect(describeMotions(before, after)).toEqual([
      { player: 'white', from: pointPile(13), to: pointPile(8), kind: 'move' },
      { player: 'black', from: pointPile(8), to: barPile('black'), kind: 'hit' },
    ]);
  });

  it('reads a checker entering from the bar', () => {
    const before = boardOf({ 20: 2 }, { bar: { white: 1, black: 0 } });
    const after = boardOf({ 20: 3 });

    expect(describeMotions(before, after)).toEqual([
      { player: 'white', from: barPile('white'), to: pointPile(20), kind: 'move' },
    ]);
  });

  it('reads entering from the bar onto a blot as a hit', () => {
    const before = boardOf({ 20: 0, 21: -1 }, { bar: { white: 1, black: 0 } });
    const after = boardOf({ 21: 1 }, { bar: { white: 0, black: 1 } });

    expect(describeMotions(before, after)).toEqual([
      { player: 'white', from: barPile('white'), to: pointPile(21), kind: 'move' },
      { player: 'black', from: pointPile(21), to: barPile('black'), kind: 'hit' },
    ]);
  });

  it('reads bearing off, tray and all', () => {
    const before = boardOf({ 2: 3 }, { off: { white: 12, black: 0 } });
    const after = boardOf({ 2: 2 }, { off: { white: 13, black: 0 } });

    expect(describeMotions(before, after)).toEqual([
      { player: 'white', from: pointPile(2), to: offPile('white'), kind: 'move' },
    ]);
  });

  it('reads the last checker coming off', () => {
    const before = boardOf({ 0: 1 }, { off: { white: 14, black: 0 } });
    const after = boardOf({}, { off: { white: 15, black: 0 } });

    expect(describeMotions(before, after)).toEqual([
      { player: 'white', from: pointPile(0), to: offPile('white'), kind: 'move' },
    ]);
  });

  it('has nothing to say when the board did not change', () => {
    const board = boardOf({ 13: 5, 8: 3 });
    expect(describeMotions(board, board)).toEqual([]);
  });

  // Everything below is the board arriving somewhere the animation cannot narrate.
  // Drawing a guess would be worse than not drawing anything, so it draws nothing.

  it('gives up when two checkers moved at once', () => {
    const before = boardOf({ 13: 5, 8: 0, 7: 0 });
    const after = boardOf({ 13: 3, 8: 1, 7: 1 });

    expect(describeMotions(before, after)).toEqual([]);
  });

  it('gives up when one point changed by more than a checker', () => {
    const before = boardOf({ 13: 5, 8: 0 });
    const after = boardOf({ 13: 3, 8: 2 });

    expect(describeMotions(before, after)).toEqual([]);
  });

  it('gives up on a whole new game', () => {
    const late = boardOf({ 2: 3, 21: -3 }, { off: { white: 12, black: 12 } });
    expect(describeMotions(late, createInitialState('white').board)).toEqual([]);
  });

  it('gives up when both sides moved but nobody was hit', () => {
    // Two independent single moves in one frame have a hit's shape until you ask
    // where the blot was standing.
    const before = boardOf({ 13: 5, 8: 0, 5: -1 }, { bar: { white: 0, black: 0 } });
    const after = boardOf({ 13: 4, 8: 1, 5: 0 }, { bar: { white: 0, black: 1 } });

    expect(describeMotions(before, after)).toEqual([]);
  });
});
