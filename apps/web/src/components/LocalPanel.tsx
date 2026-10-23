import { useLayoutEffect } from 'react';
import { Board } from '@/components/Board';
import { ConfirmButton } from '@/components/Button';
import { Controls, GameLayout, ShortcutHint } from '@/components/GameLayout';
import { TurnControls } from '@/components/TurnControls';
import { TurnAnnouncer, TurnStatus } from '@/components/TurnStatus';
import { useFullscreenState } from '@/fullscreen';
import { useHeaderSlot } from '@/headerSlot';
import { SIDE_PLURAL } from '@/lib/french';
import { useLocalGame } from '@/useLocalGame';
import { cn } from '@/lib/cn';

interface LocalPanelProps {
  /**
   * Applies a deployed update, if one is pending, instead of starting the new
   * game — the reload comes up on a fresh game anyway. Returns true when it took
   * over.
   */
  applyPendingUpdate?: () => boolean;
  /**
   * Reports whether "Nouvelle partie" currently belongs in the header menu, for
   * `HeaderMenu`'s trigger — see `App`. False once the game is over, which is
   * when the button moves out of the menu and stands next to the result
   * instead, so a menu with nothing left in it does not linger on screen.
   */
  onHeaderActionChange?: (hasAction: boolean) => void;
}

export const LocalPanel = ({ applyPendingUpdate, onHeaderActionChange }: LocalPanelProps = {}) => {
  const game = useLocalGame();
  const { state } = game;
  const headerSlot = useHeaderSlot();
  const isOver = state.phase === 'gameOver';
  /*
   * Fullscreen draws the status and the controls side by side in a band one row
   * deep (see `FullscreenBand`). The result with the button stacked under it is
   * two rows, and centred in that band it spilled both ways — under the dice
   * above it and over the points below. Once the game is over the roll and
   * double buttons have nothing left to do, so the button takes their half
   * instead and the band stays one row.
   */
  const { isFullscreen } = useFullscreenState();
  const buttonInControls = isOver && isFullscreen;

  /*
   * `useLayoutEffect`, not `useEffect`: `Controls` already stops portaling the
   * button into the header the same render `isOver` flips, so a passive effect
   * would report the header's new, empty state to `App` one paint late — the
   * "..." trigger open on nothing for a frame. Same reasoning as `HeaderMenu`'s
   * own layout effect.
   */
  useLayoutEffect(() => {
    onHeaderActionChange?.(!isOver);
  }, [isOver, onHeaderActionChange]);

  const startNewGame = () => {
    if (applyPendingUpdate?.()) return;
    game.newGame();
    // The menu otherwise lingers open over a game that already restarted.
    headerSlot?.closeMenu();
  };

  // The second tap guards a game in progress. Once the game is over there is
  // nothing left to throw away — the confirmation is then pure friction
  // between the result and the next game, so `confirm` drops it. It stays the
  // same element either way: swapping in a plain button resized it at the
  // moment the game ended, which is when the player's hand is already moving
  // towards it.
  const newGameButton = (
    <ConfirmButton
      label="Nouvelle partie"
      confirmLabel="Recommencer ?"
      confirm={!isOver}
      onConfirm={startNewGame}
      className={cn(
        'bg-positive text-positive-fg hover:bg-positive-hover',
        // Beside the result it takes the status box's height — see the status row below.
        isOver && !buttonInControls && 'portrait-phone:min-h-0',
      )}
    />
  );

  return (
    <>
      {/* Outside `GameLayout`, and so outside the layout it chooses: fullscreen
          draws the status inside the board's frame, and a subtree that moves is
          rebuilt rather than relocated. The one region that speaks has to be
          mounted before what it announces changes, so it sits here where no
          layout can take it down. */}
      <TurnAnnouncer state={state} you={game.you} opponentLabel="IA" />
      <GameLayout
        hint={
          <>
            Vous jouez les {SIDE_PLURAL[game.you]}. Faites glisser un pion là où il va, ou cliquez-le puis sa
            destination.
            <ShortcutHint />
          </>
        }
        status={
          /*
           * Beside the result rather than under it. Stacked, the button was a
           * row the height budget never paid for: the board and everything
           * under it dropped 52px the moment the game ended, and a portrait
           * phone scrolled by that much. In a row it is as tall as the status
           * box already is — stretched to it, and on a portrait phone allowed
           * below its 44px minimum to match the box's 40, since four pixels
           * more there would move the board just the same.
           *
           * The landscape sidebar keeps the stack: it is ~156px wide, the
           * result already needs three lines of it, and a sidebar growing
           * downwards moves nothing.
           *
           * `min-w-0` on the status for the reason `GameLayout` gives: its
           * lines are `truncate`, whose min-content is the whole sentence.
           */
          <div className="flex w-full items-stretch gap-2 compact:flex-col compact:items-center">
            <div className="min-w-0 flex-1 compact:w-full">
              <TurnStatus state={state} you={game.you} opponentLabel="IA" />
            </div>
            {/* The result is the one message with nothing after it — no next roll,
                no next double — so the action that follows it goes right beside it
                rather than behind the header menu's tap. Built once above and
                dropped in exactly one place: here, in `primary` (fullscreen), or
                in `danger` below, never two — see `Controls`. */}
            {isOver && !buttonInControls && newGameButton}
          </div>
        }
        board={<Board controller={game} />}
        controls={
          <Controls
            primary={
              buttonInControls ? (
                newGameButton
              ) : (
                <TurnControls
                  canRoll={game.canRoll}
                  canDouble={game.canHumanDouble}
                  isMoving={game.isHumanMoving}
                  canUndo={game.canHumanUndo}
                  isDoubleToYou={game.doubleToYou}
                  isHolding={game.selectedFrom !== null}
                  autoRoll={game.autoRoll}
                  onRoll={game.rollDice}
                  onAutoRollChange={game.setAutoRoll}
                  onDouble={game.double}
                  onUndo={game.undo}
                  onRespond={game.respond}
                  onClearSelection={game.clearSelection}
                />
              )
            }
            danger={!isOver && newGameButton}
          />
        }
      />
    </>
  );
};
