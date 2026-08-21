import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BAR, createInitialState, OFF, type GameState, type Player } from '@backgammon/core';
import { Board, type BoardController } from './Board';

/*
 * jsdom has no layout, and a drag is almost entirely layout: which square the
 * pointer is over is a question about rects. They are stubbed here from the very
 * attribute the drop resolver reads, so the board under test is laid out the way
 * the board on screen is — squares side by side, gutters between them — without
 * a layout engine having to produce it.
 */
const ZONE_WIDTH = 40;
const ZONE_GUTTER = 6;

/** Squares that can never be moved to share a slot well clear of the points. */
const NOWHERE_SLOT = 40;

const rectAt = (slot: number): DOMRect => {
  const left = slot * (ZONE_WIDTH + ZONE_GUTTER);
  return {
    x: left,
    y: 0,
    left,
    top: 0,
    right: left + ZONE_WIDTH,
    bottom: ZONE_WIDTH,
    width: ZONE_WIDTH,
    height: ZONE_WIDTH,
    toJSON: () => ({}),
  } as DOMRect;
};

/** A checker stands in the middle of its own square, as it does on the board. */
const CHECKER_SIZE = 20;

const checkerRectIn = (slot: number): DOMRect => {
  const inset = (ZONE_WIDTH - CHECKER_SIZE) / 2;
  const left = slot * (ZONE_WIDTH + ZONE_GUTTER) + inset;
  return {
    x: left,
    y: inset,
    left,
    top: inset,
    right: left + CHECKER_SIZE,
    bottom: inset + CHECKER_SIZE,
    width: CHECKER_SIZE,
    height: CHECKER_SIZE,
    toJSON: () => ({}),
  } as DOMRect;
};

const slotOf = (zone: string): number => {
  const index = Number.parseInt(zone, 10);
  return Number.isNaN(index) ? NOWHERE_SLOT : index;
};

const realGetRect = Element.prototype.getBoundingClientRect;

const stubbedRect = function (this: Element): DOMRect {
  const zone = this.getAttribute('data-drop-zone');
  if (zone !== null) return rectAt(slotOf(zone));
  // Checkers and the stacks holding them: inside whichever square they belong to.
  const square = this.closest('[data-drop-zone]');
  const inside = square?.getAttribute('data-drop-zone');
  return inside == null ? rectAt(-20) : checkerRectIn(slotOf(inside));
};

/** The centre of the square a point, the bar or a tray occupies. */
const centreOfZone = (slot: number) => ({
  x: slot * (ZONE_WIDTH + ZONE_GUTTER) + ZONE_WIDTH / 2,
  y: ZONE_WIDTH / 2,
});

/** The same, as a pointer event aims at it. */
const atZone = (slot: number) => {
  const { x, y } = centreOfZone(slot);
  return { clientX: x, clientY: y };
};

interface PointerBits {
  clientX: number;
  clientY: number;
  pointerId?: number;
  pointerType?: string;
  button?: number;
}

/**
 * jsdom ships no `PointerEvent`, and the fields the gesture reads (`pointerId`,
 * `pointerType`, the coordinates, the button) all exist on a `MouseEvent` or can
 * be put there. React dispatches on the event's type, not on its constructor.
 */
const pointerEvent = (type: string, bits: PointerBits): Event => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: bits.clientX,
    clientY: bits.clientY,
    button: bits.button ?? 0,
  });
  Object.assign(event, { pointerId: bits.pointerId ?? 1, pointerType: bits.pointerType ?? 'mouse' });
  return event;
};

/** Board with a checker on point 5 that can go to point 2, or bear off. */
const movingState = (): GameState => {
  const points = new Array<number>(24).fill(0);
  points[5] = 2;
  points[2] = 1;
  return {
    ...createInitialState('white'),
    board: { points, bar: { white: 0, black: 0 }, off: { white: 12, black: 12 } },
    phase: 'moving',
    roll: [3, 6],
    remaining: [3, 6],
  };
};

const controllerFor = (overrides: Partial<BoardController> = {}): BoardController => ({
  state: movingState(),
  you: 'white' as Player,
  selectableFroms: [5],
  selectedFrom: null,
  targets: [],
  clickPoint: vi.fn(),
  playOnlyMove: vi.fn(),
  targetsFrom: (from) => (from === 5 ? [2, OFF] : []),
  selectFrom: vi.fn(),
  moveChecker: vi.fn(),
  ...overrides,
});

const pointAt = (index: number) => screen.getByText(String(index + 1)).closest('button') as HTMLElement;

