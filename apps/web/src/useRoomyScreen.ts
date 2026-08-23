import { useSyncExternalStore } from 'react';

/**
 * Neither a portrait phone nor a landscape one — the screens `index.css` leaves
 * on the flat, board-above-controls layout.
 *
 * The two halves are the negation of the `max-sm` and `compact` variants, and
 * are kept in step with them **by hand**: CSS will not tell you what a custom
 * variant resolved to, and the placement this drives is a DOM move rather than a
 * style, so it cannot be a media query on our side either. If those breakpoints
 * change in `index.css`, this string changes with them.
 */
const ROOMY = '(min-width: 640px) and (not ((orientation: landscape) and (max-height: 640px)))';

/** False where `matchMedia` does not exist — jsdom, which then sees the phone layout. */
const matches = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia(ROOMY).matches;

const subscribe = (onChange: () => void): (() => void) => {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(ROOMY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

export const useRoomyScreen = (): boolean => useSyncExternalStore(subscribe, matches, () => false);
