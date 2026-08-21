import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { BAR, OFF, type Move } from '@backgammon/core';
import { useCheckerSelection } from './useCheckerSelection';

const move = (from: number, to: number, die: number): Move => ({ from, to, die, hit: false });

/** One checker on point 5 with two ways off it, and a second source on point 8. */
const MOVES: Move[] = [move(5, 2, 3), move(5, 1, 4), move(8, 4, 4)];

describe('useCheckerSelection', () => {
  it('offers each source once, however many moves leave it', () => {
    const { result } = renderHook(() => useCheckerSelection(MOVES, vi.fn()));
    expect(result.current.selectableFroms).toEqual([5, 8]);
  });

  it('holds a checker, offers its destinations, and plays the second click', () => {
    const play = vi.fn();
    const { result } = renderHook(() => useCheckerSelection(MOVES, play));

    act(() => result.current.clickPoint(5));
    expect(result.current.selectedFrom).toBe(5);
    expect(result.current.targets).toEqual([2, 1]);

    act(() => result.current.clickPoint(1));
    expect(play).toHaveBeenCalledWith(move(5, 1, 4));
    expect(result.current.selectedFrom).toBeNull();
  });

  it('re-aims at another source instead of playing nothing', () => {
    const { result } = renderHook(() => useCheckerSelection(MOVES, vi.fn()));
    act(() => result.current.clickPoint(5));
    act(() => result.current.clickPoint(8));
    expect(result.current.selectedFrom).toBe(8);
  });

  it('lets go when the click is neither a destination nor another source', () => {
    const play = vi.fn();
    const { result } = renderHook(() => useCheckerSelection(MOVES, play));
    act(() => result.current.clickPoint(5));
    act(() => result.current.clickPoint(20));
    expect(result.current.selectedFrom).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });

  it('plays a point only move outright, and leaves a point with a choice alone', () => {
    const play = vi.fn();
    const { result } = renderHook(() => useCheckerSelection(MOVES, play));

    // Point 5 has two destinations, and picking one of them is picking the
    // player's move for them.
    act(() => result.current.clickPoint(5));
    act(() => result.current.playOnlyMove(5));
    expect(play).not.toHaveBeenCalled();
    expect(result.current.selectedFrom).toBe(5);

    // Point 8 has one, so there is nothing left for a second click to say —
    // including the checker still held on 5, which this puts down.
    act(() => result.current.playOnlyMove(8));
    expect(play).toHaveBeenCalledWith(move(8, 4, 4));
    expect(result.current.selectedFrom).toBeNull();
  });

  it('answers where a checker could go without holding it first', () => {
    // What a drag asks: it has to light the destinations up in the same gesture
    // that picks the checker up, and cannot wait for a render to say so.
    const { result } = renderHook(() => useCheckerSelection(MOVES, vi.fn()));
    expect(result.current.targetsFrom(5)).toEqual([2, 1]);
    expect(result.current.targetsFrom(11)).toEqual([]);
    expect(result.current.selectedFrom).toBeNull();
  });

  it('holds a source outright, with none of the click flow guesswork', () => {
    const play = vi.fn();
    const { result } = renderHook(() => useCheckerSelection(MOVES, play));
    // Point 8 is both a source and a destination of the held checker. A click
    // there means "play the move"; a drag starting there means "pick this up",
    // which is why a drag does not go through `clickPoint`.
    act(() => result.current.selectFrom(5));
    act(() => result.current.selectFrom(8));
    expect(play).not.toHaveBeenCalled();
    expect(result.current.selectedFrom).toBe(8);
  });

  it('plays a move outright, whatever happens to be held', () => {
    const play = vi.fn();
    const { result } = renderHook(() => useCheckerSelection(MOVES, play));
    act(() => result.current.selectFrom(5));
    act(() => result.current.moveChecker(8, 4));
    expect(play).toHaveBeenCalledWith(move(8, 4, 4));
    expect(result.current.selectedFrom).toBeNull();
  });

  it('plays nothing for a move that is not on the list', () => {
    const play = vi.fn();
    const { result } = renderHook(() => useCheckerSelection(MOVES, play));
    act(() => result.current.moveChecker(5, 3));
    expect(play).not.toHaveBeenCalled();
  });

  it('drops a selection the moment its point stops being playable', () => {
    // The turn ends, or the move that was held gets played from elsewhere. The
    // selection is derived rather than stored precisely so this needs no effect
    // to notice it, and so a stale point can never be handed to the board.
    const { result, rerender } = renderHook(({ moves }) => useCheckerSelection(moves, vi.fn()), {
      initialProps: { moves: MOVES },
    });
    act(() => result.current.clickPoint(5));
    expect(result.current.selectedFrom).toBe(5);

    rerender({ moves: [] });
    expect(result.current.selectedFrom).toBeNull();
    expect(result.current.targets).toEqual([]);
  });

  it('is inert off-turn, because there is nothing legal to do', () => {
    const play = vi.fn();
    const { result } = renderHook(() => useCheckerSelection([], play));
    act(() => result.current.clickPoint(5));
    act(() => result.current.selectFrom(5));
    expect(result.current.selectedFrom).toBeNull();
    act(() => result.current.moveChecker(5, 1));
    expect(play).not.toHaveBeenCalled();
  });

  it('handles the bar and the tray like any other end of a move', () => {
    const play = vi.fn();
    const entering: Move[] = [move(BAR, 21, 3), move(3, OFF, 4)];
    const { result } = renderHook(() => useCheckerSelection(entering, play));
    expect(result.current.selectableFroms).toEqual([BAR, 3]);
    act(() => result.current.clickPoint(BAR));
    expect(result.current.targets).toEqual([21]);
    act(() => result.current.moveChecker(3, OFF));
    expect(play).toHaveBeenCalledWith(move(3, OFF, 4));
  });
});
