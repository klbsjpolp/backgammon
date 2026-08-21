import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ConfirmButton } from './Button';

describe('ConfirmButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const button = () => screen.getByRole('button', { name: 'Leave' });

  /**
   * Both labels are always in the DOM — that is what keeps the button one width
   * across the arming it asks for — so `textContent` is both of them at once.
   * What the player sees is the one that is not hidden.
   */
  const visibleLabel = () => button().querySelector('[aria-hidden="false"]')?.textContent;

  it('keeps its accessible name while armed, so the action stays findable', () => {
    render(<ConfirmButton label="Leave" confirmLabel="Leave game?" onConfirm={vi.fn()} />);

    expect(visibleLabel()).toBe('Leave');
    fireEvent.click(button());
    expect(visibleLabel()).toBe('Leave game?');
  });

  it('announces the armed state, which the pinned name would otherwise hide', () => {
    render(<ConfirmButton label="Leave" confirmLabel="Leave game?" onConfirm={vi.fn()} />);
    const status = screen.getByRole('status');

    // Nothing to announce until the first tap arms it.
    expect(status.textContent).toBe('');

    fireEvent.click(button());
    expect(status.textContent).toMatch(/leave: tap again to confirm/i);

    fireEvent.click(button());
    expect(status.textContent).toBe('');
  });

  it('needs a second tap before it fires', () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Leave" onConfirm={onConfirm} />);

    fireEvent.click(button());
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(button());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('forgets a lone tap after a few seconds', () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Leave" onConfirm={onConfirm} />);

    fireEvent.click(button());
    act(() => void vi.advanceTimersByTime(5000));
    expect(visibleLabel()).toBe('Leave');

    // The tap that follows arms it again rather than confirming the stale one.
    fireEvent.click(button());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('disarms when the player reaches for something else', () => {
    render(<ConfirmButton label="Leave" onConfirm={vi.fn()} />);

    fireEvent.click(button());
    fireEvent.blur(button());
    expect(visibleLabel()).toBe('Leave');
  });

  it('fires on the first tap when there is nothing left to guard', () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton label="Leave" confirm={false} onConfirm={onConfirm} />);

    fireEvent.click(button());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    // Still the same element, and still the same width: the confirm label is
    // in the DOM reserving it whether or not the guard is asked for.
    expect(visibleLabel()).toBe('Leave');
  });
});
