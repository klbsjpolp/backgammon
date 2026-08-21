import { useLayoutEffect, useRef } from 'react';
import {
  BAR,
  CHECKERS_PER_SIDE,
  OFF,
  POINT_COUNT,
  opponent,
  type Board as BoardState,
  type GameState,
  type Player,
} from '@backgammon/core';
import { cn } from '@/lib/cn';
import { barPile, describeMotions, offPile, pointPile, type CheckerMotion, type PileId } from '@/lib/boardDiff';
import { centreOf, flyChecker, FLIGHT_MS, HIT_DELAY_MS, HIT_FLIGHT_MS, type StopFlight } from '@/lib/checkerFlight';

/** Minimal surface the board needs; satisfied by both the local and online games. */
export interface BoardController {
  state: GameState;
  /** Color this client plays; the board is drawn and wired from its point of view. */
  you: Player;
  selectableFroms: number[];
  selectedFrom: number | null;
  targets: number[];
  clickPoint: (index: number) => void;
}

// Rows as white sees them: its home board (0..5) ends up bottom-right, next to
// the bear-off tray.
const TOP_ROW = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const BOTTOM_ROW = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

/** Black's view is white's mirrored across the middle, so home is bottom-right for both. */
const rowsFor = (you: Player): { top: number[]; bottom: number[] } =>
  you === 'white'
    ? { top: TOP_ROW, bottom: BOTTOM_ROW }
    : { top: TOP_ROW.map((i) => 23 - i), bottom: BOTTOM_ROW.map((i) => 23 - i) };

/** Signed checker count (as {@link Checkers} wants it) for one player's off-board pile. */
const signedFor = (player: Player, count: number): number => (player === 'white' ? count : -count);

/**
 * The number a player counts this point by: 1 is the point you bear off from,
 * 24 the one furthest away. Each player numbers from their own home, so the two
 * disagree on every point — which is what the board is for.
 *
 * The array index underneath (0..23, white's direction) is the engine's, and
 * showing it was a leak: no backgammon board has a 0-point, and half of them
 * were counting the wrong way for whoever was reading.
 */
const pointNumber = (you: Player, index: number): number => (you === 'white' ? index + 1 : POINT_COUNT - index);

/** How a point reads out loud: who is standing on it, and how many. */
const describeOccupancy = (count: number): string => {
  if (count === 0) return 'empty';
  const n = Math.abs(count);
  return `${n} ${count > 0 ? 'white' : 'black'} checker${n === 1 ? '' : 's'}`;
};

/**
 * Both colours carry a rim: on a light theme a pale checker on a pale point is
 * otherwise only an edgeless smudge.
 */
const checkerColor = (player: Player): string =>
  player === 'white'
    ? 'bg-checker-light text-checker-light-fg ring-checker-light-line'
    : 'bg-checker-dark text-checker-dark-fg ring-checker-dark-line';

interface CheckersProps {
  count: number; // signed: + white, - black
  /** Which pile this stack is, so a move can be flown from it and onto it. */
  pile: PileId;
  /**
   * Which end of the stack a checker arrives on. A pile is pinned at its point's
   * base and grows away from it, so the free slot is at the far end — but the
   * stack is always drawn top-down while the *point* is what gets reversed along
   * the bottom row. React appends, so on a bottom-row point the appended node is
   * the one at the base and every checker already there shifts up a slot. The
   * checker that arrived is then the first child, not the last.
   */
  arrivesAt?: 'first' | 'last';
}

const Checkers = ({ count, pile, arrivesAt = 'last' }: CheckersProps) => {
  const n = Math.abs(count);
  if (n === 0) return null;
  const color = checkerColor(count > 0 ? 'white' : 'black');
  const shown = Math.min(n, 5);
  return (
    // `board-stack` is what lets the deepest stacks overlap, and `data-stack` is
    // how deep — the CSS picks the overlap off it rather than counting the
    // children itself, so a stack that grows cannot be left at the flat spacing
    // it had one checker ago. See index.css.
    <div
      className="board-stack flex flex-col items-center gap-board-stack"
      data-stack={shown}
      data-pile={pile}
      data-arrives={arrivesAt}
    >
      {Array.from({ length: shown }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'flex size-board-checker items-center justify-center rounded-full',
            'text-board-checker leading-none font-bold ring-1',
            color,
          )}
        >
          <span className="board-label">{i === shown - 1 && n > 5 ? n : ''}</span>
        </div>
      ))}
    </div>
  );
};

