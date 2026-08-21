/**
 * The motion itself: a checker that changed piles is drawn crossing the board
 * instead of appearing at the other end of it.
 *
 * What flies is a stand-in on the page, not the checker on the board. The board
 * draws itself from signed counts, so there is no node that travels from one
 * point to another to animate — but the deciding reason is the portrait phone,
 * where the whole board sits under a `rotate(90deg)`. A transform on a checker
 * inside that frame is applied in the frame's turned coordinates, so a screen-space
 * offset would send it off at right angles; a `position: fixed` element on the body
 * is outside the rotation, and one set of screen coordinates is then right in both
 * orientations. It is also above every point it crosses, which a checker inside its
 * own point can never be.
 *
 * The checker that landed is hidden for the length of the trip rather than the
 * board being held back a frame. React commits the truth — the count, the stack
 * depth, the label a screen reader reads — and only the paint is deferred.
 */

/**
 * The whole of a hit — the wait, then the blot's own trip — has to finish inside
 * the beat the AI leaves between two checkers, or the next move cancels it in
 * mid-air. `AI_MOVE_MS` is the budget, and a test holds these three to it.
 */
export const FLIGHT_MS = 220;
/**
 * Measured from the same moment as the flight that caused it, so this is most of
 * the hitter's trip: the blot goes as that checker comes down on it, overlapping
 * the last of the flight. Leaving earlier reads as a blot that fled before the
 * hit connected, and waiting for a clean landing reads as two unrelated moves.
 */
export const HIT_DELAY_MS = 170;
export const HIT_FLIGHT_MS = 180;

/** A checker is put down, not thrown: it carries speed and then settles. */
const TRAVEL = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

/** Below this the two piles are effectively the same place, and motion would be noise. */
const MIN_TRAVEL_PX = 1;

export interface Spot {
  x: number;
  y: number;
}

export const centreOf = (rect: DOMRect): Spot => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

/**
 * Asked per flight rather than read once: the setting can change under a running
 * tab, and a board that kept animating after it did is the whole point of it.
 */
const wantsStillness = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Web Animations is how this is done; jsdom and very old engines simply do not move. */
const canAnimate = (element: Element): boolean => typeof element.animate === 'function' && !wantsStillness();

export interface Flight {
  /** Screen rect of the checker as it stood before the move — where the trip starts. */
  from: DOMRect;
  /** Screen point it is heading for. */
  to: Spot;
  /**
   * The checker now standing at the destination, hidden while its stand-in is in
   * the air. `null` when there is none to hide: a tray draws a number, not a stack.
   */
  arrival: HTMLElement | null;
  duration?: number;
  delay?: number;
}

/** Ends a flight early, putting the board back exactly as finishing would have. */
export type StopFlight = () => void;

/**
 * Send `flyer` across the screen. Returns the way to end it early, or `null` when
 * nothing moved — which is what a player who asked for no motion gets.
 */
export const flyChecker = (flyer: HTMLElement, flight: Flight): StopFlight | null => {
  const { from, to, arrival } = flight;
  if (!canAnimate(flyer)) return null;

  const start = centreOf(from);
  const dx = to.x - start.x;
  const dy = to.y - start.y;
  if (Math.abs(dx) < MIN_TRAVEL_PX && Math.abs(dy) < MIN_TRAVEL_PX) return null;

  Object.assign(flyer.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: '0',
    zIndex: '30',
    pointerEvents: 'none',
  });
  flyer.setAttribute('aria-hidden', 'true');
  document.body.append(flyer);

  const hidden = arrival?.style.visibility ?? '';
  if (arrival) arrival.style.visibility = 'hidden';

  // Bearing off ends on a tray with a number on it: there is nothing to uncover,
  // so the stand-in shrinks away rather than landing on a checker that isn't there.
  const lands = arrival !== null;
  const animation = flyer.animate(
    [
      { transform: 'none', opacity: '1' },
      { transform: `translate(${dx}px, ${dy}px)${lands ? '' : ' scale(0.55)'}`, opacity: lands ? '1' : '0' },
    ],
    {
      duration: flight.duration ?? FLIGHT_MS,
      delay: flight.delay ?? 0,
      easing: TRAVEL,
      // A delayed flight has to already be at its origin while it waits, or the
      // checker shows up at the destination and then jumps back to the start.
      fill: 'backwards',
    },
  );

  // Once only: a flight that is stopped early settles on the spot and then has
  // its `cancel` event arrive afterwards, and the second pass would undo the first.
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    flyer.remove();
    if (arrival) arrival.style.visibility = hidden;
  };
  animation.onfinish = settle;
  animation.oncancel = settle;

  // `cancel()` only *queues* its event, so a caller that cancelled and then read
  // the DOM would still see the checker hidden — and a flight starting in that
  // window would record `hidden` as the state to restore and hide it for good.
  // Settling here, before cancelling, closes that window.
  return () => {
    settle();
    animation.cancel();
  };
};
