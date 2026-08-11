import { BAR, OFF, opponent, type GameState, type Player } from '@backgammon/core';
import { cn } from '@/lib/cn';

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

interface CheckersProps {
  count: number; // signed: + white, - black
}

const Checkers = ({ count }: CheckersProps) => {
  const n = Math.abs(count);
  if (n === 0) return null;
  // Both colours carry a rim: on a light theme a pale checker on a pale point is
  // otherwise only an edgeless smudge.
  const color =
    count > 0
      ? 'bg-checker-light text-checker-light-fg ring-checker-light-line'
      : 'bg-checker-dark text-checker-dark-fg ring-checker-dark-line';
  const shown = Math.min(n, 5);
  return (
    <div className="flex flex-col items-center gap-board-stack">
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
  count: number;
  orientation: 'top' | 'bottom';
  selectable: boolean;
  selected: boolean;
  target: boolean;
  onClick: () => void;
}

const Point = ({ index, count, orientation, selectable, selected, target, onClick }: PointProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={`point ${index}`}
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
    <span className="board-label text-board-label leading-none text-point-label">{index}</span>
    <Checkers count={count} />
  </button>
);

interface TrayProps {
  label: string;
  value: number;
  active?: boolean;
  onClick?: () => void;
}

const Tray = ({ label, value, active, onClick }: TrayProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
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
  /** Signed count shown on the near side (this client's checkers). */
  yours: number;
  selectable: boolean;
  selected: boolean;
  onClick: () => void;
}

const Bar = ({ theirs, yours, selectable, selected, onClick }: BarProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="bar"
    className={cn(
      'flex w-board-bar flex-col items-center justify-center gap-board-bar-gap self-stretch',
      'rounded-md border border-bar-line bg-bar py-board-bar-pad',
      (selectable || selected) && 'cursor-pointer ring-2 ring-pick-strong',
    )}
  >
    <Checkers count={theirs} />
    <span className="board-label text-board-label leading-none text-bar-label uppercase">bar</span>
    <Checkers count={yours} />
  </button>
);

const die = (n: number) => '⚀⚁⚂⚃⚄⚅'[n - 1] ?? '?';

export const Board = ({ controller }: { controller: BoardController }) => {
  const { state, you, selectableFroms, selectedFrom, targets } = controller;
  const board = state.board;
  const them = opponent(you);
  const { top, bottom } = rowsFor(you);

  const renderPoint = (index: number, orientation: 'top' | 'bottom') => (
    <Point
      key={index}
      index={index}
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
    <div className="flex touch-manipulation flex-col items-center gap-2 select-none">
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
            yours={signedFor(you, board.bar[you])}
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
            <Tray label={`${them} off`} value={board.off[them]} />
            <Tray
              label={`${you} off`}
              value={board.off[you]}
              active={targets.includes(OFF)}
              onClick={() => controller.clickPoint(OFF)}
            />
          </div>
        </div>
      </div>

      <div className="flex h-7 items-center gap-3 text-2xl text-dice compact:h-6 compact:text-xl">
        {state.roll && state.phase !== 'rolling' ? (
          <span aria-label="dice">
            {die(state.roll[0])} {die(state.roll[1])}
          </span>
        ) : null}
        {state.remaining.length > 0 && (
          <span className="text-sm text-muted">remaining: {state.remaining.join(', ')}</span>
        )}
      </div>
    </div>
  );
};
