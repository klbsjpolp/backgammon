import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

/**
 * What the AI *chooses* is core's business and is tested there. What this file
 * covers is the pace it plays at: one checker per beat, so the human can see
 * which ones moved. That needs dice the test knows, hence the fixed roll — 3
 * and 1 are both playable from an opening position whichever the AI spends
 * first, so the turn is always exactly two beats long.
 */
vi.mock('@backgammon/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('@backgammon/core')>();
  return { ...core, roll: (state: import('@backgammon/core').GameState) => core.applyRoll(state, [3, 1]) };
});

const { createInitialState } = await import('@backgammon/core');
const { useLocalGame } = await import('./useLocalGame');

/** Run one beat of the AI's delayed turn — its roll, or one of its checker moves. */
const runAi = async () => {
  await act(async () => {
    await vi.runOnlyPendingTimersAsync();
  });
};

/** Play the human's turn out with whatever comes first, leaving the AI on roll. */
const passTurnToAi = (result: { current: ReturnType<typeof useLocalGame> }) => {
  act(() => result.current.rollDice());
  let guard = 0;
  while (result.current.state.turn === 'white' && result.current.state.phase === 'moving' && guard++ < 10) {
    const move = result.current.legalMoves[0];
    act(() => result.current.clickPoint(move.from));
    act(() => result.current.clickPoint(move.to));
  }
  expect(result.current.state.turn).toBe('black');
};

describe('useLocalGame — the pace of an AI turn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('spends one die per beat rather than the whole turn at once', async () => {
    const { result } = renderHook(() => useLocalGame());
    passTurnToAi(result);

    await runAi();
    expect(result.current.state.phase).toBe('moving');
    expect(result.current.state.remaining).toHaveLength(2);

    const before = result.current.state.board;
    await runAi();

    // Mid-turn — the state a turn applied in one go never has, and the whole
    // point of the exercise: one die is gone, one checker has moved, and the
    // board sits there long enough to be read before the next one goes.
    expect(result.current.state.turn).toBe('black');
    expect(result.current.state.remaining).toHaveLength(1);
    expect(result.current.state.board).not.toBe(before);

    await runAi();
    expect(result.current.state.turn).toBe('white');
    expect(result.current.state.phase).toBe('rolling');
  });

  it('drops a beat that lands on a board the move was not chosen from', async () => {
    const { result } = renderHook(() => useLocalGame());
    passTurnToAi(result);
    await runAi();
    expect(result.current.state.phase).toBe('moving');

    // A new game started in the tick the beat fires: both updates are queued
    // before React commits either, so the effect cleanup that cancels the timer
    // has not run and the move arrives against a board it was never chosen
    // from. The guard is what makes that a no-op — its worst case is the turn
    // having passed to the human by then, where `chooseTurn` would happily pick
    // a move for *white* and play it for them.
    act(() => {
      result.current.newGame();
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.state.board).toEqual(createInitialState('white').board);
    expect(result.current.state.turn).toBe('white');
    expect(result.current.state.phase).toBe('rolling');
  });
});
