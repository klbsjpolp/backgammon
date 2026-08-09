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

  it('keeps its accessible name while armed, so the action stays findable', () => {
    render(<ConfirmButton label="Leave" confirmLabel="Leave game?" onConfirm={vi.fn()} />);

    expect(button().textContent).toBe('Leave');
    fireEvent.click(button());
    expect(button().textContent).toBe('Leave game?');
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
    expect(button().textContent).toBe('Leave');

    // The tap that follows arms it again rather than confirming the stale one.
    fireEvent.click(button());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('disarms when the player reaches for something else', () => {
    render(<ConfirmButton label="Leave" onConfirm={vi.fn()} />);

    fireEvent.click(button());
    fireEvent.blur(button());
    expect(button().textContent).toBe('Leave');
  });
});
