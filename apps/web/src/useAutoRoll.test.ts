import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAutoRoll } from './useAutoRoll';

describe('useAutoRoll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

  it('rolls once the delay is up, and only while enabled', () => {
    const roll = vi.fn();
    const { rerender } = renderHook(({ enabled }) => useAutoRoll(enabled, true, roll), {
      initialProps: { enabled: false },
    });

    advance(1000);
    expect(roll).not.toHaveBeenCalled();

    rerender({ enabled: true });
    advance(1000);
    expect(roll).toHaveBeenCalledTimes(1);
  });

  it('drops the pending roll when the turn stops being ours', () => {
    const roll = vi.fn();
    const { rerender } = renderHook(({ canRoll }) => useAutoRoll(true, canRoll, roll), {
      initialProps: { canRoll: true },
    });

    rerender({ canRoll: false });
    advance(1000);
    expect(roll).not.toHaveBeenCalled();
  });

  it('waits longer when a roll nobody could play is still on screen', () => {
    // The dice it is about to replace are the ones that went unplayed: the whole
    // reason they are drawn is that the rules gave the player no chance to see
    // them, and 300ms is no chance either.
    const roll = vi.fn();
    renderHook(() => useAutoRoll(true, true, roll, true));

    advance(300);
    expect(roll).not.toHaveBeenCalled();

    advance(1200);
    expect(roll).toHaveBeenCalledTimes(1);
  });

  it('does not restart the timer when only the callback changes', () => {
    // What the ref buys us: online, `roll` is rebuilt on every frame the host
    // broadcasts. If that restarted the timer, a busy room would push the roll
    // out indefinitely.
    const roll = vi.fn();
    const { rerender } = renderHook(({ fn }) => useAutoRoll(true, true, fn), { initialProps: { fn: roll } });

    advance(200);
    rerender({ fn: vi.fn(() => roll()) });
    advance(200);

    expect(roll).toHaveBeenCalledTimes(1);
  });
});