/** Press, travel far enough to count, and stop over `slot` without letting go. */
const dragFrom = (source: HTMLElement, slot: number, pointerType = 'mouse') => {
  const start = centreOfZone(5);
  fireEvent(source, pointerEvent('pointerdown', { clientX: start.x, clientY: start.y, pointerType }));
  // One move over the threshold to become a drag, then the aim itself.
  fireEvent(window, pointerEvent('pointermove', { clientX: start.x + 20, clientY: start.y, pointerType }));
  const at = centreOfZone(slot);
  fireEvent(window, pointerEvent('pointermove', { clientX: at.x, clientY: at.y, pointerType }));
  return at;
};

beforeEach(() => {
  Element.prototype.getBoundingClientRect = stubbedRect;
  // Only one checker is ever in the air, and the guard that says so is as global
  // as the pointer stream it guards. A test that ends mid-drag would otherwise
  // leave it armed and the next one unable to pick anything up at all.
  for (const pointerId of [1, 2]) {
    fireEvent(window, pointerEvent('pointercancel', { clientX: 0, clientY: 0, pointerId }));
  }
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = realGetRect;
  document.body.removeAttribute('data-drag-active');
});

describe('dragging a checker', () => {
  it('leaves a press that does not travel to the click flow', () => {
    const controller = controllerFor();
    render(<Board controller={controller} />);
    const source = pointAt(5);

    fireEvent(source, pointerEvent('pointerdown', { clientX: 100, clientY: 20 }));
    fireEvent(window, pointerEvent('pointermove', { clientX: 101, clientY: 20 }));
    fireEvent(window, pointerEvent('pointerup', { clientX: 101, clientY: 20 }));
    fireEvent.click(source);

    // A tap is still a tap: nothing was picked up, and the click that follows is
    // the one the click flow has always answered.
    expect(controller.selectFrom).not.toHaveBeenCalled();
    expect(controller.clickPoint).toHaveBeenCalledWith(5);
  });

  it('picks the checker up once the pointer has travelled', () => {
    const controller = controllerFor();
    render(<Board controller={controller} />);
    dragFrom(pointAt(5), 2);

    expect(controller.selectFrom).toHaveBeenCalledWith(5);
    expect(document.body.getAttribute('data-drag-active')).toBe('true');
  });

  it('takes the checker off the point it left and puts it under the pointer', () => {
    render(<Board controller={controllerFor()} />);
    const source = pointAt(5);
    dragFrom(source, 2);

    // The stack keeps its slot — the drag may yet be abandoned — and only the
    // checker in the player's hand stops being drawn there.
    const lifted = source.querySelectorAll('.invisible');
    expect(lifted).toHaveLength(1);
    expect(document.body.querySelector('[aria-hidden="true"].fixed')).not.toBeNull();
  });

  it('plays the move when it is let go over a destination', () => {
    const controller = controllerFor();
    render(<Board controller={controller} />);
    const at = dragFrom(pointAt(5), 2);
    fireEvent(window, pointerEvent('pointerup', { clientX: at.x, clientY: at.y }));

    expect(controller.moveChecker).toHaveBeenCalledWith(5, 2);
    expect(document.body.hasAttribute('data-drag-active')).toBe(false);
  });

  it('bears off when it is let go over your own tray', () => {
    const controller = controllerFor();
    render(<Board controller={controller} />);
    const at = dragFrom(pointAt(5), OFF);
    fireEvent(window, pointerEvent('pointerup', { clientX: at.x, clientY: at.y }));

    expect(controller.moveChecker).toHaveBeenCalledWith(5, OFF);
  });

  it('keeps hold of the checker when it is let go over nothing', () => {
    // The gesture is not thrown away: the checker stays selected, so the
    // destination is one tap away rather than a drag away.
    const controller = controllerFor();
    render(<Board controller={controller} />);
    const at = dragFrom(pointAt(5), 11);
    fireEvent(window, pointerEvent('pointerup', { clientX: at.x, clientY: at.y }));

    expect(controller.moveChecker).not.toHaveBeenCalled();
    expect(controller.selectFrom).toHaveBeenCalledWith(5);
  });

  it('swallows the click the browser fires after a drag', () => {
    // Which would otherwise reach the point the drag started on and undo the
    // selection the drag just made.
    const controller = controllerFor();
    render(<Board controller={controller} />);
    const source = pointAt(5);
    const at = dragFrom(source, 2);
    fireEvent(window, pointerEvent('pointerup', { clientX: at.x, clientY: at.y }));
    fireEvent.click(source);

    expect(controller.clickPoint).not.toHaveBeenCalled();
  });

  it('gives the checker back on Escape', () => {
    const controller = controllerFor();
    render(<Board controller={controller} />);
    dragFrom(pointAt(5), 2);
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(controller.selectFrom).toHaveBeenLastCalledWith(null);
    expect(controller.moveChecker).not.toHaveBeenCalled();
    expect(document.body.hasAttribute('data-drag-active')).toBe(false);
  });

  it('lets the board go when the system takes the gesture away', () => {
    const controller = controllerFor();
    render(<Board controller={controller} />);
    dragFrom(pointAt(5), 2);
    fireEvent(window, pointerEvent('pointercancel', { clientX: 0, clientY: 0 }));

    expect(controller.moveChecker).not.toHaveBeenCalled();
    expect(document.body.hasAttribute('data-drag-active')).toBe(false);
    // And the guard is released, so the next drag still starts.
    dragFrom(pointAt(5), 2);
    expect(document.body.getAttribute('data-drag-active')).toBe('true');
    fireEvent(window, pointerEvent('pointercancel', { clientX: 0, clientY: 0 }));
  });

  it('holds the page still for the length of a touch drag', () => {
    // The scroll lock. Left to itself the browser reads a finger travelling down a
    // point as a page scroll and takes the gesture back mid-flight, which ends the
    // pointer stream and drops the checker in the air.
    render(<Board controller={controllerFor()} />);
    dragFrom(pointAt(5), 2, 'touch');

    const held = new Event('touchmove', { bubbles: true, cancelable: true });
    document.dispatchEvent(held);
    expect(held.defaultPrevented).toBe(true);

    fireEvent(window, pointerEvent('pointerup', { ...atZone(2), pointerType: 'touch' }));
    const free = new Event('touchmove', { bubbles: true, cancelable: true });
    document.dispatchEvent(free);
    expect(free.defaultPrevented).toBe(false);
  });

  it('leaves the page scrolling under a mouse drag, which never took it', () => {
    render(<Board controller={controllerFor()} />);
    dragFrom(pointAt(5), 2);

    const scroll = new Event('touchmove', { bubbles: true, cancelable: true });
    document.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(false);
    fireEvent(window, pointerEvent('pointerup', { ...atZone(2) }));
  });

  it('refuses to pick up a point with nothing of yours to move', () => {
    const controller = controllerFor();
    render(<Board controller={controller} />);
    dragFrom(pointAt(2), 5);

    expect(controller.selectFrom).not.toHaveBeenCalled();
    expect(document.body.hasAttribute('data-drag-active')).toBe(false);
  });

  it('leaves a right-click to the context menu', () => {
    const controller = controllerFor();
    render(<Board controller={controller} />);
    const start = centreOfZone(5);
    fireEvent(pointAt(5), pointerEvent('pointerdown', { clientX: start.x, clientY: start.y, button: 2 }));
    fireEvent(window, pointerEvent('pointermove', { clientX: start.x + 40, clientY: start.y }));

    expect(controller.selectFrom).not.toHaveBeenCalled();
    expect(document.body.hasAttribute('data-drag-active')).toBe(false);
  });

  it('lets go when the app is put in the background mid-drag', () => {
    // Backgrounding can end the pointer stream without ever delivering an up or a
    // cancel. Nothing would then release the one-gesture guard or the touch lock,
    // and the board would come back inert.
    const controller = controllerFor();
    render(<Board controller={controller} />);
    dragFrom(pointAt(5), 2, 'touch');
    fireEvent.blur(window);

    expect(controller.moveChecker).not.toHaveBeenCalled();
    expect(document.body.hasAttribute('data-drag-active')).toBe(false);
    // The page scrolls again, and the next drag still starts.
    const freed = new Event('touchmove', { bubbles: true, cancelable: true });
    document.dispatchEvent(freed);
    expect(freed.defaultPrevented).toBe(false);
    dragFrom(pointAt(5), 2);
    expect(document.body.getAttribute('data-drag-active')).toBe('true');
  });

  it('will not start a second drag while one is in the air', () => {
    // Two fingers, two points: the second would take the selection and the first
    // would then commit it from the wrong place.
    const controller = controllerFor({ selectableFroms: [5, 2], targetsFrom: () => [8] });
    render(<Board controller={controller} />);
    dragFrom(pointAt(5), 8);
    fireEvent(pointAt(2), pointerEvent('pointerdown', { ...atZone(2), pointerId: 2 }));
    fireEvent(window, pointerEvent('pointermove', { clientX: 300, clientY: 20, pointerId: 2 }));

    expect(controller.selectFrom).toHaveBeenCalledTimes(1);
    expect(controller.selectFrom).toHaveBeenCalledWith(5);
    fireEvent(window, pointerEvent('pointerup', { ...atZone(8) }));
  });

  it('enters from the bar by dragging off it', () => {
    const state = movingState();
    const controller = controllerFor({
      state: { ...state, board: { ...state.board, bar: { white: 1, black: 0 } } },
      selectableFroms: [BAR],
      targetsFrom: (from) => (from === BAR ? [2] : []),
    });
    render(<Board controller={controller} />);

    const bar = screen.getByLabelText(/^bar,/);
    const start = centreOfZone(NOWHERE_SLOT);
    fireEvent(bar, pointerEvent('pointerdown', { clientX: start.x, clientY: start.y }));
    fireEvent(window, pointerEvent('pointermove', { clientX: start.x - 40, clientY: start.y }));
    const at = centreOfZone(2);
    fireEvent(window, pointerEvent('pointermove', { clientX: at.x, clientY: at.y }));
    fireEvent(window, pointerEvent('pointerup', { clientX: at.x, clientY: at.y }));

    expect(controller.selectFrom).toHaveBeenCalledWith(BAR);
    expect(controller.moveChecker).toHaveBeenCalledWith(BAR, 2);
  });
});