interface PointProps {
  index: number;
  /** The point's number in the viewer's own numbering — what is drawn and read. */
  number: number;
  count: number;
  orientation: 'top' | 'bottom';
  selectable: boolean;
  selected: boolean;
  target: boolean;
  onClick: () => void;
}

/**
 * The ring colours say selectable / held / reachable to anyone who can see them.
 * Everything below is the same three states said out loud, plus the occupancy a
 * sighted player reads off the checkers themselves — without it a point
 * announced as "point 13, button" and nothing else, which is not a board.
 */
const Point = ({ index, number, count, orientation, selectable, selected, target, onClick }: PointProps) => {
  const playable = selectable || selected || target;
  const role = selected
    ? ', holding the checker to move'
    : selectable
      ? ', has a checker you can move'
      : target
        ? ', where the held checker can go'
        : '';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`point ${number}, ${describeOccupancy(count)}${role}`}
      aria-pressed={selectable || selected ? selected : undefined}
      // Not `disabled`: the point still has to be readable, and a disabled
      // button drops out of the accessible tree in some readers. This keeps it
      // reachable to a screen reader while a Tab lands only on the points that
      // can actually be played.
      aria-disabled={playable ? undefined : true}
      tabIndex={playable ? undefined : -1}
      data-point={index}
      className={cn(
        'flex h-board-depth w-board-point flex-col items-center gap-board-stack rounded-md',
        'border border-point-line px-px py-board-point-pad transition',
        orientation === 'bottom' && 'flex-col-reverse justify-start',
        index % 2 === 0 ? 'bg-point-even' : 'bg-point-odd',
        selectable && 'cursor-pointer ring-2 ring-pick hover:brightness-125',
        selected && 'ring-2 ring-pick-strong brightness-125',
        target && 'cursor-pointer ring-2 ring-move hover:brightness-125',
      )}
    >
      <span aria-hidden className="board-label text-board-label leading-none text-point-label">
        {number}
      </span>
      <Checkers count={count} pile={pointPile(index)} arrivesAt={orientation === 'bottom' ? 'first' : 'last'} />
    </button>
  );
};

interface TrayProps {
  label: string;
  /** Whose tray, so a checker borne off knows which one to fly to. */
  owner: Player;
  value: number;
  active?: boolean;
  onClick?: () => void;
}

const Tray = ({ label, owner, value, active, onClick }: TrayProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    data-tray={owner}
    // The count and the caption are two elements, so the default accessible name
    // comes out as the bare "12 white off"; spelling it out says what the number
    // counts and what is left to bear off.
    aria-label={`${label}, ${value} of ${CHECKERS_PER_SIDE} borne off`}
    className={cn(
      'flex h-board-tray-depth w-board-tray flex-col items-center justify-center',
      'rounded-md border border-tray-line bg-tray text-tray-fg',
      active && 'cursor-pointer ring-2 ring-move hover:brightness-125',
    )}
  >
    {/* One block so the count and its caption turn back upright together. */}
    <div className="board-label flex flex-col items-center gap-0.5">
      <span className="text-board-count leading-none font-bold">{value}</span>
      <span className="text-board-label leading-none tracking-wide text-tray-label uppercase">{label}</span>
    </div>
  </button>
);

interface BarProps {
  /** Signed count shown on the far side of the bar (the opponent's checkers). */
  theirs: number;
  theirsPile: PileId;
  /** Signed count shown on the near side (this client's checkers). */
  yours: number;
  yoursPile: PileId;
  selectable: boolean;
  selected: boolean;
  onClick: () => void;
}

