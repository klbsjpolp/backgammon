import { Board } from '@/components/Board';
import { Button, ConfirmButton } from '@/components/Button';
import { Controls, GameLayout } from '@/components/GameLayout';
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

  return (
    <GameLayout
      hint="You play white. Click a checker, then its destination."
      status={<TurnStatus state={state} you={game.you} opponentLabel="AI" />}
      board={<Board controller={game} />}
      controls={
        <Controls
          primary={
            <>
              <TurnControls
                canRoll={game.isHumanTurn && state.phase === 'rolling'}
                canDouble={game.canHumanDouble}
                isDoubleToYou={game.doubleToYou}
                onRoll={game.rollDice}
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
            <ConfirmButton
              label="New game"
              confirmLabel="Start over?"
              onConfirm={() => {
                if (applyPendingUpdate?.()) return;
                game.newGame();
              }}
              className="bg-positive text-positive-fg hover:bg-positive-hover"
            />
          }
        />
      }
    />
  );
};
