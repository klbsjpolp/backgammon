import { Board } from '@/components/Board';
import { Button, ConfirmButton } from '@/components/Button';
import { Dice } from '@/components/Dice';
import { Controls, GameLayout, ShortcutHint } from '@/components/GameLayout';
import { TurnControls } from '@/components/TurnControls';
import { TurnStatus } from '@/components/TurnStatus';
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
    <GameLayout
      hint={
        <>
          You play white. Drag a checker where it goes, or click it and then its destination.
          <ShortcutHint />
        </>
      }

      status={<TurnStatus state={state} you={game.you} opponentLabel="AI" />}
      board={<Board controller={game} />}
      controls={
        <Controls
          dice={<Dice state={state} />}
          primary={
            <>
              <TurnControls
                canRoll={game.canRoll}
                canDouble={game.canHumanDouble}
                isDoubleToYou={game.doubleToYou}
                autoRoll={game.autoRoll}
                onRoll={game.rollDice}
                onAutoRollChange={game.setAutoRoll}
                onDouble={game.double}
                onRespond={game.respond}
              />
              {game.selectedFrom !== null && (
                <Button onClick={game.clearSelection} className="bg-neutral text-neutral-fg hover:bg-neutral-hover">
                  Clear selection
                </Button>
              )}
            </>
          }
          danger={
            // The second tap guards a game in progress. Once the game is over
            // there is nothing left to throw away — the confirmation is then
            // pure friction between the result and the next game, so the button
            // stops being a danger and just starts one.
            state.phase === 'gameOver' ? (
              <Button onClick={startNewGame} className="bg-positive text-positive-fg hover:bg-positive-hover">
                New game
              </Button>
            ) : (
              <ConfirmButton
                label="New game"
                confirmLabel="Start over?"
                onConfirm={startNewGame}
                className="bg-positive text-positive-fg hover:bg-positive-hover"
              />
            )
          }
        />
      }
    />
  );
};