const Bar = ({ theirs, theirsPile, yours, yoursPile, selectable, selected, onClick }: BarProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={
      // Being on the bar decides the whole turn — nothing else may move until it
      // is entered — so the count belongs in the name, not just in the pips.
      `bar, ${Math.abs(yours)} of your checkers, ${Math.abs(theirs)} of theirs` +
      (selected ? ', holding the checker to enter' : selectable ? ', you must enter from here' : '')
    }
    aria-pressed={selectable || selected ? selected : undefined}
    aria-disabled={selectable || selected ? undefined : true}
    tabIndex={selectable || selected ? undefined : -1}
    className={cn(
      'flex w-board-bar flex-col items-center justify-center gap-board-bar-gap self-stretch',
      'rounded-md border border-bar-line bg-bar py-board-bar-pad',
      (selectable || selected) && 'cursor-pointer ring-2 ring-pick-strong',
    )}
  >
    <Checkers count={theirs} pile={theirsPile} />
    <span className="board-label text-board-label leading-none text-bar-label uppercase">bar</span>
    <Checkers count={yours} pile={yoursPile} />
  </button>
);

/**
 * The checker on the free end of a stack — the one a move adds, or the one it
 * takes away. Which DOM end that is depends on how the pile grows; see `arrivesAt`.
 */
const outerChecker = (stack: HTMLElement): HTMLElement | null => {
  const outer = stack.dataset.arrives === 'first' ? stack.firstElementChild : stack.lastElementChild;
  return outer instanceof HTMLElement ? outer : null;
};

/** Where the outermost checker of every pile stands, as of this commit. */
const measurePiles = (root: HTMLElement): Map<PileId, DOMRect> => {
  const outer = new Map<PileId, DOMRect>();
  for (const stack of root.querySelectorAll<HTMLElement>('[data-pile]')) {
    const id = stack.dataset.pile;
    const checker = outerChecker(stack);
    if (id && checker) outer.set(id, checker.getBoundingClientRect());
  }
  return outer;
};

/** The checker that just arrived on a pile: the one now standing on its free end. */
const arrivalOn = (root: HTMLElement, pile: PileId): HTMLElement | null => {
  const stack = root.querySelector<HTMLElement>(`[data-pile="${pile}"]`);
  return stack ? outerChecker(stack) : null;
};

/**
 * What actually crosses the screen. A copy of the checker that landed is exact —
 * same size, same rim, same count label if the stack is a deep one — and bearing
 * off, which has no landed checker to copy, gets one drawn from scratch.
 */
const standInFor = (player: Player, arrival: HTMLElement | null): HTMLElement => {
  if (arrival) {
    const copy = arrival.cloneNode(true) as HTMLElement;
    // Every length on the board is a multiple of `--pt`, which lives on the board
    // and not on the page the stand-in flies across. Width and height are set from
    // the measured rect; the count a deep stack carries would otherwise come out at
    // the page's own font size.
    copy.style.fontSize = getComputedStyle(arrival).fontSize;
    return copy;
  }
  const drawn = document.createElement('div');
  drawn.className = cn('rounded-full ring-1', checkerColor(player));
  return drawn;
};

/** Where a checker borne off is headed: its owner's tray, and only its owner's. */
const trayFor = (root: HTMLElement, motion: CheckerMotion): HTMLElement | null =>
  motion.to === offPile(motion.player) ? root.querySelector(`[data-tray="${motion.player}"]`) : null;

/** Rects taken one commit ago only mean anything if the board is still where it was. */
const stillThere = (before: DOMRect, now: DOMRect): boolean =>
  Math.abs(before.left - now.left) < 1 &&
  Math.abs(before.top - now.top) < 1 &&
  Math.abs(before.width - now.width) < 1 &&
  Math.abs(before.height - now.height) < 1;

/**
 * Draw the checker going where it went.
 *
 * The origin cannot be read off the board once the move is on screen: the checker
 * that left is no longer standing there. So every commit records where the top of
 * each pile was, and the next one flies against that — the board's own history is
 * the only place the starting point still exists.
 *
 * A layout effect is what makes it seamless. It runs after React has written the
 * new board and before the browser paints it, so the checker that landed is hidden
 * and its stand-in launched within the same frame; there is no paint in which the
 * checker is visible at both ends of the move.
 */
