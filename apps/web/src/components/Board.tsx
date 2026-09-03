import { useLayoutEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { createPortal } from 'react-dom';
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
import { SIDE, SIDE_PLURAL } from '@/lib/french';
import { barPile, describeMotions, offPile, pointPile, type CheckerMotion, type PileId } from '@/lib/boardDiff';
import { outerChecker } from '@/lib/checkerStack';
import { centreOf, flyChecker, FLIGHT_MS, HIT_DELAY_MS, HIT_FLIGHT_MS, type StopFlight } from '@/lib/checkerFlight';
import { useBoardBand } from '@/boardBand';
import { useCheckerDrag, type CheckerDrag, type DragRelease } from '@/useCheckerDrag';

/** Minimal surface the board needs; satisfied by both the local and online games. */
export interface BoardController {
  state: GameState;
  /** Color this client plays; the board is drawn and wired from its point of view. */
  you: Player;
  selectableFroms: number[];
  selectedFrom: number | null;
  targets: number[];
  clickPoint: (index: number) => void;
  /** Play the point's move outright, when it has only one to play. */
  playOnlyMove: (index: number) => void;
  /** Where a checker on `from` could land, asked before anything is held. */
  targetsFrom: (from: number) => number[];
  /** Hold a checker outright — what a drag means, where a click has to guess. */
  selectFrom: (from: number | null) => void;
  /** Put the checker down on `to`. */
  moveChecker: (from: number, to: number) => void;
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
  if (count === 0) return 'vide';
  const n = Math.abs(count);
  const colour = count > 0 ? SIDE.white : SIDE.black;
  return `${n} pion${n === 1 ? '' : 's'} ${colour}${n === 1 ? '' : 's'}`;
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
  /**
   * The checker on the free end of this pile is in the player's hand. It keeps its
   * slot — the stack must not resettle under a drag that may yet be abandoned —
   * and only stops being drawn, because what the player is looking at is the ghost
   * following their pointer.
   */
  lifted?: boolean;
}

const Checkers = ({ count, pile, arrivesAt = 'last', lifted = false }: CheckersProps) => {
  const n = Math.abs(count);
  if (n === 0) return null;
  const color = checkerColor(count > 0 ? 'white' : 'black');
  const shown = n;
  const outer = arrivesAt === 'first' ? 0 : shown - 1;
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
            'board-checker flex size-board-checker items-center justify-center rounded-full',
            'text-board-checker leading-none font-bold ring-1',
            color,
            lifted && i === outer && 'invisible',
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
  /** A dragged checker is over this point right now, and would land here. */
  over: boolean;
  /** The checker on the free end of this point is the one being dragged. */
  lifted: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}

/**
 * The ring colours say selectable / held / reachable to anyone who can see them.
 * Everything below is the same three states said out loud, plus the occupancy a
 * sighted player reads off the checkers themselves — without it a point
 * announced as "flèche 13, bouton" and nothing else, which is not a board.
 *
 * Under a drag there is nothing new to say: the point being dragged from is the
 * held one and the point under the pointer is a destination, both of which the
 * click flow already announces. `over` only sharpens the ring the drag is aiming
 * at, which is a thing you can only be told by seeing it.
 */
const Point = ({
  index,
  number,
  count,
  orientation,
  selectable,
  selected,
  target,
  over,
  lifted,
  onClick,
  onDoubleClick,
  onPointerDown,
}: PointProps) => {
  const playable = selectable || selected || target;
  const role = selected
    ? ', vous tenez le pion à déplacer'
    : selectable
      ? ', porte un pion que vous pouvez déplacer'
      : target
        ? ', destination possible du pion tenu'
        : '';

  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown}
      aria-label={`flèche ${number}, ${describeOccupancy(count)}${role}`}
      aria-pressed={selectable || selected ? selected : undefined}
      // Not `disabled`: the point still has to be readable, and a disabled
      // button drops out of the accessible tree in some readers. This keeps it
      // reachable to a screen reader while a Tab lands only on the points that
      // can actually be played.
      aria-disabled={playable ? undefined : true}
      tabIndex={playable ? undefined : -1}
      data-point={index}
      // Which end of the point is its tip, which is the end a real point darkens
      // towards — the bottom row is drawn upside down, so it cannot be a constant.
      data-orientation={orientation}
      data-drop-zone={index}
      data-drag-source={selectable || selected ? '' : undefined}
      className={cn(
        'board-point flex h-board-depth w-board-point flex-col items-center gap-board-stack rounded-md',
        'border border-point-line px-px py-board-point-pad transition',
        orientation === 'bottom' && 'flex-col-reverse justify-start',
        index % 2 === 0 ? 'bg-point-even' : 'bg-point-odd',
        selectable && 'cursor-grab ring-2 ring-pick hover:brightness-125',
        selected && 'ring-2 ring-pick-strong brightness-125',
        target && 'cursor-pointer ring-2 ring-move hover:brightness-125',
        over && 'ring-4 ring-move brightness-125',
      )}
    >
      <span aria-hidden className="board-label text-board-label leading-none text-point-label">
        {number}
      </span>
      <Checkers
        count={count}
        pile={pointPile(index)}
        arrivesAt={orientation === 'bottom' ? 'first' : 'last'}
        lifted={lifted}
      />
    </button>
  );
};

