import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createInitialState, type GameState } from '@backgammon/core';
import { SAVED_GAME_STORAGE_KEY } from '@/lib/savedGame';
import { useLocalGame } from './useLocalGame';

const saved = (): unknown => JSON.parse(localStorage.getItem(SAVED_GAME_STORAGE_KEY) ?? 'null');

describe('useLocalGame — the saved game', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves the game as it changes', () => {
    const { result } = renderHook(() => useLocalGame());
    act(() => result.current.rollDice());

    expect(saved()).toEqual(result.current.state);
  });

  it('picks up where the last visit left off', () => {
    const first = renderHook(() => useLocalGame());
    act(() => first.result.current.rollDice());
    const played = first.result.current.state;
    first.unmount();

    const { result } = renderHook(() => useLocalGame());
    expect(result.current.state).toEqual(played);
    expect(result.current.legalMoves.length).toBeGreaterThan(0);
  });

  it('keeps a finished game, so the result is still there to read', () => {
    const over: GameState = {
      ...createInitialState('white'),
      phase: 'gameOver',
      result: { winner: 'black', kind: 'gammon', points: 4, cubeValue: 2 },
    };
    localStorage.setItem(SAVED_GAME_STORAGE_KEY, JSON.stringify(over));

    const { result } = renderHook(() => useLocalGame());
    expect(result.current.state.result).toEqual(over.result);
  });

  it('reads a game saved before `noPlay` existed', () => {
    // An update lands on reload, so the saved game is routinely an older
    // release's — the same tolerance the wire needs.
    const older: Partial<GameState> = createInitialState('white');
    delete older.noPlay;
    localStorage.setItem(SAVED_GAME_STORAGE_KEY, JSON.stringify(older));

    const { result } = renderHook(() => useLocalGame());
    expect(result.current.state).toEqual(createInitialState('white'));
  });

  it('starts afresh, and says so, when what was saved is not a game', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(SAVED_GAME_STORAGE_KEY, '{"board":"nonsense"}');

    const { result } = renderHook(() => useLocalGame());
    expect(result.current.state).toEqual(createInitialState('white'));
    expect(warn).toHaveBeenCalledOnce();
  });

  it('starts afresh when what was saved is not even JSON', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(SAVED_GAME_STORAGE_KEY, '{');

    const { result } = renderHook(() => useLocalGame());
    expect(result.current.state).toEqual(createInitialState('white'));
  });

  it('starts afresh when storage refuses to be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    const { result } = renderHook(() => useLocalGame());
    expect(result.current.state).toEqual(createInitialState('white'));
  });

  it('plays on when storage refuses to be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    const { result } = renderHook(() => useLocalGame());
    act(() => result.current.rollDice());
    expect(result.current.state.phase).toBe('moving');
  });

  it('overwrites the saved game with the new one', () => {
    const { result } = renderHook(() => useLocalGame());
    act(() => result.current.rollDice());
    act(() => result.current.newGame());

    expect(saved()).toEqual(createInitialState('white'));
  });
});