const useCheckerFlights = (board: BoardState) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const previous = useRef<{ board: BoardState; tops: Map<PileId, DOMRect>; frame: DOMRect } | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const frame = root.getBoundingClientRect();
    const before = previous.current;
    // Recorded before anything below may bail out: the *next* move is measured
    // against this commit whether or not this one produced any motion.
    previous.current = { board, tops: measurePiles(root), frame };

    // Nothing to come from on the first paint; and a board that was resized or
    // turned between the two commits left every rect pointing somewhere it isn't.
    if (!before || !stillThere(before.frame, frame)) return;

    const flying: StopFlight[] = [];
    for (const motion of describeMotions(before.board, board)) {
      const origin = before.tops.get(motion.from);
      if (!origin) continue;

      const arrival = arrivalOn(root, motion.to);
      const destination = arrival ?? trayFor(root, motion);
      if (!destination) continue;

      const stop = flyChecker(standInFor(motion.player, arrival), {
        from: origin,
        to: centreOf(destination.getBoundingClientRect()),
        arrival,
        ...(motion.kind === 'hit' ? { duration: HIT_FLIGHT_MS, delay: HIT_DELAY_MS } : { duration: FLIGHT_MS }),
      });
      if (stop) flying.push(stop);
    }

    // A move that lands while one is still in the air supersedes it. Stopping puts
    // the board back on the spot, which matters because the effect that replaces
    // this one runs immediately after and reads the DOM it leaves behind.
    return () => flying.forEach((stop) => stop());
  }, [board]);

  return rootRef;
};

export const Board = ({ controller }: { controller: BoardController }) => {
  const { state, you, selectableFroms, selectedFrom, targets } = controller;
  const board = state.board;
  const them = opponent(you);
  const { top, bottom } = rowsFor(you);
  const rootRef = useCheckerFlights(board);

  const renderPoint = (index: number, orientation: 'top' | 'bottom') => (
    <Point
      key={index}
      index={index}
      number={pointNumber(you, index)}
      count={board.points[index]}
      orientation={orientation}
      selectable={selectableFroms.includes(index)}
      selected={selectedFrom === index}
      target={targets.includes(index)}
      onClick={() => controller.clickPoint(index)}
    />
  );

  return (
    // `touch-manipulation` keeps a quick double tap on two points from zooming
    // the page instead of playing the move.
    <div ref={rootRef} className="flex touch-manipulation flex-col items-center select-none">
      <div className="board-fit">
        <div
          className={cn(
            'board-frame flex items-stretch gap-board-gutter rounded-xl border-2 border-board-frame',
            'bg-felt p-board-pad shadow-2xl sm:border-4',
          )}
        >
          <div className="flex flex-col justify-between gap-board-gutter">
            <div className="flex gap-board-gutter">{top.slice(0, 6).map((i) => renderPoint(i, 'top'))}</div>
            <div className="flex gap-board-gutter">{bottom.slice(0, 6).map((i) => renderPoint(i, 'bottom'))}</div>
          </div>

          <Bar
            theirs={signedFor(them, board.bar[them])}
            theirsPile={barPile(them)}
            yours={signedFor(you, board.bar[you])}
            yoursPile={barPile(you)}
            selectable={selectableFroms.includes(BAR)}
            selected={selectedFrom === BAR}
            onClick={() => controller.clickPoint(BAR)}
          />

          <div className="flex flex-col justify-between gap-board-gutter">
            <div className="flex gap-board-gutter">{top.slice(6).map((i) => renderPoint(i, 'top'))}</div>
            <div className="flex gap-board-gutter">{bottom.slice(6).map((i) => renderPoint(i, 'bottom'))}</div>
          </div>

          {/* The near tray is always this client's, so either color can bear off. */}
          <div className="flex flex-col justify-between gap-board-gutter">
            <Tray label={`${them} off`} owner={them} value={board.off[them]} />
            <Tray
              label={`${you} off`}
              owner={you}
              value={board.off[you]}
              active={targets.includes(OFF)}
              onClick={() => controller.clickPoint(OFF)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
