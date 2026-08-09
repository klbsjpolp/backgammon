import { useState } from 'react';
import { canDouble, opponent, pipCount } from '@backgammon/core';
import { Board, type BoardController } from '@/components/Board';
import { Button, ConfirmButton } from '@/components/Button';
import { Controls, GameLayout } from '@/components/GameLayout';
import { cn } from '@/lib/cn';
import { useOnlineGame } from '@/online/useOnlineGame';

const Banner = ({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'error' }) => (
  <div
    className={cn(
      'w-full rounded-lg px-4 py-2 text-sm',
      tone === 'error' ? 'bg-red-900/50 text-red-100' : 'bg-emerald-950/60 text-emerald-100',
    )}
  >
    {children}
  </div>
);

export const OnlinePanel = () => {
  const g = useOnlineGame();
  const [joinCode, setJoinCode] = useState('');

  // --- Not connected: create or join ---------------------------------------
  if (g.status === 'idle' || g.status === 'error') {
    return (
      <div className="flex w-full max-w-sm flex-col items-stretch gap-4">
        {g.error && <Banner tone="error">{g.error}</Banner>}
        <Button onClick={() => void g.hostRoom()} className="bg-emerald-600 text-emerald-50 hover:bg-emerald-500">
          Host a new game
        </Button>
        <div className="flex items-center gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Room code"
            aria-label="Room code"
            className="min-w-0 flex-1 rounded-md bg-emerald-950/60 px-3 py-2 text-sm uppercase tracking-widest text-emerald-50 outline-none ring-1 ring-emerald-700 focus:ring-amber-400"
          />
          <Button onClick={() => void g.joinRoom(joinCode.trim())} disabled={joinCode.trim().length === 0}>
            Join
          </Button>
        </div>
      </div>
    );
  }

  if (g.status === 'connecting') {
    return <Banner>Connecting…</Banner>;
  }

  // --- Lobby ---------------------------------------------------------------
  if (g.status === 'lobby') {
    const isHost = g.session != null && g.session.seatIndex === g.session.hostSeatIndex;
    const seats = g.room?.lobbySeats ?? [];
    const readyCount = seats.filter((s) => s.readyState === 'ready').length;
    return (
      <div className="flex w-full max-w-sm flex-col items-stretch gap-4">
        <Banner>
          Room code: <span className="font-mono text-lg tracking-widest text-amber-300">{g.session?.roomCode}</span>
          <span className="ml-2 text-emerald-300/70">— share it with your opponent</span>
        </Banner>
        <ul className="flex flex-col gap-1 rounded-lg bg-emerald-950/40 p-3 text-sm">
          {seats.map((seat) => (
            <li key={seat.seatIndex} className="flex items-center justify-between">
              <span>
                Seat {seat.seatIndex}
                {seat.seatIndex === g.session?.seatIndex ? ' (you)' : ''}
                {seat.displayName ? ` — ${seat.displayName}` : ''}
              </span>
              <span className={cn('text-xs', seat.readyState === 'ready' ? 'text-emerald-300' : 'text-emerald-200/50')}>
                {seat.readyState}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => g.setReady()}>Ready</Button>
          {isHost && (
            <Button
              onClick={g.start}
              disabled={readyCount < 2}
              className="bg-emerald-600 text-emerald-50 hover:bg-emerald-500"
            >
              Start game
            </Button>
          )}
          <ConfirmButton
            label="Leave"
            confirmLabel="Leave room?"
            onConfirm={g.leave}
            className="bg-stone-600 text-stone-50 hover:bg-stone-500"
          />
        </div>
      </div>
    );
  }

  // --- In game (playing / gameOver / disconnected) -------------------------
  const state = g.state;
  if (!state) {
    return (
      <div className="flex w-full max-w-sm flex-col items-stretch gap-3">
        <Banner tone={g.status === 'disconnected' ? 'error' : 'info'}>
          {g.status === 'disconnected' ? (g.error ?? 'Disconnected.') : 'Waiting for the host to start…'}
        </Banner>
        <ConfirmButton
          label="Leave"
          confirmLabel="Leave room?"
          onConfirm={g.leave}
          className="bg-stone-600 text-stone-50 hover:bg-stone-500"
        />
      </div>
    );
  }

  const controller: BoardController = {
    state,
    you: g.myPlayer ?? 'white',
    selectableFroms: g.selectableFroms,
    selectedFrom: g.selectedFrom,
    targets: g.targets,
    clickPoint: g.clickPoint,
  };

  const youTurn = g.view?.yourTurn ?? false;
  const doubleToMe =
    state.phase === 'doubleOffered' && g.myPlayer != null && state.doubleOfferedBy === opponent(g.myPlayer);

  const status = (() => {
    if (state.phase === 'gameOver' && state.result) {
      const { winner, kind, points } = state.result;
      const mine = winner === g.myPlayer;
      return `${mine ? 'You win' : `${winner} wins`} a ${kind} — ${points} point${points === 1 ? '' : 's'}`;
    }
    if (state.phase === 'doubleOffered') return `${state.doubleOfferedBy} offers a double`;
    const verb = state.phase === 'rolling' ? 'to roll' : 'to move';
    return `${state.turn} ${verb}${youTurn ? ' (you)' : ''}`;
  })();

  return (
    <GameLayout
      hint={`You play ${g.myPlayer}. Click a checker, then its destination.`}
      status={
        <div className="flex w-full flex-col gap-2">
          {g.status === 'disconnected' && <Banner tone="error">{g.error ?? 'Connection lost.'}</Banner>}
          <div
            className={cn(
              'flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-emerald-950/60 px-4 py-2 text-sm',
              state.phase === 'gameOver' && 'bg-amber-900/40',
            )}
          >
            <span className="font-semibold capitalize">{status}</span>
            <span className="text-emerald-200/70">
              cube ×{state.cube.value} · pips W {pipCount(state.board, 'white')} / B {pipCount(state.board, 'black')}
            </span>
          </div>
        </div>
      }
      board={<Board controller={controller} />}
      controls={
        <Controls
          primary={
            <>
              <Button
                onClick={g.rollDice}
                disabled={!(youTurn && state.phase === 'rolling')}
                className="min-w-28 text-base compact:col-span-2"
              >
                Roll
              </Button>
              <Button
                onClick={g.double}
                disabled={g.myPlayer == null || !canDouble(state, g.myPlayer)}
                className="bg-sky-500 hover:bg-sky-400"
              >
                Double
              </Button>
              {doubleToMe && (
                <>
                  <Button
                    onClick={() => g.respond(true)}
                    className="bg-emerald-600 text-emerald-50 hover:bg-emerald-500"
                  >
                    Take
                  </Button>
                  <Button onClick={() => g.respond(false)} className="bg-red-600 text-red-50 hover:bg-red-500">
                    Drop
                  </Button>
                </>
              )}
            </>
          }
          danger={
            <ConfirmButton
              label="Leave"
              confirmLabel="Leave game?"
              onConfirm={g.leave}
              className="bg-stone-600 text-stone-50 hover:bg-stone-500"
            />
          }
        />
      }
    />
  );
};
