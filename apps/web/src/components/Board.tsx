import { BAR, OFF, type GameState } from '@backgammon/core';
import { cn } from '@/lib/cn';

/** Minimal surface the board needs; satisfied by both the local and online games. */
export interface BoardController {
  state: GameState;
  selectableFroms: number[];
  selectedFrom: number | null;
  targets: number[];
  clickPoint: (index: number) => void;
}

const TOP_ROW = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const BOTTOM_ROW = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

interface CheckersProps {
  count: number; // signed: + white, - black
}

const Checkers = ({ count }: CheckersProps) => {
  const n = Math.abs(count);
  if (n === 0) return null;
  const color = count > 0 ? 'bg-stone-100 text-stone-900' : 'bg-stone-900 text-stone-100 ring-1 ring-stone-500';
  const shown = Math.min(n, 5);
  return (
    <div className="flex flex-col items-center gap-0.5">
      {Array.from({ length: shown }).map((_, i) => (
        <div
          key={i}
          className={cn('flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold', color)}
        >
          {i === shown - 1 && n > 5 ? n : ''}
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
      'flex min-h-36 w-10 flex-col items-center gap-0.5 rounded-md border border-emerald-950/40 px-0.5 py-1 transition',
      orientation === 'bottom' && 'flex-col-reverse justify-start',
      index % 2 === 0 ? 'bg-emerald-800/40' : 'bg-emerald-900/50',
      selectable && 'cursor-pointer ring-2 ring-amber-400/70 hover:brightness-125',
      selected && 'ring-2 ring-amber-300 brightness-125',
      target && 'cursor-pointer ring-2 ring-sky-400 hover:brightness-125',
    )}
  >
    <span className="text-[9px] text-emerald-200/60">{index}</span>
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
      'flex h-16 w-16 flex-col items-center justify-center rounded-md border border-emerald-950/50 bg-emerald-950/40 text-emerald-100',
      active && 'cursor-pointer ring-2 ring-sky-400 hover:brightness-125',
    )}
  >
    <span className="text-2xl font-bold">{value}</span>
    <span className="text-[10px] uppercase tracking-wide text-emerald-300/70">{label}</span>
  </button>
);

interface BarProps {
  white: number;
  black: number;
  selectable: boolean;
  selected: boolean;
  onClick: () => void;
}

const Bar = ({ white, black, selectable, selected, onClick }: BarProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="bar"
    className={cn(
      'flex w-12 flex-col items-center justify-center gap-2 self-stretch rounded-md border border-emerald-950/60 bg-emerald-950/70 py-2',
      (selectable || selected) && 'cursor-pointer ring-2 ring-amber-300',
    )}
  >
    <Checkers count={black} />
    <span className="text-[9px] uppercase text-emerald-300/60">bar</span>
    <Checkers count={white} />
  </button>
);

const die = (n: number) => '⚀⚁⚂⚃⚄⚅'[n - 1] ?? '?';

export const Board = ({ controller }: { controller: BoardController }) => {
  const { state, selectableFroms, selectedFrom, targets } = controller;
  const board = state.board;

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
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-stretch gap-2 rounded-xl border-4 border-amber-900/60 bg-emerald-900 p-3 shadow-2xl">
        <div className="flex flex-col justify-between gap-3">
          <div className="flex gap-1">{TOP_ROW.slice(0, 6).map((i) => renderPoint(i, 'top'))}</div>
          <div className="flex gap-1">{BOTTOM_ROW.slice(0, 6).map((i) => renderPoint(i, 'bottom'))}</div>
        </div>

        <Bar
          white={Math.max(0, board.bar.white)}
          black={-Math.max(0, board.bar.black)}
          selectable={selectableFroms.includes(BAR)}
          selected={selectedFrom === BAR}
          onClick={() => controller.clickPoint(BAR)}
        />

        <div className="flex flex-col justify-between gap-3">
          <div className="flex gap-1">{TOP_ROW.slice(6).map((i) => renderPoint(i, 'top'))}</div>
          <div className="flex gap-1">{BOTTOM_ROW.slice(6).map((i) => renderPoint(i, 'bottom'))}</div>
        </div>

        <div className="flex flex-col justify-between gap-3 pl-1">
          <Tray label="black off" value={board.off.black} />
          <Tray
            label="white off"
            value={board.off.white}
            active={targets.includes(OFF)}
            onClick={() => controller.clickPoint(OFF)}
          />
        </div>
      </div>

      <div className="flex h-8 items-center gap-3 text-2xl text-amber-200">
        {state.roll && state.phase !== 'rolling' ? (
          <span aria-label="dice">
            {die(state.roll[0])} {die(state.roll[1])}
          </span>
        ) : null}
        {state.remaining.length > 0 && (
          <span className="text-sm text-emerald-200/80">remaining: {state.remaining.join(', ')}</span>
        )}
      </div>
    </div>
  );
};
