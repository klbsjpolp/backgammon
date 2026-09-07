import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { canDouble, opponent } from '@backgammon/core';
import { Board, type BoardController } from '@/components/Board';
import { Button, ConfirmButton } from '@/components/Button';
import { Dice } from '@/components/Dice';
import { Controls, GameLayout, ShortcutHint } from '@/components/GameLayout';
import { TurnControls } from '@/components/TurnControls';
import { TurnAnnouncer, TurnStatus } from '@/components/TurnStatus';
import { useHeaderSlot } from '@/headerSlot';
import { cn } from '@/lib/cn';
import { SIDE_PLURAL } from '@/lib/french';
import { useOnlineGame } from '@/online/useOnlineGame';

const Banner = ({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'error' }) => (
  <div
    className={cn(
      'w-full rounded-lg px-4 py-2 text-sm',
      tone === 'error' ? 'bg-danger-soft text-danger-soft-fg' : 'bg-surface text-fg',
    )}
  >
    {children}
  </div>
);

interface OnlinePanelProps {
  /**
   * Applies a deployed update, if one is pending, instead of entering a room —
   * better now than reloading a player out of a room code they just shared.
   * Returns true when it took over.
   */
  applyPendingUpdate?: () => boolean;
  /** Reports whether a reload would cost the player their seat in a room. */
  onBusyChange?: (busy: boolean) => void;
  /**
   * Reports whether there is currently a "leave/abandon" action to offer, for
   * `HeaderMenu`'s trigger — see `App`. Deliberately not the same question as
   * `onBusyChange`: that one also covers `connecting`, which has no way to leave
   * at all today, and a menu that opens on nothing would be worse than no menu.
   */
  onLeaveActionChange?: (hasAction: boolean) => void;
}

