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
    <p className="text-center text-xs text-muted compact:hidden">{hint}</p>
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
 * The buttons, the rule off, and the dice beside them.
 *
 * The group of actions that abandon the game in progress is pushed away from the
 * primary buttons on purpose — combined with the two-tap {@link ConfirmButton}, a
 * stray tap near the edge of the screen no longer throws the match away.
 *
 * Three columns, and the outer two are `1fr`: a group in the middle one stays
 * centred on the page whatever the dice take on the left. Which cell the dice
 * land in is the whole reason this is a grid rather than two stacked rows —
 * every layout wants them somewhere else, and one element moved by CSS beats a
 * copy per breakpoint that a screen reader would find twice.
 *
 *   roomy     — row 1, column 1, right-aligned: immediately left of Roll.
 *   portrait  — the bottom row, hard left, under Roll. That row holds one
 *               button and nothing else, so it is the only one with the ~132px
 *               that four dice need on a double; the primary row above has 33.
 *   landscape — a line of its own at the top of the sidebar, which is the right
 *               of the screen and directly above Roll. The sidebar has height
 *               going spare where the board has none.
 */
export const Controls = ({
  dice,
  primary,
  danger,
}: {
  dice: React.ReactNode;
  primary: React.ReactNode;
  danger: React.ReactNode;
}) => (
  <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
    {/*
     * Reserved at the width of a double — four dice — so that rolling one does
     * not slide the buttons sideways mid-turn. Every row it sits in is a 44px
     * control row, and a die is 30px, so it costs no height anywhere.
     */}
    <div
      className={cn(
        'col-start-1 col-end-2 row-start-1 flex min-w-33 justify-end text-3xl',
        'max-sm:row-start-3 max-sm:justify-start',
        'compact:col-end-4 compact:row-start-1 compact:justify-start',
      )}
    >
      {dice}
    </div>

    <ControlRow className="col-start-2 col-end-3 row-start-1 w-full max-sm:col-start-1 max-sm:col-end-4 compact:col-start-1 compact:col-end-4 compact:row-start-2">
      {primary}
    </ControlRow>

    {/* Its own element rather than a border on the row below, which now starts
      in the second column and would draw a rule only as wide as its button. */}
    <div className="col-start-1 col-end-4 row-start-2 h-px w-full max-w-xs justify-self-center bg-line compact:row-start-3 compact:max-w-none" />

    <ControlRow className="col-start-2 col-end-3 row-start-3 w-full compact:col-start-1 compact:col-end-4 compact:row-start-4 compact:grid-cols-1">
      {danger}
    </ControlRow>
  </div>
);
