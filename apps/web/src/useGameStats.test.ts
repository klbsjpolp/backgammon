import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createInitialState, offerDouble, respondDouble } from '@backgammon/core';
import type { GameState } from '@backgammon/core';
import { reportGameCompleted } from '@/lib/gameAnalytics';
import { GAME_STATS_STORAGE_KEY, useGameStats } from '@/useGameStats';

vi.mock('@/lib/gameAnalytics', () => ({ reportGameCompleted: vi.fn() }));

const report = vi.mocked(reportGameCompleted);

const opening = createInitialState('white');
const offered = offerDouble(opening);
const dropped = respondDouble(offered, false);

describe('useGameStats', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => report.mockClear());

  it('reports a finished local game once', () => {
    const { rerender } = renderHook(({ state }) => useGameStats(state, { mode: 'local', aiPlayer: 'black' }), {
      initialProps: { state: opening as GameState },
    });
    rerender({ state: offered });
    rerender({ state: dropped });
    rerender({ state: dropped });

    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toMatchObject({ mode: 'local', endReason: 'doubleDropped', winner: 'white' });
    // Nothing is left to resume once the game has been reported.
    expect(localStorage.getItem(GAME_STATS_STORAGE_KEY)).toBeNull();
  });

  it('carries a local game across a remount', () => {
    const first = renderHook(({ state }) => useGameStats(state, { mode: 'local', aiPlayer: 'black' }), {
      initialProps: { state: opening as GameState },
    });
    first.rerender({ state: offered });
    expect(localStorage.getItem(GAME_STATS_STORAGE_KEY)).not.toBeNull();
    first.unmount();

    // The restored game is not the opening position, so only a restored recording can report it.
    renderHook(() => useGameStats(dropped, { mode: 'local', aiPlayer: 'black' }));
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('reports nothing for a client handed no state (the online guest)', () => {
    renderHook(() => useGameStats(null, { mode: 'online', aiPlayer: null }));
    expect(report).not.toHaveBeenCalled();
  });

  it('keeps nothing in storage for an online game', () => {
    const { rerender } = renderHook(({ state }) => useGameStats(state, { mode: 'online', aiPlayer: null }), {
      initialProps: { state: opening as GameState },
    });
    rerender({ state: offered });
    expect(localStorage.getItem(GAME_STATS_STORAGE_KEY)).toBeNull();
    rerender({ state: dropped });
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toMatchObject({ mode: 'online', winnerIsAI: false });
  });

  it('ignores a saved recording it cannot read', () => {
    localStorage.setItem(GAME_STATS_STORAGE_KEY, '{not json');
    renderHook(() => useGameStats(dropped, { mode: 'local', aiPlayer: 'black' }));
    expect(report).not.toHaveBeenCalled();
  });

  it('saves the recording when the page is hidden or left', () => {
    renderHook(() => useGameStats(opening, { mode: 'local', aiPlayer: 'black' }));
    localStorage.removeItem(GAME_STATS_STORAGE_KEY);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(localStorage.getItem(GAME_STATS_STORAGE_KEY)).not.toBeNull();
    visibility.mockRestore();

    localStorage.removeItem(GAME_STATS_STORAGE_KEY);
    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem(GAME_STATS_STORAGE_KEY)).not.toBeNull();
  });
});
