import { createContext, useContext } from 'react';

export interface FullscreenState {
  isFullscreen: boolean;
  /** False where the Fullscreen API does not exist at all — iOS Safari. */
  isSupported: boolean;
  toggle: () => void;
}

/**
 * Whether the page is in real fullscreen, shared rather than read twice.
 *
 * `body[data-fullscreen]` already carries this to every consumer that is a CSS
 * selector, and that stays the mechanism for anything CSS can do on its own.
 * This is for the two that cannot: the page header, which draws the version line
 * in a different *place* rather than a different style, and {@link GameLayout},
 * which moves the controls and the status inside the board's own frame. Both are
 * DOM moves, and a second `useFullscreen()` would mean two effects racing to set
 * and clear the same attribute.
 *
 * The default is the windowed layout, so a component rendered outside the
 * provider — a test of one panel — behaves as it always did.
 */
export const FullscreenContext = createContext<FullscreenState>({
  isFullscreen: false,
  isSupported: false,
  toggle: () => {},
});

export const useFullscreenState = (): FullscreenState => useContext(FullscreenContext);
