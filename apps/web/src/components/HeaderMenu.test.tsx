import { useState } from 'react';
import { createPortal } from 'react-dom';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { HeaderSlot } from '@/headerSlot';
import { HeaderMenu } from '@/components/HeaderMenu';

/**
 * Stands in for `LocalPanel`/`OnlinePanel`: portals one button into whatever slot
 * the menu hands out, and closes the menu on the same click a real confirm would
 * — see `LocalPanel.startNewGame`.
 */
const Harness = ({ hasAction }: { hasAction: boolean }) => {
  const [slot, setSlot] = useState<HeaderSlot | null>(null);
  return (
    <>
      <HeaderMenu hasAction={hasAction} onSlotChange={setSlot} />
      {slot && createPortal(<button onClick={() => slot.closeMenu()}>Nouvelle partie</button>, slot.node)}
    </>
  );
};

const trigger = () => screen.queryByRole('button', { name: 'Actions' });
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
const expanded = () => trigger()?.getAttribute('aria-expanded');

describe('HeaderMenu', () => {
  it('renders nothing at all when there is no action to offer', () => {
    render(<Harness hasAction={false} />);
    expect(trigger()).toBeNull();
  });

  it('shows the trigger, closed, once there is an action', () => {
    render(<Harness hasAction={true} />);
    expect(trigger()).not.toBeNull();
    expect(expanded()).toBe('false');
    expect(trigger()?.getAttribute('aria-haspopup')).toBe('true');
  });

  it('opens the panel on click and moves focus into it', () => {
    render(<Harness hasAction={true} />);
    openMenu();

    expect(expanded()).toBe('true');
    const action = screen.getByRole('button', { name: 'Nouvelle partie' });
    expect(action.hidden).toBe(false);
    expect(document.activeElement).toBe(action);
  });

  it('closes when the portaled action confirms, and returns focus to the trigger', () => {
    render(<Harness hasAction={true} />);
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle partie' }));

    expect(expanded()).toBe('false');
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on Escape and returns focus to the trigger', () => {
    render(<Harness hasAction={true} />);
    openMenu();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(expanded()).toBe('false');
    expect(document.activeElement).toBe(trigger());
  });

  it('ignores any other key', () => {
    render(<Harness hasAction={true} />);
    openMenu();
    fireEvent.keyDown(document, { key: 'Enter' });

    expect(expanded()).toBe('true');
  });

  it('stays open on a mousedown inside the trigger or the panel itself', () => {
    render(<Harness hasAction={true} />);
    openMenu();

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Actions' }));
    expect(expanded()).toBe('true');

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Nouvelle partie' }));
    expect(expanded()).toBe('true');
  });

  it('closes on an outside click, without stealing focus back', () => {
    render(
      <>
        <Harness hasAction={true} />
        <button>Elsewhere</button>
      </>,
    );
    openMenu();
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    fireEvent.mouseDown(elsewhere);
    elsewhere.focus();

    expect(expanded()).toBe('false');
    expect(document.activeElement).toBe(elsewhere);
  });

  it('does not reopen already-armed when the action comes back after being lost', () => {
    const { rerender } = render(<Harness hasAction={true} />);
    openMenu();
    expect(expanded()).toBe('true');

    // The action disappears (a room was left) — the menu has nothing to show.
    rerender(<Harness hasAction={false} />);
    expect(trigger()).toBeNull();

    // A new one appears (a room was joined) — the trigger must come back closed,
    // not pre-opened from the state the first one left behind.
    rerender(<Harness hasAction={true} />);
    expect(expanded()).toBe('false');
  });

  it('reports a null slot once the action is gone', () => {
    const onSlotChange = vi.fn();
    const { rerender } = render(<HeaderMenu hasAction={true} onSlotChange={onSlotChange} />);
    expect(onSlotChange).toHaveBeenCalledWith(expect.objectContaining({ node: expect.anything() }));

    onSlotChange.mockClear();
    rerender(<HeaderMenu hasAction={false} onSlotChange={onSlotChange} />);
    expect(onSlotChange).toHaveBeenCalledWith(null);
  });
});