interface TrayProps {
  label: string;
  /** Whose tray, so a checker borne off knows which one to fly to. */
  owner: Player;
  value: number;
  active?: boolean;
  /** A dragged checker is over this tray and would bear off here. */
  over?: boolean;
  onClick?: () => void;
}

const Tray = ({ label, owner, value, active, over, onClick }: TrayProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    data-tray={owner}
    // The opponent's tray is a square of the board a drag can be let go over, and
    // one nothing can ever land on. Saying so is what stops a release there from
    // reaching past it to the nearest point that *is* a destination.
    data-drop-zone={onClick ? OFF : 'none'}
    // The count and the caption are two elements, so the default accessible name
    // comes out as the bare "12 blancs sortis"; spelling it out says what the
    // number counts and what is left to bear off.
    aria-label={`${label}, ${value} sur ${CHECKERS_PER_SIDE}`}
    className={cn(
      'board-tray flex h-board-tray-depth w-board-tray flex-col items-center justify-center',
      'rounded-md border border-tray-line bg-tray text-tray-fg',
      active && 'cursor-pointer ring-2 ring-move hover:brightness-125',
      over && 'ring-4 ring-move brightness-125',
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
  /** The checker on the free end of your side of the bar is the one being dragged. */
  lifted: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}

const Bar = ({
  theirs,
  theirsPile,
  yours,
  yoursPile,
  selectable,
  selected,
  lifted,
  onClick,
  onDoubleClick,
  onPointerDown,
}: BarProps) => (
  <button
    type="button"
    onClick={onClick}
    onDoubleClick={onDoubleClick}
    onPointerDown={onPointerDown}
    aria-label={
      // Being on the bar decides the whole turn — nothing else may move until it
      // is entered — so the count belongs in the name, not just in the pips.
      `barre, ${Math.abs(yours)} de vos pions, ${Math.abs(theirs)} des siens` +
      (selected ? ', vous tenez le pion à faire entrer' : selectable ? ', vous devez entrer depuis la barre' : '')
    }
    aria-pressed={selectable || selected ? selected : undefined}
    aria-disabled={selectable || selected ? undefined : true}
    tabIndex={selectable || selected ? undefined : -1}
    // Nothing is ever moved *to* the bar — a hit puts the blot there without
    // anyone aiming at it — so the bar is a zone with no index of its own.
    data-drop-zone="none"
    data-drag-source={selectable || selected ? '' : undefined}
    className={cn(
      'board-bar flex w-board-bar flex-col items-center justify-center gap-board-bar-gap self-stretch',
      'rounded-md border border-bar-line bg-bar py-board-bar-pad',
      (selectable || selected) && 'cursor-grab ring-2 ring-pick-strong',
    )}
  >
    <Checkers count={theirs} pile={theirsPile} />
    <span className="board-label text-board-label leading-none text-bar-label uppercase">barre</span>
    <Checkers count={yours} pile={yoursPile} lifted={lifted} />
  </button>
);

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
 * The checker in the player's hand, drawn on the page rather than in the board.
 *
 * `position: fixed` on the body for the same reason a flight is: a portrait phone
 * turns the whole board a quarter turn, and screen coordinates applied inside that
 * frame come out at right angles to the finger that produced them. Outside the
 * rotation, one set of coordinates is right in both orientations — and the ghost is
 * above every point it crosses, which a checker inside its own point can never be.
 */
const DragGhost = ({ drag }: { drag: CheckerDrag }) =>
  createPortal(
    <div
      aria-hidden
      className={cn(
        'board-checker pointer-events-none fixed top-0 left-0 z-40 rounded-full ring-1',
        checkerColor(drag.player),
      )}
      style={{
        width: `${drag.width}px`,
        height: `${drag.height}px`,
        // Centred on the pointer, and a shade larger than the checker it left
        // behind: the lift is what says the checker is in your hand rather than
        // lying on the board. A static transform, so it costs reduced motion
        // nothing.
        transform: `translate3d(${drag.pointer.x}px, ${drag.pointer.y}px, 0) translate(-50%, -50%) scale(1.15)`,
      }}
    />,
    document.body,
  );

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
  drawn.className = cn('board-checker rounded-full ring-1', checkerColor(player));
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
 *
 * A move played by dragging starts somewhere the board has no record of — where
 * the player let go — which is why `release` is read here. Flying such a move from
 * the point instead would snap the checker back out of the player's hand and then
 * fly it to where they had already put it.
 */
const useCheckerFlights = (
  rootRef: RefObject<HTMLDivElement | null>,
  board: BoardState,
  releaseRef: RefObject<DragRelease | null>,
) => {
  const previous = useRef<{ board: BoardState; tops: Map<PileId, DOMRect>; frame: DOMRect } | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Taken whether or not it is used: a release that outlived its own commit
    // would send some later move off from a place no checker has been since.
    const released = releaseRef.current;
    releaseRef.current = null;

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
      // Only the checker the player was holding starts from their hand. A blot
      // this move knocked to the bar leaves from where it was standing.
      const origin =
        released && motion.kind === 'move' && motion.from === released.pile
          ? released.rect
          : before.tops.get(motion.from);
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
    // `releaseRef` and `rootRef` are refs, and re-running this for anything but a new
    // board is what would fly a move twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);
};

/**
 * Clicks and double clicks on their way to the controller.
 *
 * A double click on a point with only one move to play plays it — the two clicks
 * it stands in for, run together. What it must not do is play a *third* click's
 * worth. Clicking a source and then double-clicking the destination delivers a
 * click that lands the checker, a click that selects the point it landed on, and
 * then the double click, which would spend another die on the checker that just
 * arrived; there is no undo to take that back.
 *
 * Refusing every double click whose first half moved something is what separates
 * the two, and the board object is the witness: `playMove` returns a new one and
 * selecting a point does not, so a pair of clicks with one board under both of
 * them is a pair that only selected.
 */
const useBoardClicks = (controller: BoardController, board: BoardState) => {
  const pair = useRef<{ index: number; board: BoardState }[]>([]);

  const click = (index: number) => {
    pair.current = [...pair.current.slice(-1), { index, board }];
    controller.clickPoint(index);
  };

  const doubleClick = (index: number) => {
    const clicks = pair.current;
    if (clicks.length === 2 && clicks.every((c) => c.index === index && c.board === board)) {
      controller.playOnlyMove(index);
    }
  };

  return { click, doubleClick };
};

export const Board = ({ controller }: { controller: BoardController }) => {
  const { state, you, selectableFroms, selectedFrom, targets, targetsFrom, selectFrom, moveChecker } = controller;
  const band = useBoardBand();
  const board = state.board;
  const them = opponent(you);
  const { top, bottom } = rowsFor(you);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { drag, releaseRef, grab } = useCheckerDrag({
    rootRef,
    you,
    selectableFroms,
    targetsFrom,
    selectFrom,
    moveChecker,
  });
  useCheckerFlights(rootRef, board, releaseRef);
  const { click, doubleClick } = useBoardClicks(controller, board);

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
      over={drag?.over === index}
      lifted={drag?.from === index}
      onClick={() => click(index)}
      onDoubleClick={() => doubleClick(index)}
      onPointerDown={(event) => grab(index, event)}
    />
  );

  return (
    // `touch-manipulation` keeps a quick double tap from zooming the page
    // instead of playing the move — on two points, or on one now that a double
    // tap there plays the move a point has no choice about.
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
            lifted={drag?.from === BAR}
            onClick={() => click(BAR)}
            onDoubleClick={() => doubleClick(BAR)}
            onPointerDown={(event) => grab(BAR, event)}
          />

          <div className="flex flex-col justify-between gap-board-gutter">
            <div className="flex gap-board-gutter">{top.slice(6).map((i) => renderPoint(i, 'top'))}</div>
            <div className="flex gap-board-gutter">{bottom.slice(6).map((i) => renderPoint(i, 'bottom'))}</div>
          </div>

          {/* The near tray is always this client's, so either color can bear off. */}
          <div className="flex flex-col justify-between gap-board-gutter">
            <Tray label={`${SIDE_PLURAL[them]} sortis`} owner={them} value={board.off[them]} />
            <Tray
              label={`${SIDE_PLURAL[you]} sortis`}
              owner={you}
              value={board.off[you]}
              active={targets.includes(OFF)}
              over={drag?.over === OFF}
              onClick={() => click(OFF)}
            />
          </div>
        </div>

        {/* Inside `.board-fit` rather than around it, so it inherits `--pt` and
            can line its columns up with the frame's own — see `boardBand.ts`. */}
        {band}
      </div>
      {drag && <DragGhost drag={drag} />}
    </div>
  );
};
