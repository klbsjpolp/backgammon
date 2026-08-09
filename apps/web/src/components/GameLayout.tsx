import { cn } from '@/lib/cn';

interface GameLayoutProps {
  /** Turn/score line, plus any banners that belong with it. */
  status: React.ReactNode;
  board: React.ReactNode;
  controls: React.ReactNode;
  /** One-line reminder of how to play; the first thing dropped when space is tight. */
  hint: React.ReactNode;
}

/**
 * Portrait stacks status → board → controls. Landscape phones are too short for
 * that (the buttons end up below the fold, right where a thumb rests), so the
 * board moves to the left and everything else becomes a column beside it.
 */
export const GameLayout = ({ status, board, controls, hint }: GameLayoutProps) => (
  <div
    className={cn(
      'grid w-full justify-items-center gap-3',
      'compact:grid-cols-[auto_minmax(11rem,15rem)] compact:items-start compact:gap-4',
    )}
  >
    <div className="w-full compact:col-start-2 compact:row-start-1">{status}</div>
    <div className="compact:col-start-1 compact:row-span-3 compact:row-start-1">{board}</div>
    <div className="w-full compact:col-start-2 compact:row-start-2">{controls}</div>
    {/* Landscape has no height to spare once take/drop show up: the hint goes first. */}
    <p className="text-center text-xs text-emerald-200/60 compact:hidden">{hint}</p>
  </div>
);

/**
 * One group of buttons: a centred wrapping row in portrait, and a two-up grid in
 * the landscape sidebar — a single stack runs out of height as soon as take/drop
 * and clear-selection join roll and double.
 */
export const ControlRow = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <div
    className={cn('flex flex-wrap items-center justify-center gap-2', 'compact:grid compact:grid-cols-2', className)}
  >
    {children}
  </div>
);

/**
 * Holds the group of actions that abandon the game in progress. It is pushed
 * away from the primary buttons on purpose — combined with the two-tap
 * {@link ConfirmButton}, a stray tap near the edge of the screen no longer
 * throws the match away.
 */
export const Controls = ({ primary, danger }: { primary: React.ReactNode; danger: React.ReactNode }) => (
  <div className="flex w-full flex-col items-center gap-3">
    <ControlRow className="w-full">{primary}</ControlRow>
    <ControlRow className="w-full max-w-xs border-t border-emerald-800/60 pt-3 compact:max-w-none compact:grid-cols-1">
      {danger}
    </ControlRow>
  </div>
);
