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

/**
 * One `MediaQueryList`, kept rather than rebuilt. `getSnapshot` runs on every
 * render, and constructing one just to read `.matches` off it and drop it again
 * is work for nothing.
 *
 * Keyed on `window.matchMedia` itself, not merely memoised: the tests install
 * their own `matchMedia` per case and delete it afterwards, so a cache that only
 * checked whether it held something would answer the second test with the first
 * one's screen. Null where the function does not exist at all — jsdom, which
 * then sees the phone layout.
 */
let cached: { from: unknown; query: MediaQueryList } | null = null;

const mediaQuery = (): MediaQueryList | null => {
  if (typeof window.matchMedia !== 'function') return null;
  /*
   * `unbound-method` guards against a method losing its receiver. This one is
   * never called through the reference — it is only ever compared, and the call
   * below goes through `window` — so the risk the rule describes cannot arise.
   */
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const from: unknown = window.matchMedia;
  // `cached !== null` explicitly rather than `cached?.from === from`: `from` is
  // `unknown`, so the optional chain's `undefined` does not rule out a null cache.
  if (cached !== null && cached.from === from) return cached.query;

  const query = window.matchMedia(ROOMY);
  cached = { from, query };
  return query;
};

const matches = (): boolean => mediaQuery()?.matches ?? false;

const subscribe = (onChange: () => void): (() => void) => {
  const query = mediaQuery();
  if (!query) return () => {};
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

export const useRoomyScreen = (): boolean => useSyncExternalStore(subscribe, matches, () => false);
