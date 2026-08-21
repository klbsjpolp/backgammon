import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createInitialState, type Board as BoardState, type GameState, type Player } from '@backgammon/core';
import { FLIGHT_MS, HIT_DELAY_MS, HIT_FLIGHT_MS } from '@/lib/checkerFlight';
import { AI_MOVE_MS } from '@/useLocalGame';
import { Board, type BoardController } from './Board';

/*
 * jsdom has neither layout nor Web Animations, which are the two things a flight
 * is made of. Both are stubbed here — not to prove the checker looks right, which
 * no unit test can, but to prove the board asks for the right motion: a stand-in
 * crossing the page from the pile the checker left, and the checker it stands for
 * kept out of sight until it gets there.
 */

interface Flight {
  element: HTMLElement;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  animation: StubAnimation;
}

/** Just enough of an `Animation` for the flight to hang its endings on. */
interface StubAnimation {
  onfinish: ((event: AnimationPlaybackEvent) => void) | null;
  oncancel: ((event: AnimationPlaybackEvent) => void) | null;
  cancel: () => void;
}

const ended = (kind: string) => new Event(kind) as AnimationPlaybackEvent;

let flights: Flight[] = [];
let rects: WeakMap<Element, DOMRect>;
let issued = 0;

const realGetRect = Element.prototype.getBoundingClientRect;
const realMatchMedia = window.matchMedia;

/** A distinct but stable rect per element, so an unmoved board measures unmoved. */
const stubbedRect = function (this: Element): DOMRect {
  const known = rects.get(this);
  if (known) return known;
  issued += 1;
  const [left, top] = [issued * 20, issued * 7];
  const rect = {
    x: left,
    y: top,
    left,
    top,
    width: 16,
    height: 16,
    right: left + 16,
    bottom: top + 16,
    toJSON: () => ({}),
  } satisfies DOMRect;
  rects.set(this, rect);
  return rect;
};

const stubbedAnimate = function (this: Element, keyframes: unknown, options: unknown): Animation {
  const animation: StubAnimation = {
    onfinish: null,
    oncancel: null,
    // `Animation.cancel()` queues its event rather than firing it, so a stub that
    // fires synchronously hides exactly the bug this is here to catch.
    cancel: () => queueMicrotask(() => animation.oncancel?.(ended('cancel'))),
  };
  flights.push({
    element: this as HTMLElement,
    keyframes: (keyframes ?? []) as Keyframe[],
    options: (options ?? {}) as KeyframeAnimationOptions,
    animation,
  });
  return animation as unknown as Animation;
};

/** What the browser does when a flight reaches the end of its trip. */
const settle = (flight: Flight) => flight.animation.onfinish?.(ended('finish'));

const setReducedMotion = (reduce: boolean) => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduce }) as unknown as typeof window.matchMedia;
};

beforeEach(() => {
  flights = [];
  rects = new WeakMap();
  issued = 0;
  Element.prototype.getBoundingClientRect = stubbedRect;
  (Element.prototype as { animate?: unknown }).animate = stubbedAnimate;
  setReducedMotion(false);
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = realGetRect;
  delete (Element.prototype as { animate?: unknown }).animate;
  window.matchMedia = realMatchMedia;
});

const boardOf = (points: Record<number, number>, rest: Partial<BoardState> = {}): BoardState => ({
  points: Array.from({ length: 24 }, (_, i) => points[i] ?? 0),
  bar: { white: 0, black: 0 },
  off: { white: 0, black: 0 },
  ...rest,
});

const controllerFor = (board: BoardState, you: Player = 'white'): BoardController => ({
  state: { ...createInitialState(you), board, phase: 'moving' } satisfies GameState,
  you,
  selectableFroms: [],
  selectedFrom: null,
  targets: [],
  clickPoint: vi.fn(),
});

/** The free end of a stack, which is the end a bottom-row point grows from. */
const outerOf = (stack: HTMLElement): HTMLElement | null =>
  (stack.dataset.arrives === 'first' ? stack.firstElementChild : stack.lastElementChild) as HTMLElement | null;

/** Which checkers are being stood in for, and so held out of sight mid-flight. */
const hiddenPiles = (): string[] =>
  [...document.querySelectorAll<HTMLElement>('[data-pile]')]
    .filter((pile) => outerOf(pile)?.style.visibility === 'hidden')
    .map((pile) => pile.dataset.pile ?? '');