/**
 * A board that really plays the move, so the flight it sets off can be read. The
 * checker on 5 is held throughout, so clicking 2 plays it the way a pair of
 * clicks does and dragging it there plays it the other way.
 */
const PlayableBoard = () => {
  const [state, setState] = useState(movingState);
  const play = (from: number, to: number) =>
    setState((s) => {
      const points = [...s.board.points];
      points[from] -= 1;
      points[to] += 1;
      return { ...s, board: { ...s.board, points } };
    });
  const controller: BoardController = {
    state,
    you: 'white',
    selectableFroms: [5],
    selectedFrom: 5,
    targets: [2],
    clickPoint: (index) => {
      if (index !== 5) play(5, index);
    },
    playOnlyMove: vi.fn(),
    targetsFrom: () => [2],
    selectFrom: vi.fn(),
    moveChecker: play,
  };
  return <Board controller={controller} />;
};

/** Where the checker being moved was standing: on point 5, where the board recorded it. */
const CHECKER_LEFT = `${checkerRectIn(5).left}px`;

/**
 * A few pixels off the middle of the destination — where a hand actually lets go.
 * Releasing on the exact pixel the checker will occupy is a move with nowhere to
 * fly, and the board draws no motion for it at all.
 */
const OFF_CENTRE = 8;

