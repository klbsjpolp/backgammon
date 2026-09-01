import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

/**
 * The one position where a roll is unplayable whatever it is: a checker on the
 * bar and the opponent holding all six points it could enter on. The roll is
 * fixed too, so the record the UI reads is one the test knows.
 */
vi.mock('@backgammon/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('@backgammon/core')>();
  const barred = (): import('@backgammon/core').Board => {
    const points = new Array<number>(24).fill(0);
    // Black on all of 18..23 — white enters there — and its last three on the
    // far point. White's fifteenth checker is the one on the bar.
    for (let i = 18; i <= 23; i++) points[i] = -2;
    points[0] = -3;
    points[12] = 5;
    points[7] = 3;
    points[5] = 5;
    points[17] = 1;
    return { points, bar: { white: 1, black: 0 }, off: { white: 0, black: 0 } };
  };
  return {
    ...core,
    createInitialState: (starting?: import('@backgammon/core').Player) => ({
      ...core.createInitialState(starting),
      board: barred(),
    }),
    roll: (state: import('@backgammon/core').GameState) => core.applyRoll(state, [6, 5]),
  };
});

const { useLocalGame } = await import('./useLocalGame');

describe('useLocalGame — a roll the human could not play', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const advance = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };

  it('holds the AI back long enough for the dice to be read', async () => {
    const { result } = renderHook(() => useLocalGame());
    act(() => result.current.rollDice());

    // The rules hand the turn straight back inside the same update, and
    // `endTurn` clears `roll`: this record is all that is left of the throw, and
    // what `<Dice>` draws from.
    expect(result.current.state.turn).toBe('black');
    expect(result.current.state.noPlay).toEqual({ player: 'white', roll: [6, 5] });

    // Past the AI's usual think time and it has still not answered. Those 600ms
    // were the whole of the player's chance to see what they had rolled, which
    // is not a chance.
    await advance(900);
    expect(result.current.state.phase).toBe('rolling');

    await advance(700);
    expect(result.current.state.phase).not.toBe('rolling');
  });
});
