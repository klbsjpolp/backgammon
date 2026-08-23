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
    expect(screen.getByRole('button', { name: /^lancer$/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /^doubler$/i })).toBeDefined();
  });

  it('keeps one spoken name for auto-roll, whichever half of its label the screen shows', () => {
    // The visible text is "Lancer auto" with room and "Auto" without it, because
    // three controls need 342px and a 360px phone gives the row 328 — the width
    // that used to wrap it. Which half CSS shows cannot decide the accessible
    // name: no stylesheet runs here, and a name that moved with the viewport
    // would strand a speech-input user on the narrow one. So it is pinned, and
    // it contains "Auto", which is what WCAG 2.5.3 asks of a shortened label.
    const p = props();
    render(<TurnControls {...p} />);

    const auto = screen.getByRole('checkbox', { name: 'Lancer auto' });
    fireEvent.click(auto);
    expect(p.onAutoRollChange).toHaveBeenCalledWith(true);
  });

  it('names the cancel button so a speech-input user can say what they see', () => {
    // WCAG 2.5.3: the accessible name has to contain the visible label, or
    // "click Cancel" reaches nothing — on the one control for putting a held
    // checker back down.
    render(<TurnControls {...props({ isHolding: true })} />);
    const cancel = screen.getByRole('button', { name: /^annuler/i });
    expect(cancel.textContent).toBe('Annuler');
    expect(cancel.getAttribute('aria-label')).toMatch(/^Annuler\b/);
  });

  it('is three controls with a checker in hand — cancel stands in for double', () => {
    const p = props({ isHolding: true });
    const { container } = render(<TurnControls {...p} />);

    expect(controlCount(container)).toBe(3);
    // Doubling is impossible mid-move, which is what makes the slot free.
    expect(screen.queryByRole('button', { name: /^doubler$/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^annuler/i }));
    expect(p.onClearSelection).toHaveBeenCalled();
  });

  it('is three controls while a double waits on you — take and drop stand in', () => {
    const p = props({ isDoubleToYou: true });
    const { container } = render(<TurnControls {...p} />);

    expect(controlCount(container)).toBe(3);
    // Neither rolling nor doubling can happen until this is answered.
    expect(screen.queryByRole('button', { name: /^lancer$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^doubler$/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^prendre$/i }));
    expect(p.onRespond).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: /^refuser$/i }));
    expect(p.onRespond).toHaveBeenCalledWith(false);
  });

  it('answers the double before it clears a selection, since a held checker is stale by then', () => {
    render(<TurnControls {...props({ isDoubleToYou: true, isHolding: true })} />);
    expect(screen.getByRole('button', { name: /^refuser$/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^annuler/i })).toBeNull();
  });
});