describe('checker flights', () => {
  it('stays still on the first paint, having nothing to come from', () => {
    render(<Board controller={controllerFor(boardOf({ 13: 5, 8: 3 }))} />);
    expect(flights).toEqual([]);
  });

  it('flies a stand-in to the point the move landed on, and hides what it stands for', () => {
    const { rerender } = render(<Board controller={controllerFor(boardOf({ 13: 5, 8: 3 }))} />);
    rerender(<Board controller={controllerFor(boardOf({ 13: 4, 8: 4 }))} />);

    expect(flights).toHaveLength(1);
    expect(flights[0].options.duration).toBe(FLIGHT_MS);
    expect(flights[0].keyframes[0].transform).toBe('none');
    expect(flights[0].keyframes[1].transform).toMatch(/^translate\(-?[\d.]+px, -?[\d.]+px\)$/);
    // On the page rather than in the board: the portrait board is turned a quarter
    // turn, and a transform inside it would go the wrong way.
    expect(flights[0].element.parentElement).toBe(document.body);
    expect(flights[0].element.getAttribute('aria-hidden')).toBe('true');
    expect(hiddenPiles()).toEqual(['point-8']);
  });

  it('shows the checker again once its stand-in lands', () => {
    const { rerender } = render(<Board controller={controllerFor(boardOf({ 13: 5, 8: 3 }))} />);
    rerender(<Board controller={controllerFor(boardOf({ 13: 4, 8: 4 }))} />);
    settle(flights[0]);

    expect(hiddenPiles()).toEqual([]);
    expect(document.body.contains(flights[0].element)).toBe(false);
  });

  it('sends the blot to the bar a beat after the checker that hit it lands', () => {
    const { rerender } = render(<Board controller={controllerFor(boardOf({ 13: 5, 8: -1 }))} />);
    rerender(<Board controller={controllerFor(boardOf({ 13: 4, 8: 1 }, { bar: { white: 0, black: 1 } }))} />);

    expect(flights).toHaveLength(2);
    expect(flights[0].options.delay ?? 0).toBe(0);
    expect(flights[1].options.delay).toBe(HIT_DELAY_MS);
    expect(flights[1].options.duration).toBe(HIT_FLIGHT_MS);
    // The checker that hit, and the blot on its way to the bar.
    expect(hiddenPiles().sort()).toEqual(['bar-black', 'point-8']);
  });

  it('flies a drawn checker to the tray when one is borne off', () => {
    const before = boardOf({ 2: 3 }, { off: { white: 12, black: 0 } });
    const { rerender } = render(<Board controller={controllerFor(before)} />);
    rerender(<Board controller={controllerFor(boardOf({ 2: 2 }, { off: { white: 13, black: 0 } }))} />);

    expect(flights).toHaveLength(1);
    // A tray draws a number, so there is no checker to copy and none to uncover:
    // the stand-in is drawn from scratch and shrinks away on arrival.
    const drawn = flights[0].element;
    expect(drawn.parentElement).toBe(document.body);
    expect(drawn.className).toContain('bg-checker-light');
    expect(flights[0].keyframes[1].transform).toContain('scale(0.55)');
    expect(flights[0].keyframes[1].opacity).toBe('0');
    expect(hiddenPiles()).toEqual([]);
  });

  it('finishes a hit inside the beat the AI leaves between two checkers', () => {
    // Past this and the next move cancels the blot in mid-air.
    expect(HIT_DELAY_MS + HIT_FLIGHT_MS).toBeLessThan(AI_MOVE_MS);
    expect(FLIGHT_MS).toBeLessThan(AI_MOVE_MS);
    // And the blot has to still be on its point when the checker that hit it
    // arrives, or it reads as having fled before the hit connected.
    expect(HIT_DELAY_MS).toBeGreaterThan(FLIGHT_MS / 2);
  });

  it('takes a superseded stand-in off the page when the next move lands', () => {
    const { rerender } = render(<Board controller={controllerFor(boardOf({ 13: 5, 8: 3 }))} />);
    rerender(<Board controller={controllerFor(boardOf({ 13: 4, 8: 4 }))} />);
    const first = flights[0];
    rerender(<Board controller={controllerFor(boardOf({ 13: 3, 8: 5 }))} />);

    expect(document.body.contains(first.element)).toBe(false);
    expect(hiddenPiles()).toEqual(['point-8']);
  });

  it('does not move a board that jumped more than one move', () => {
    const { rerender } = render(<Board controller={controllerFor(boardOf({ 13: 5, 8: 3 }))} />);
    rerender(<Board controller={controllerFor(boardOf({ 13: 3, 8: 4, 7: 1 }))} />);

    expect(flights).toEqual([]);
    expect(hiddenPiles()).toEqual([]);
  });

  it('does not move a board that was resized under the move', () => {
    const { container, rerender } = render(<Board controller={controllerFor(boardOf({ 13: 5, 8: 3 }))} />);
    // Forget the root's rect and it measures somewhere new, which is what a
    // rotated phone looks like from here — every kept rect is now a lie.
    rects.delete(container.firstElementChild as Element);
    rerender(<Board controller={controllerFor(boardOf({ 13: 4, 8: 4 }))} />);

    expect(flights).toEqual([]);
  });

  it('never leaves a checker hidden when a move lands on one still in the air', () => {
    // A pile already showing five draws no more checkers, so the sixth and seventh
    // land on the very same node — the case where one flight can inherit the
    // hidden state another one set, and put it back for good.
    const { rerender } = render(<Board controller={controllerFor(boardOf({ 13: 5, 18: 5 }))} />);
    rerender(<Board controller={controllerFor(boardOf({ 13: 4, 18: 6 }))} />);
    rerender(<Board controller={controllerFor(boardOf({ 13: 3, 18: 7 }))} />);

    // The second flight must have been handed a visible checker to stand in for.
    expect(flights[1].element.style.visibility).not.toBe('hidden');
    settle(flights[1]);
    expect(hiddenPiles()).toEqual([]);
  });

  it('holds still for a player who asked for no motion', () => {
    setReducedMotion(true);
    const { rerender } = render(<Board controller={controllerFor(boardOf({ 13: 5, 8: 3 }))} />);
    rerender(<Board controller={controllerFor(boardOf({ 13: 4, 8: 4 }))} />);

    expect(flights).toEqual([]);
    expect(hiddenPiles()).toEqual([]);
  });
});
