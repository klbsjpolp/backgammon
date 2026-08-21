import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { BAR, type GameState } from '@backgammon/core';

/**
 * The shortcut only says anything on a board where one point has a single move
 * and another has a choice, so the dice are fixed rather than rolled. From the
 * opening position 6-5 is exactly that board for white: the back checker on 24
 * can only run to 18 (the 5 lands on black's five-prime), while the midpoint can
 * play either die.
 */
vi.mock('@backgammon/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('@backgammon/core')>();
  return { ...core, roll: (state: GameState) => core.applyRoll(state, [6, 5]) };
});

const { useLocalGame } = await import('./useLocalGame');

describe('useLocalGame — a point with one move', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays it outright, spending the die the second click would have', () => {
    const { result } = renderHook(() => useLocalGame());
    act(() => result.current.rollDice());

    act(() => result.current.playOnlyMove(23));

    expect(result.current.state.board.points[23]).toBe(1);
    expect(result.current.state.board.points[17]).toBe(1);
    // The 6 went with it; the 5 is still there to play.
    expect(result.current.state.remaining).toEqual([5]);
    expect(result.current.selectedFrom).toBeNull();
  });

  it('leaves a point that offers a choice to the two clicks', () => {
    const { result } = renderHook(() => useLocalGame());
    act(() => result.current.rollDice());
    const rolled = result.current.state;

    // The midpoint can play either die, and picking one for the player is
    // picking their move for them.
    act(() => result.current.playOnlyMove(12));

    expect(result.current.state).toBe(rolled);
  });

  it('does nothing off a point with no move at all, or before the dice are rolled', () => {
    const { result } = renderHook(() => useLocalGame());
    const unrolled = result.current.state;

    act(() => result.current.playOnlyMove(23));
    expect(result.current.state).toBe(unrolled);

    act(() => result.current.rollDice());
    const rolled = result.current.state;
    act(() => result.current.playOnlyMove(BAR));
    act(() => result.current.playOnlyMove(3));
    expect(result.current.state).toBe(rolled);
  });
});
