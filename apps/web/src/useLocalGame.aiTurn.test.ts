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

const { useLocalGame } = await import('./useLocalGame');

/** Run one beat of the AI's delayed turn — its roll, or one of its checker moves. */
const runAi = async () => {
  await act(async () => {
    await vi.runOnlyPendingTimersAsync();
  });
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

    act(() => result.current.rollDice());
    let guard = 0;
    while (result.current.state.turn === 'white' && result.current.state.phase === 'moving' && guard++ < 10) {
      const move = result.current.legalMoves[0];
      act(() => result.current.clickPoint(move.from));
      act(() => result.current.clickPoint(move.to));
    }
    expect(result.current.state.turn).toBe('black');

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
});
