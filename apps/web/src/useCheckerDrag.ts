import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { BAR, type Player } from '@backgammon/core';
import { barPile, pointPile, type PileId } from '@/lib/boardDiff';
import { outerCheckerOf } from '@/lib/checkerStack';
import { dragThresholdFor, resolveDropTarget, type DragPoint } from '@/lib/dropTarget';
import type { Rect } from '@/lib/checkerFlight';

/**
 * Picking a checker up and carrying it. The click flow underneath is untouched —
 * a drag *is* a selection plus a destination, and it commits through the same two
 * calls a pair of clicks would make.
 *
 * The gesture is built on pointer events rather than HTML5 drag-and-drop, which
 * has no touch implementation at all on iOS and cannot draw its own checker.
 */

/** Set on `<body>` for the length of a drag, so the page's chrome can react to it. */
export const DRAG_ACTIVE_ATTRIBUTE = 'data-drag-active';

export interface CheckerDrag {
  /** The point (or `BAR`) the checker was picked up from. */
  from: number;
  player: Player;
  /** The size the checker was on the board — what the ghost is drawn at. */
  width: number;
  height: number;
  pointer: DragPoint;
  /** The destination under the pointer, or `null` while it is over nothing. */
  over: number | null;
}

/** Where a drag let go, so the flight that follows starts there rather than at the point. */
export interface DragRelease {
  pile: PileId;
  rect: Rect;
}

export interface UseCheckerDragOptions {
  /** The board's root, which is the only tree a drop is resolved against. */
  rootRef: RefObject<HTMLElement | null>;
  you: Player;
  selectableFroms: number[];
  targetsFrom: (from: number) => number[];
  selectFrom: (from: number | null) => void;
  moveChecker: (from: number, to: number) => void;
}

export interface CheckerDragging {
  drag: CheckerDrag | null;
  /** Consumed by the flight effect on the commit the drop produces. */
  releaseRef: RefObject<DragRelease | null>;
  grab: (from: number, event: ReactPointerEvent<HTMLElement>) => void;
}

/**
 * Only one checker is ever in the air. A phone happily delivers a `pointerdown`
 * for a second finger landing on another point, and two drags would then fight
 * over the one selection: the second takes it and the first commits it from the
 * wrong point.
 */
let gestureInFlight = false;

/** The ghost rides centred under the pointer, so that is where it was let go of. */
const releasedAt = (pointer: DragPoint, width: number, height: number): Rect => ({
  left: pointer.x - width / 2,
  top: pointer.y - height / 2,
  width,
  height,
});

/**
 * A drag ends on `pointerup`, and the browser then fires a `click` on whatever is
 * underneath — which is the point the drag started on, whose handler would undo
 * the selection the drag just made. Swallowed once, in the capture phase, before
 * it reaches any of them.
 */
const swallowNextClick = () => {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener('click', swallow, { capture: true, once: true });
  // A gesture that was cancelled rather than released may produce no click at
  // all, and a listener left armed would eat the player's next real one.
  window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 50);
};

