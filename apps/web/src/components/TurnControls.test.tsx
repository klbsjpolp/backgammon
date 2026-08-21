import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TurnControls, type TurnControlsProps } from './TurnControls';

const props = (overrides: Partial<TurnControlsProps> = {}): TurnControlsProps => ({
  canRoll: true,
  canDouble: true,
  isDoubleToYou: false,
  isHolding: false,
  autoRoll: false,
  onRoll: vi.fn(),
  onDouble: vi.fn(),
  onAutoRollChange: vi.fn(),
  onRespond: vi.fn(),
  onClearSelection: vi.fn(),
  ...overrides,
});

/**
 * The row's width is fixed by CSS; what has to hold in the markup is that the
 * count never changes, because a fourth control is what wrapped the row onto a
 * second line on a phone and moved every button under it 52px down the screen.
 */
const controlCount = (container: HTMLElement) => container.querySelectorAll('button, input[type="checkbox"]').length;

describe('TurnControls — the row that must not grow', () => {
  it('is three controls while there is nothing to answer', () => {
    const { container } = render(<TurnControls {...props()} />);
    expect(controlCount(container)).toBe(3);
    expect(screen.getByRole('button', { name: /^roll$/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /^double$/i })).toBeDefined();
  });

  it('is three controls with a checker in hand — cancel stands in for double', () => {
    const p = props({ isHolding: true });
    const { container } = render(<TurnControls {...p} />);

    expect(controlCount(container)).toBe(3);
    // Doubling is impossible mid-move, which is what makes the slot free.
    expect(screen.queryByRole('button', { name: /^double$/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));
    expect(p.onClearSelection).toHaveBeenCalled();
  });

  it('is three controls while a double waits on you — take and drop stand in', () => {
    const p = props({ isDoubleToYou: true });
    const { container } = render(<TurnControls {...p} />);

    expect(controlCount(container)).toBe(3);
    // Neither rolling nor doubling can happen until this is answered.
    expect(screen.queryByRole('button', { name: /^roll$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^double$/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^take$/i }));
    expect(p.onRespond).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: /^drop$/i }));
    expect(p.onRespond).toHaveBeenCalledWith(false);
  });

  it('answers the double before it clears a selection, since a held checker is stale by then', () => {
    render(<TurnControls {...props({ isDoubleToYou: true, isHolding: true })} />);
    expect(screen.getByRole('button', { name: /^drop$/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /clear selection/i })).toBeNull();
  });
});
