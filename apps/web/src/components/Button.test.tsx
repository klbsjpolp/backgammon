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

  // Named by its visible word in both states now, so the query cannot be one
  // fixed string — these tests render the one button, so ask for the one button.
  const button = () => screen.getByRole('button');

  /**
   * Both labels are always in the DOM — that is what keeps the button one width
   * across the arming it asks for — so `textContent` is both of them at once.
   * What the player sees is the one that is not hidden.
   */
  const visibleLabel = () => button().querySelector('[aria-hidden="false"]')?.textContent;

  it('answers to the word on it in both states, and still says what the action is', () => {
    // WCAG 2.5.3: a speech-input user says what they can see, and the first tap
    // is what changes what they can see — so a name pinned to `label` stranded
    // them halfway through, unable to speak the confirming tap.
    render(<ConfirmButton label="Leave" confirmLabel="Leave game?" onConfirm={vi.fn()} />);

    expect(visibleLabel()).toBe('Leave');
    expect(button().getAttribute('aria-label')).toBe('Leave');

    fireEvent.click(button());
    expect(visibleLabel()).toBe('Leave game?');
    // Leads with the visible words, so voice matching works; the rest keeps the
    // action findable by its own name for a reader navigating by it.
    expect(button().getAttribute('aria-label')).toBe('Leave game?, confirm Leave');
  });

  it('takes the name back when the guard drops, rather than leaving it armed', () => {
    const { rerender } = render(<ConfirmButton label="Leave" confirmLabel="Leave game?" onConfirm={vi.fn()} />);
    fireEvent.click(button());
    expect(button().getAttribute('aria-label')).toBe('Leave game?, confirm Leave');

    rerender(<ConfirmButton label="Leave" confirmLabel="Leave game?" confirm={false} onConfirm={vi.fn()} />);
    expect(button().getAttribute('aria-label')).toBe('Leave');
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

  it('disarms when the guard drops out from under it', () => {
    // Arming survives as state, and this component now survives the flip that
    // used to remount it — so a game that ends inside the four seconds would
    // otherwise leave a one-tap action sitting there red, reading "Leave
    // game?" and still announcing that a second tap is needed.
    const { rerender } = render(<ConfirmButton label="Leave" confirmLabel="Leave game?" onConfirm={vi.fn()} />);
    fireEvent.click(button());
    expect(visibleLabel()).toBe('Leave game?');

    rerender(<ConfirmButton label="Leave" confirmLabel="Leave game?" confirm={false} onConfirm={vi.fn()} />);
    expect(visibleLabel()).toBe('Leave');
    expect(screen.getByRole('status').textContent).toBe('');
    expect(button().className).not.toContain('bg-danger');
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
