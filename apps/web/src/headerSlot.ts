import { createContext, useContext } from 'react';

/**
 * Where a panel's abandon-the-game controls are drawn, when they are not drawn
 * under the board: the element the page header hands out on a roomy screen, or
 * null on a phone, where they stay in the control column below.
 *
 * It is a DOM node rather than a boolean because the move is a real one — the
 * button is portaled into the header, not duplicated there and hidden by a media
 * query. There is exactly one "Nouvelle partie" in the accessible tree either
 * way, which is the property a second copy would cost.
 */
export const HeaderSlotContext = createContext<HTMLElement | null>(null);

export const useHeaderSlot = (): HTMLElement | null => useContext(HeaderSlotContext);
