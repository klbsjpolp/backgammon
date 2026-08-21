import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLocalGame } from './useLocalGame';

/** Run one beat of the AI's delayed turn — its roll, or one of its checker moves. */
const runAi = async () => {
  await act(async () => {
    await vi.runOnlyPendingTimersAsync();
  });
};

describe('useLocalGame', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with the human on roll, playing white', () => {
    const { result } = renderHook(() => useLocalGame());
    expect(result.current.you).toBe('white');
    expect(result.current.state.turn).toBe('white');
    expect(result.current.state.phase).toBe('rolling');
    expect(result.current.isHumanTurn).toBe(true);
    expect(result.current.legalMoves).toEqual([]);
  });

  it('rolls into the moving phase with legal moves offered', () => {
    const { result } = renderHook(() => useLocalGame());

    act(() => result.current.rollDice());

    expect(result.current.state.phase).toBe('moving');
    expect(result.current.legalMoves.length).toBeGreaterThan(0);
    expect(result.current.selectableFroms.length).toBeGreaterThan(0);
  });

  it('ignores a roll when it is not the human turn', () => {
    const { result } = renderHook(() => useLocalGame());
    act(() => result.current.rollDice());
    const afterFirst = result.current.state;

    act(() => result.current.rollDice());
    expect(result.current.state).toBe(afterFirst);
  });

  it('selects a source, offers its targets, and plays the move on the second click', () => {
    const { result } = renderHook(() => useLocalGame());
    act(() => result.current.rollDice());

    const from = result.current.selectableFroms[0];
    act(() => result.current.clickPoint(from));
    expect(result.current.selectedFrom).toBe(from);
    expect(result.current.targets.length).toBeGreaterThan(0);

    const before = result.current.state.board.points[from];
    const to = result.current.targets[0];
    act(() => result.current.clickPoint(to));

    expect(result.current.selectedFrom).toBeNull();
    expect(result.current.state.board.points[from]).not.toBe(before);
  });

  it('clears a selection that is neither a target nor another source', () => {
    const { result } = renderHook(() => useLocalGame());
    act(() => result.current.rollDice());

    const from = result.current.selectableFroms[0];
    act(() => result.current.clickPoint(from));
    const dead = [...Array(24).keys()].find(
      (i) => i !== from && !result.current.targets.includes(i) && !result.current.selectableFroms.includes(i),
    );
    act(() => result.current.clickPoint(dead!));

    expect(result.current.selectedFrom).toBeNull();
  });

  it('clears the selection on demand', () => {
    const { result } = renderHook(() => useLocalGame());
    act(() => result.current.rollDice());
    act(() => result.current.clickPoint(result.current.selectableFroms[0]));
    expect(result.current.selectedFrom).not.toBeNull();

    act(() => result.current.clearSelection());
    expect(result.current.selectedFrom).toBeNull();
  });

  it('hands the turn to the AI, which rolls and plays on its own', async () => {
    const { result } = renderHook(() => useLocalGame());
    act(() => result.current.rollDice());

    // Play the human turn out.
    let guard = 0;
    while (result.current.state.turn === 'white' && result.current.state.phase === 'moving' && guard++ < 10) {
      const move = result.current.legalMoves[0];
      act(() => result.current.clickPoint(move.from));
      act(() => result.current.clickPoint(move.to));
    }
    expect(result.current.state.turn).toBe('black');

    // One beat for the roll and one per checker the AI moves, so the number of
    // them is the dice's business, not the test's.
    let beats = 0;
    while (result.current.state.turn === 'black' && beats++ < 10) await runAi();

    // The AI rolled and moved, so the turn came back to the human.
    expect(result.current.state.turn).toBe('white');
    expect(result.current.state.phase).toBe('rolling');
  });

  it('answers a human double instead of blindly taking it', async () => {
    const { result } = renderHook(() => useLocalGame());
    expect(result.current.canHumanDouble).toBe(true);

    act(() => result.current.double());
    expect(result.current.state.phase).toBe('doubleOffered');
    expect(result.current.doubleToYou).toBe(false);

    await runAi();

    // From the opening position the AI is around even money, so it takes and
    // the cube ends up on its side at 2.
    expect(result.current.state.cube).toEqual({ value: 2, owner: 'black' });
    expect(result.current.state.phase).toBe('rolling');
    expect(result.current.canHumanDouble).toBe(false);
  });

  it('resets the board on a new game', () => {
    const { result } = renderHook(() => useLocalGame());
    act(() => result.current.rollDice());
    act(() => result.current.clickPoint(result.current.selectableFroms[0]));

    act(() => result.current.newGame());

    expect(result.current.state.phase).toBe('rolling');
    expect(result.current.state.turn).toBe('white');
    expect(result.current.selectedFrom).toBeNull();
    expect(result.current.state.cube).toEqual({ value: 1, owner: null });
  });
});
