import { createPortal } from 'react-dom';
import { useHeaderSlot } from '@/headerSlot';
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
 * The double-click shortcut, said only where there is room to say it. At 375px
 * the hint already runs to two lines, and this clause makes it three — a line
 * the portrait phone's height budget in `index.css` does not have. So the phone
 * keeps the two gestures that always work, and the shortcut is told to the
 * screens with room for it.
 */
export const ShortcutHint = () => (
  <span className="max-sm:hidden">&nbsp;Double-cliquez un pion qui n'a qu'un coup possible pour le jouer.</span>
);

/**
 * Portrait stacks status → board → controls. Landscape phones are too short for
 * that (the buttons end up below the fold, right where a thumb rests), so the
 * board moves to the left and everything else becomes a column beside it.
 */
export const GameLayout = ({ status, board, controls, hint }: GameLayoutProps) => (
  <div
    className={cn(
      'grid w-full justify-items-center gap-3',
      // The sidebar is the tallest thing on a landscape phone once the dice
      // hold their line, and 320px of height is 4px short of it — which the
      // rows give up more cheaply than the column gap beside the board does.
      'compact:grid-cols-[auto_minmax(11rem,15rem)] compact:items-start compact:gap-x-4 compact:gap-y-3',
    )}
  >
    <div className="w-full compact:col-start-2 compact:row-start-1">{status}</div>
    <div className="compact:col-start-1 compact:row-span-3 compact:row-start-1">{board}</div>
    <div className="w-full compact:col-start-2 compact:row-start-2">{controls}</div>
    {/* Landscape has no height to spare once take/drop show up: the hint goes
        first — fullscreen for the same reason, once the board is the only
        thing spending it. */}
    <p className="text-center text-xs text-muted compact:hidden fullscreen:hidden">{hint}</p>
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
 *
 * On a roomy screen the danger group leaves this grid altogether and is portaled
 * into the page header — see {@link useHeaderSlot}. It takes its separating rule
 * with it, which has nothing left to separate once the row below it is gone.
 */
export const Controls = ({
  dice,
  primary,
  danger,
}: {
  dice: React.ReactNode;
  primary: React.ReactNode;
  danger: React.ReactNode;
}) => {
  const headerSlot = useHeaderSlot();

  return (
    <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
      {/*
       * Reserved at the width of a double — four dice — so that rolling one does
       * not slide the buttons sideways mid-turn.
       *
       * And at the height of one die, because `<Dice>` renders nothing at all
       * until a roll lands. Where the cell shares a row with the buttons that is
       * free — a control row is 44px and a die is 30px — but in landscape the
       * dice have a line of their own at the top of the sidebar, and there an
       * empty cell collapsed: rolling pushed everything under it 30px down the
       * screen and the next player's turn pulled it back up. The sidebar is the
       * one column with height going spare, so it pays the 30px permanently.
       */}
      <div
        className={cn(
          'col-start-1 col-end-2 row-start-1 flex min-h-[1em] min-w-33 justify-end text-3xl',
          'max-sm:row-start-3 max-sm:justify-start',
          'compact:col-end-4 compact:row-start-1 compact:justify-start',
        )}
      >
        {dice}
      </div>

      <ControlRow className="col-start-2 col-end-3 row-start-1 w-full max-sm:col-start-1 max-sm:col-end-4 compact:col-start-1 compact:col-end-4 compact:row-start-2">
        {primary}
      </ControlRow>

      {headerSlot ? (
        // The header row is already a group of chrome, so the buttons need no
        // rule to be told apart from the play controls — they are now the far
        // side of the board from them, which is more distance than the rule
        // ever bought.
        createPortal(<div className="flex items-center gap-2">{danger}</div>, headerSlot)
      ) : (
        <>
          {/* Its own element rather than a border on the row below, which now starts
            in the second column and would draw a rule only as wide as its button. */}
          <div className="col-start-1 col-end-4 row-start-2 h-px w-full max-w-xs justify-self-center bg-line compact:row-start-3 compact:max-w-none" />

          <ControlRow className="col-start-2 col-end-3 row-start-3 w-full compact:col-start-1 compact:col-end-4 compact:row-start-4 compact:grid-cols-1">
            {danger}
          </ControlRow>
        </>
      )}
    </div>
  );
};
