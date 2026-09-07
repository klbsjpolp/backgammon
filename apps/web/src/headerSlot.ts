import { createContext, useContext } from 'react';

/**
 * Where a panel's abandon-the-game controls are drawn: always the header's menu
 * now, never the control column below it — see `HeaderMenu`. `node` is the
 * portal target inside that menu's panel; `closeMenu` lets the action that just
 * fired (a new game started, a room left) close the menu behind it, rather than
 * leaving it open over a screen the confirmed button no longer describes.
 *
 * Null when there is nothing to portal at all (the online "host or join" screen,
 * which has no abandon action to offer) — see `HeaderMenu`'s `hasAction`. It is a
 * DOM node rather than a boolean because the move is a real one — the button is
 * portaled into the menu, not duplicated there and hidden by a media query.
 * There is exactly one "Nouvelle partie" in the accessible tree, which is the
 * property a second copy would cost.
 */
export interface HeaderSlot {
  node: HTMLElement;
  closeMenu: () => void;
}

export const HeaderSlotContext = createContext<HeaderSlot | null>(null);

export const useHeaderSlot = (): HeaderSlot | null => useContext(HeaderSlotContext);
