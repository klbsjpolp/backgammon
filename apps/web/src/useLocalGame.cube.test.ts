import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

/**
 * The cube *decisions* are core's job and are tested there. What this file
 * covers is the hook wiring around them: that a decision to double actually
 * reaches the board, and that the human can answer it either way. So the
 * strategy is stubbed to a fixed answer and only the plumbing is exercised.
 */
vi.mock('@backgammon/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@backgammon/core')>()),
  shouldDouble: vi.fn(() => true),
}));

const { useLocalGame } = await import('./useLocalGame');

const runAi = async () => {
  await act(async () => {
    await vi.runOnlyPendingTimersAsync();
  });
};

/** Pass the turn to the AI so its cube decision runs. */
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

describe('useLocalGame — AI cube offers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers a double instead of rolling when the strategy says to', async () => {
    const { result } = renderHook(() => useLocalGame());
    passTurnToAi(result);

    await runAi();

    expect(result.current.state.phase).toBe('doubleOffered');
    expect(result.current.state.doubleOfferedBy).toBe('black');
    expect(result.current.doubleToYou).toBe(true);
    // The offer waits on the human — the AI does not answer for them.
    await runAi();
    expect(result.current.state.phase).toBe('doubleOffered');
  });

  it('doubles the cube and hands it to the human on take', async () => {
    const { result } = renderHook(() => useLocalGame());
    passTurnToAi(result);
    await runAi();

    act(() => result.current.respond(true));

    expect(result.current.state.cube).toEqual({ value: 2, owner: 'white' });
    expect(result.current.state.phase).toBe('rolling');
    expect(result.current.doubleToYou).toBe(false);
  });

  it('ends the game in the AI favour on drop, conceding the current stake', async () => {
    const { result } = renderHook(() => useLocalGame());
    passTurnToAi(result);
    await runAi();

    act(() => result.current.respond(false));

    expect(result.current.state.phase).toBe('gameOver');
    expect(result.current.state.result).toMatchObject({ winner: 'black', points: 1 });
  });

  it('ignores a response to the human own offer', () => {
    const { result } = renderHook(() => useLocalGame());

    act(() => result.current.double());
    expect(result.current.state.doubleOfferedBy).toBe('white');

    act(() => result.current.respond(false));
    expect(result.current.state.phase).toBe('doubleOffered');
  });
});