export const OnlinePanel = ({ applyPendingUpdate, onBusyChange, onLeaveActionChange }: OnlinePanelProps = {}) => {
  const g = useOnlineGame();
  const [joinCode, setJoinCode] = useState('');
  const isInRoom = g.status !== 'idle' && g.status !== 'error';
  const hasLeaveAction = g.status !== 'idle' && g.status !== 'error' && g.status !== 'connecting';
  const headerSlot = useHeaderSlot();

  useEffect(() => {
    onBusyChange?.(isInRoom);
  }, [isInRoom, onBusyChange]);

  // Leaving online mode entirely leaves nothing to protect.
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  useEffect(() => {
    onLeaveActionChange?.(hasLeaveAction);
  }, [hasLeaveAction, onLeaveActionChange]);

  // Leaving online mode entirely leaves nothing to abandon.
  useEffect(() => () => onLeaveActionChange?.(false), [onLeaveActionChange]);

  /** Closes the header menu behind whichever "Quitter" just fired. */
  const handleLeave = () => {
    g.leave();
    headerSlot?.closeMenu();
  };

  // --- Not connected: create or join ---------------------------------------
  if (g.status === 'idle' || g.status === 'error') {
    return (
      <div className="flex w-full max-w-sm flex-col items-stretch gap-4">
        {g.error && <Banner tone="error">{g.error}</Banner>}
        <Button
          onClick={() => {
            if (applyPendingUpdate?.()) return;
            void g.hostRoom();
          }}
          className="bg-positive text-positive-fg hover:bg-positive-hover"
        >
          Héberger une partie
        </Button>
        <div className="flex items-center gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Code du salon"
            aria-label="Code du salon"
            className="min-w-0 flex-1 rounded-md bg-surface px-3 py-2 text-sm uppercase tracking-widest text-fg outline-none ring-1 ring-line focus:ring-accent"
          />
          <Button
            onClick={() => {
              if (applyPendingUpdate?.()) return;
              void g.joinRoom(joinCode.trim());
            }}
            disabled={joinCode.trim().length === 0}
          >
            Rejoindre
          </Button>
        </div>
      </div>
    );
  }

  if (g.status === 'connecting') {
    return <Banner>Connexion…</Banner>;
  }

  // --- Lobby ---------------------------------------------------------------
  if (g.status === 'lobby') {
    const isHost = g.session != null && g.session.seatIndex === g.session.hostSeatIndex;
    const seats = g.room?.lobbySeats ?? [];
    const readyCount = seats.filter((s) => s.readyState === 'ready').length;
    // Built once and either dropped inline or portaled into the header menu —
    // never both, for the one-copy-in-the-tree reason `Controls` already follows.
    const quitButton = (
      <ConfirmButton
        label="Quitter"
        confirmLabel="Quitter le salon ?"
        onConfirm={handleLeave}
        className="bg-neutral text-neutral-fg hover:bg-neutral-hover"
      />
    );
    return (
      <div className="flex w-full max-w-sm flex-col items-stretch gap-4">
        <Banner>
          Code du salon : <span className="font-mono text-lg tracking-widest text-heading">{g.session?.roomCode}</span>
          <span className="ml-2 text-muted">— partagez-le avec votre adversaire</span>
        </Banner>
        <ul className="flex flex-col gap-1 rounded-lg bg-surface-soft p-3 text-sm">
          {seats.map((seat) => (
            <li key={seat.seatIndex} className="flex items-center justify-between">
              <span>
                Place {seat.seatIndex}
                {seat.seatIndex === g.session?.seatIndex ? ' (vous)' : ''}
                {seat.displayName ? ` — ${seat.displayName}` : ''}
              </span>
              <span className={cn('text-xs', seat.readyState === 'ready' ? 'text-positive' : 'text-muted')}>
                {/* The server's own word (`ready` / `never-ready`) used to reach the
                    screen untranslated. Only the ready state means anything to a
                    player waiting to start, so everything else is "pas prêt". */}
                {seat.readyState === 'ready' ? 'prêt' : 'pas prêt'}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => g.setReady()}>Prêt</Button>
          {isHost && (
            <Button
              onClick={g.start}
              disabled={readyCount < 2}
              className="bg-positive text-positive-fg hover:bg-positive-hover"
            >
              Démarrer la partie
            </Button>
          )}
          {!headerSlot && quitButton}
        </div>
        {headerSlot && createPortal(quitButton, headerSlot.node)}
      </div>
    );
  }

  // --- In game (playing / gameOver / disconnected) -------------------------
  const state = g.state;
  if (!state) {
    const quitButton = (
      <ConfirmButton
        label="Quitter"
        confirmLabel="Quitter le salon ?"
        onConfirm={handleLeave}
        className="bg-neutral text-neutral-fg hover:bg-neutral-hover"
      />
    );
    return (
      <div className="flex w-full max-w-sm flex-col items-stretch gap-3">
        <Banner tone={g.status === 'disconnected' ? 'error' : 'info'}>
          {g.status === 'disconnected' ? (g.error ?? 'Déconnecté.') : "En attente du lancement par l'hôte…"}
        </Banner>
        {!headerSlot && quitButton}
        {headerSlot && createPortal(quitButton, headerSlot.node)}
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
    playOnlyMove: g.playOnlyMove,
    targetsFrom: g.targetsFrom,
    selectFrom: g.selectFrom,
    moveChecker: g.moveChecker,
  };

  const doubleToMe =
    state.phase === 'doubleOffered' && g.myPlayer != null && state.doubleOfferedBy === opponent(g.myPlayer);

  return (
    <>
      {/* Outside `GameLayout`, and so outside the layout it chooses — see
          `LocalPanel`, and `TurnAnnouncer` itself. */}
      <TurnAnnouncer state={state} you={controller.you} />
      <GameLayout
        hint={
          <>
            Vous jouez les {SIDE_PLURAL[controller.you]}. Faites glisser un pion là où il va, ou cliquez-le puis sa
            destination.
            <ShortcutHint />
          </>
        }
        status={
          <div className="flex w-full flex-col gap-2">
            {g.status === 'disconnected' && <Banner tone="error">{g.error ?? 'Connexion perdue.'}</Banner>}
            <TurnStatus state={state} you={controller.you} />
          </div>
        }
        board={<Board controller={controller} />}
        controls={
          <Controls
            dice={<Dice state={state} />}
            primary={
              <TurnControls
                canRoll={g.canRoll}
                canDouble={g.myPlayer != null && canDouble(state, g.myPlayer)}
                isDoubleToYou={doubleToMe}
                isHolding={g.selectedFrom !== null}
                autoRoll={g.autoRoll}
                onRoll={g.rollDice}
                onAutoRollChange={g.setAutoRoll}
                onDouble={g.double}
                onRespond={g.respond}
                onClearSelection={g.clearSelection}
              />
            }
            danger={
              // "Quitter ?" rather than "Quitter la partie ?": kept short from when
              // this sat in the narrow danger row beside the dice. It now lives in
              // the header menu instead (see `headerSlot.ts`), which has room to
              // spare, but there is no reason left to say more.
              <ConfirmButton
                label="Quitter"
                confirmLabel="Quitter ?"
                onConfirm={handleLeave}
                className="bg-neutral text-neutral-fg hover:bg-neutral-hover"
              />
            }
          />
        }
      />
    </>
  );
};