describe('the flight a drag leaves behind', () => {
  const realAnimate = (Element.prototype as { animate?: unknown }).animate;
  let flyers: HTMLElement[] = [];

  beforeEach(() => {
    flyers = [];
    (Element.prototype as { animate?: unknown }).animate = function (this: Element) {
      flyers.push(this as HTMLElement);
      return { onfinish: null, oncancel: null, cancel: () => {} } as unknown as Animation;
    };
  });

  afterEach(() => {
    if (realAnimate) (Element.prototype as { animate?: unknown }).animate = realAnimate;
    else delete (Element.prototype as { animate?: unknown }).animate;
  });

  it('starts from the hand that let the checker go, not from the point it left', () => {
    // Otherwise the checker the player has just put down snaps back to its point
    // and flies to the destination they had already reached — a drag undone and
    // replayed, every time, on the one move they made themselves.
    render(<PlayableBoard />);
    const aimed = dragFrom(pointAt(5), 2);
    const at = { x: aimed.x + OFF_CENTRE, y: aimed.y + OFF_CENTRE };
    fireEvent(window, pointerEvent('pointerup', { clientX: at.x, clientY: at.y }));

    expect(flyers).toHaveLength(1);
    // The ghost rides centred under the pointer, so that is the square it left.
    expect(flyers[0].style.left).toBe(`${at.x - CHECKER_SIZE / 2}px`);
    expect(flyers[0].style.top).toBe(`${at.y - CHECKER_SIZE / 2}px`);
  });

  it('overrides that one move and no other', () => {
    // A release that outlived its own commit would send some later move off from
    // a square no checker has stood on since.
    render(<PlayableBoard />);
    const aimed = dragFrom(pointAt(5), 2);
    fireEvent(window, pointerEvent('pointerup', { clientX: aimed.x + OFF_CENTRE, clientY: aimed.y + OFF_CENTRE }));
    // The click the browser fires at the end of the drag, which the gesture eats.
    fireEvent.click(document.body);
    fireEvent.click(pointAt(2));

    expect(flyers).toHaveLength(2);
    expect(flyers[1].style.left).toBe(CHECKER_LEFT);
  });

  it('flies a clicked move from the checker the board recorded', () => {
    render(<PlayableBoard />);
    fireEvent.click(pointAt(2));

    expect(flyers).toHaveLength(1);
    expect(flyers[0].style.left).toBe(CHECKER_LEFT);
  });
});