export const useCheckerDrag = (options: UseCheckerDragOptions): CheckerDragging => {
  const [drag, setDrag] = useState<CheckerDrag | null>(null);
  const releaseRef = useRef<DragRelease | null>(null);

  // Every option is rebuilt when the board is, and a gesture that captured them
  // on `pointerdown` would be committing against the board as it stood before the
  // drag began. The handlers below read them here instead, at the moment they act.
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const grab = useCallback((from: number, event: ReactPointerEvent<HTMLElement>) => {
    const { rootRef, you, selectableFroms, targetsFrom } = latest.current;
    if (!selectableFroms.includes(from)) return;
    // A right-click drag is a context menu, not a move.
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (gestureInFlight) return;

    const root = rootRef.current;
    const pile = from === BAR ? barPile(you) : pointPile(from);
    const checker = root && outerCheckerOf(root, pile);
    if (!root || !checker) return;
    const { width, height } = checker.getBoundingClientRect();

    // Stop the browser starting its own text-selection drag out of the point.
    if (event.pointerType === 'mouse') event.preventDefault();

    const pointerId = event.pointerId;
    const isTouch = event.pointerType === 'touch';
    const threshold = dragThresholdFor(event.pointerType || 'mouse');
    const source = event.currentTarget;
    const start: DragPoint = { x: event.clientX, y: event.clientY };
    let pointer = start;
    let started = false;
    let targets: number[] = [];

    gestureInFlight = true;

    try {
      source.setPointerCapture(pointerId);
    } catch {
      // Safari throws here often enough that the window listeners below are the
      // real mechanism and the capture is only an optimisation.
    }

    /*
     * The scroll lock. `touch-action: none` on the point is supposed to hand the
     * whole gesture over, and on iOS it does not reliably: Safari re-decides a
     * few frames in and gives it to the page scroller, which fires `pointercancel`
     * and kills the drag in mid-air — the "it starts moving and then the page
     * scrolls instead" failure. Cancelling the touch stream outright is the only
     * thing that holds. It lasts exactly one gesture, so a touch that starts
     * anywhere else still scrolls and pinches as it always did.
     */
    const holdStill = (touch: TouchEvent) => {
      if (touch.cancelable) touch.preventDefault();
    };
    if (isTouch) document.addEventListener('touchmove', holdStill, { passive: false });

    const over = (at: DragPoint) => resolveDropTarget(at, targets, root);

    const onMove = (moved: PointerEvent) => {
      if (moved.pointerId !== pointerId) return;
      pointer = { x: moved.clientX, y: moved.clientY };
      if (!started) {
        if (Math.hypot(pointer.x - start.x, pointer.y - start.y) < threshold) return;
        started = true;
        // Deferred to here so a plain tap falls straight through to the click
        // flow, and so that letting go over nothing leaves the checker held —
        // the drag then reads as the first half of a pair of clicks rather than
        // as a move that was lost.
        targets = targetsFrom(from);
        latest.current.selectFrom(from);
      }
      setDrag({ from, player: latest.current.you, width, height, pointer, over: over(pointer) });
    };

    const cleanup = () => {
      gestureInFlight = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onAbort);
      document.removeEventListener('touchmove', holdStill);
      try {
        source.releasePointerCapture(pointerId);
      } catch {
        // Nothing to release when the capture above was refused.
      }
    };

    function onUp(released: PointerEvent) {
      if (released.pointerId !== pointerId) return;
      const at: DragPoint = { x: released.clientX, y: released.clientY };
      cleanup();
      setDrag(null);
      if (!started) return;
      swallowNextClick();

      const landed = over(at);
      // Over nothing: the checker stays held, so the destination is one tap away
      // instead of the whole gesture being thrown out.
      if (landed === null) return;
      // The checker is already where the player put it down; flying it back to
      // its point first to fly it here again is the one thing a drag must not do.
      releaseRef.current = { pile, rect: releasedAt(at, width, height) };
      latest.current.moveChecker(from, landed);
    }

    /**
     * A system gesture takes the pointer stream away (an edge swipe, a call
     * banner), or the app is backgrounded and the stream simply stops without an
     * up or a cancel — which would leave the single-drag guard and the touch lock
     * armed and the board inert.
     */
    function onAbort() {
      cleanup();
      setDrag(null);
      if (started) swallowNextClick();
    }

    function onCancel(cancelled: PointerEvent) {
      if (cancelled.pointerId !== pointerId) return;
      onAbort();
    }

    /** Escape gives the checker back, rather than leaving it held over its point. */
    function onKey(key: KeyboardEvent) {
      if (key.key !== 'Escape') return;
      onAbort();
      latest.current.selectFrom(null);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onAbort);
  }, []);

  // The cursor and the page's own touch handling are not the board's to set from
  // a component, and both have to change for the whole document while a checker
  // is in the air.
  // Keyed on whether a checker is in the air, not on where it is: the session
  // itself changes on every `pointermove`, and re-running this against that would
  // pull the attribute off the body and put it back sixty times a second.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    document.body.setAttribute(DRAG_ACTIVE_ATTRIBUTE, 'true');
    return () => document.body.removeAttribute(DRAG_ACTIVE_ATTRIBUTE);
  }, [dragging]);

  return { drag, releaseRef, grab };
};
