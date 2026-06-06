import { pipCount } from '@backgammon/core';
import { Board } from '@/components/Board';
import { cn } from '@/lib/cn';
import { useLocalGame } from '@/useLocalGame';

const Button = ({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    type="button"
    className={cn(
      'rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-900 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40',
      className,
    )}
    {...props}
  />
);

export const App = () => {
  const game = useLocalGame();
  const { state } = game;

  const status = (() => {
    if (state.phase === 'gameOver' && state.result) {
      const { winner, kind, points } = state.result;
      return `${winner} wins a ${kind} — ${points} point${points === 1 ? '' : 's'}`;
    }
    if (state.phase === 'doubleOffered') return `${state.doubleOfferedBy} offers a double`;
    const verb = state.phase === 'rolling' ? 'to roll' : 'to move';
    return `${state.turn} ${verb}${game.isHumanTurn ? ' (you)' : ' (AI)'}`;
  })();

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center gap-5 px-4 py-6 text-emerald-50">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-amber-300">Backgammon</h1>
        <p className="text-sm text-emerald-200/70">You play white. Click a checker, then its destination.</p>
      </header>

      <div
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-lg bg-emerald-950/60 px-4 py-2 text-sm',
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

      <Board game={game} />

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={game.newGame} className="bg-emerald-600 text-emerald-50 hover:bg-emerald-500">
          New game
        </Button>
        <Button onClick={game.rollDice} disabled={!(game.isHumanTurn && state.phase === 'rolling')}>
          Roll
        </Button>
        <Button
          onClick={game.double}
          disabled={!game.canHumanDouble}
          className="bg-sky-500 text-stone-900 hover:bg-sky-400"
        >
          Double
        </Button>
        {game.selectedFrom !== null && (
          <Button onClick={game.clearSelection} className="bg-stone-600 text-stone-50 hover:bg-stone-500">
            Clear selection
          </Button>
        )}
      </div>
    </div>
  );
};
