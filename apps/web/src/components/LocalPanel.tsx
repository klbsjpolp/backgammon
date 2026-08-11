import { pipCount } from '@backgammon/core';
import { Board } from '@/components/Board';
import { Button, ConfirmButton } from '@/components/Button';
import { Controls, GameLayout } from '@/components/GameLayout';
import { cn } from '@/lib/cn';
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

  const status = (() => {
    if (state.phase === 'gameOver' && state.result) {
      const { winner, kind, points } = state.result;
      return `${winner} wins a ${kind} — ${points} point${points === 1 ? '' : 's'}`;
    }
    if (state.phase === 'doubleOffered') {
      return game.doubleToYou
        ? `AI offers a double — take at ×${state.cube.value * 2} or drop`
        : `${state.doubleOfferedBy} offers a double`;
    }
    const verb = state.phase === 'rolling' ? 'to roll' : 'to move';
    return `${state.turn} ${verb}${game.isHumanTurn ? ' (you)' : ' (AI)'}`;
  })();

  return (
    <GameLayout
      hint="You play white. Click a checker, then its destination."
      status={
        <div
          className={cn(
            'flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-surface px-4 py-2 text-sm',
            state.phase === 'gameOver' && 'bg-highlight-soft',
          )}
        >
          <span className="font-semibold capitalize">{status}</span>
          <span className="text-muted">
            cube ×{state.cube.value}
            {state.cube.owner ? ` (${state.cube.owner})` : ''} · pips W {pipCount(state.board, 'white')} / B{' '}
            {pipCount(state.board, 'black')}
          </span>
        </div>
      }
      board={<Board controller={game} />}
      controls={
        <Controls
          primary={
            <>
              <Button
                onClick={game.rollDice}
                disabled={!(game.isHumanTurn && state.phase === 'rolling')}
                className="min-w-28 text-base compact:col-span-2"
              >
                Roll
              </Button>
              <Button
                onClick={game.double}
                disabled={!game.canHumanDouble}
                className="bg-info text-info-fg hover:bg-info-hover"
              >
                Double
              </Button>
              {game.doubleToYou && (
                <>
                  <Button
                    onClick={() => game.respond(true)}
                    className="bg-positive text-positive-fg hover:bg-positive-hover"
                  >
                    Take
                  </Button>
                  <Button
                    onClick={() => game.respond(false)}
                    className="bg-danger text-danger-fg hover:bg-danger-hover"
                  >
                    Drop
                  </Button>
                </>
              )}
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
