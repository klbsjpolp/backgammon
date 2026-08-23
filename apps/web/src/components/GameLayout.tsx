import { createPortal } from 'react-dom';
import { BoardBandContext } from '@/boardBand';
import { useFullscreenState } from '@/fullscreen';
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
 * Fullscreen moves the controls and the status *inside* the board, into a band
 * opened between its two halves — see the `body[data-fullscreen]` rule in
 * `index.css`, which makes the frame tall enough that `justify-between` pushes
 * the point rows apart and leaves the gap this sits in.
 *
 * It is the same trade the whole fullscreen mode is: a strip of felt that was
 * drawing nothing costs the board no height, where the two rows under it cost it
 * theirs. The band is an overlay rather than a row of the board's own flex, which
 * would have meant restructuring a frame whose bar and trays deliberately span
 * its full height.
 *
 * `pointer-events-none` on the band and `auto` on its two halves: the gap has no
 * points in it, but the band's box is a rectangle and the row edges are close.
 */
const FullscreenBand = ({ status, controls }: Pick<GameLayoutProps, 'status' | 'controls'>) => (
  <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center gap-board-gutter px-board-pad">
    {/*
     * The three widths are the frame's own, in the frame's own unit: six points
     * and the five gutters between them, then the bar, then everything left.
     * The middle one is empty on purpose — the bar centres its checkers, so a
     * player entering from the bar has them exactly here, and a panel laid over
     * the bar would hide both them and the target they have to be dropped on.
     */}
    <div className="pointer-events-auto flex w-[calc(var(--pt)*6.6)] items-center justify-center">{controls}</div>
    <div className="w-board-bar" />
    {/* `min-w-0`, or a long result — "Noir gagne un backgammon" — pushes the
        controls out of their half instead of wrapping inside its own. */}
    <div className="pointer-events-auto min-w-0 flex-1">{status}</div>
  </div>
);

/**
 * Portrait stacks status → board → controls. Landscape phones are too short for
 * that (the buttons end up below the fold, right where a thumb rests), so the
 * board moves to the left and everything else becomes a column beside it.
 * Fullscreen puts both inside the board — see {@link FullscreenBand}.
 */
export const GameLayout = ({ status, board, controls, hint }: GameLayoutProps) => {
  const { isFullscreen } = useFullscreenState();

  if (isFullscreen) {
    return (
      // The band is handed to `<Board>` rather than drawn here: it has to be a
      // child of `.board-fit` to inherit `--pt`. See `boardBand.ts`.
      <BoardBandContext.Provider value={<FullscreenBand status={status} controls={controls} />}>
        <div className="grid w-full justify-items-center">{board}</div>
      </BoardBandContext.Provider>
    );
  }

  return (
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
      {/* Landscape has no height to spare once take/drop show up: the hint goes first. */}
      <p className="text-center text-xs text-muted compact:hidden">{hint}</p>
    </div>
  );
};

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
    // In the board's band the three columns have nothing to centre against —
    // the band's own half is the frame — so the grid collapses to one row and
    // the dice simply lead it, immediately left of Roll as on a roomy page.
    <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 fullscreen:flex fullscreen:justify-center">
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

      {/*
       * `max-sm:flex-nowrap` is what makes the portrait height budget true by
       * construction rather than by measurement: this row is 44px on every
       * phone, because it is no longer allowed to become 96. It used to wrap at
       * 360px and under, which is 52px the board had already been promised —
       * the page then scrolled by exactly that on every screen of the game.
       * The controls that give when it is tight are named in `TurnControls`.
       */}
      <ControlRow className="col-start-2 col-end-3 row-start-1 w-full max-sm:col-start-1 max-sm:col-end-4 max-sm:flex-nowrap compact:col-start-1 compact:col-end-4 compact:row-start-2 fullscreen:w-auto fullscreen:flex-nowrap">
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
