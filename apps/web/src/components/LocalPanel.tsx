import { pipCount } from '@backgammon/core';
import { Board } from '@/components/Board';
import { Button, ConfirmButton } from '@/components/Button';
import { Controls, GameLayout } from '@/components/GameLayout';
import { cn } from '@/lib/cn';
import { useLocalGame } from '@/useLocalGame';

export const LocalPanel = () => {
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
            'flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-emerald-950/60 px-4 py-2 text-sm',
            state.phase === 'gameOver' && 'bg-amber-900/40',
          )}
        >
          <span className="font-semibold capitalize">{status}</span>
          <span className="text-emerald-200/70">
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
              <Button onClick={game.double} disabled={!game.canHumanDouble} className="bg-sky-500 hover:bg-sky-400">
                Double
              </Button>
              {game.doubleToYou && (
                <>
                  <Button
                    onClick={() => game.respond(true)}
                    className="bg-emerald-600 text-emerald-50 hover:bg-emerald-500"
                  >
                    Take
                  </Button>
                  <Button onClick={() => game.respond(false)} className="bg-red-600 text-red-50 hover:bg-red-500">
                    Drop
                  </Button>
                </>
              )}
              {game.selectedFrom !== null && (
                <Button onClick={game.clearSelection} className="bg-stone-600 text-stone-50 hover:bg-stone-500">
                  Clear selection
                </Button>
              )}
            </>
          }
          danger={
            <ConfirmButton
              label="New game"
              confirmLabel="Start over?"
              onConfirm={game.newGame}
              className="bg-emerald-700 text-emerald-50 hover:bg-emerald-600"
            />
          }
        />
      }
    />
  );
};
