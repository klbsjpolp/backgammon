import { createContext, useContext } from 'react';

/**
 * The element the dice are drawn into. The header row owns it, the board owns the
 * dice themselves — only the game panels know what was rolled — so the board
 * portals into whatever this resolves to.
 *
 * `null` means "no slot": the board then draws the dice under itself, which is
 * what a `<Board>` rendered on its own (a test, a future embed) gets.
 */
export const DiceSlotContext = createContext<HTMLElement | null>(null);

export const useDiceSlot = (): HTMLElement | null => useContext(DiceSlotContext);
