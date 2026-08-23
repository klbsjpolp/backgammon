import { Board } from '@/components/Board';
import { ConfirmButton } from '@/components/Button';
import { Dice } from '@/components/Dice';
import { Controls, GameLayout, ShortcutHint } from '@/components/GameLayout';
import { TurnControls } from '@/components/TurnControls';
import { TurnAnnouncer, TurnStatus } from '@/components/TurnStatus';
import { SIDE_PLURAL } from '@/lib/french';
import { useLocalGame } from '@/useLocalGame';

interface LocalPanelProps {
  /**
   * Applies a deployed update, if one is pending, instead of starting the new
   * game — the reload comes up on a fresh game anyway. Returns true when it took
   * over.
   */
  applyPendingUpdate?: () => boolean;
}

export const LocalPanel = ({ applyPendingUpdate }: LocalPanelProps = {}) => {
  const game = useLocalGame();
  const { state } = game;

  const startNewGame = () => {
    if (applyPendingUpdate?.()) return;
    game.newGame();
  };

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

        status={<TurnStatus state={state} you={game.you} opponentLabel="IA" />}
        board={<Board controller={game} />}
        controls={
          <Controls
            dice={<Dice state={state} />}
            primary={
              <TurnControls
                canRoll={game.canRoll}
                canDouble={game.canHumanDouble}
                isDoubleToYou={game.doubleToYou}
                isHolding={game.selectedFrom !== null}
                autoRoll={game.autoRoll}
                onRoll={game.rollDice}
                onAutoRollChange={game.setAutoRoll}
                onDouble={game.double}
                onRespond={game.respond}
                onClearSelection={game.clearSelection}
              />
            }
            danger={
              // The second tap guards a game in progress. Once the game is over
              // there is nothing left to throw away — the confirmation is then
              // pure friction between the result and the next game, so `confirm`
              // drops it. It stays the same element either way: swapping in a
              // plain button resized it at the moment the game ended, which is
              // when the player's hand is already moving towards it.
              <ConfirmButton
                label="Nouvelle partie"
                confirmLabel="Recommencer ?"
                confirm={state.phase !== 'gameOver'}
                onConfirm={startNewGame}
                className="bg-positive text-positive-fg hover:bg-positive-hover"
              />
            }
          />
        }
      />
    </>
  );
};
