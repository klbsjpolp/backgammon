import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PROTOCOL_VERSION, type RoomSession, type RoomSummary, type ServerMessage } from '@klbsjpolp/realtime-core';
import {
  BackgammonHost,
  backgammonActionSchema,
  backgammonGameConfigSchema,
  parseGameState,
  parseHostSnapshot,
  serializeView,
  type BackgammonAction,
  type BackgammonView,
} from '@backgammon/runtime';
import { canDouble, opponent, type GameState, type Player } from '@backgammon/core';
import { useAutoRoll } from '@/useAutoRoll';
import { useCheckerSelection } from '@/useCheckerSelection';
import { createOnlineRoom, joinOnlineRoom } from './api';

const PING_INTERVAL_MS = 25_000;

export type OnlineStatus = 'idle' | 'connecting' | 'lobby' | 'playing' | 'gameOver' | 'disconnected' | 'error';

export interface OnlineGame {
  status: OnlineStatus;
  error: string | null;
  session: RoomSession | null;
  room: RoomSummary | null;
  myPlayer: Player | null;
  view: BackgammonView | null;
  // Board controller surface (mirrors the local game).
  state: GameState | null;
  selectableFroms: number[];
  selectedFrom: number | null;
  targets: number[];
  // Lobby actions.
  hostRoom: () => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  setReady: (playerName?: string) => void;
  start: () => void;
  leave: () => void;
  // Game actions.
  autoRoll: boolean;
  setAutoRoll: (value: boolean) => void;
  /** We are the one who has yet to roll — what Roll and auto-roll both wait on. */
  canRoll: boolean;
  rollDice: () => void;
  clickPoint: (index: number) => void;
  playOnlyMove: (index: number) => void;
  targetsFrom: (from: number) => number[];
  selectFrom: (from: number | null) => void;
  moveChecker: (from: number, to: number) => void;
  clearSelection: () => void;
  double: () => void;
  respond: (accept: boolean) => void;
}

export const useOnlineGame = (): OnlineGame => {
  const [status, setStatusState] = useState<OnlineStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<RoomSession | null>(null);
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [myPlayer, setMyPlayer] = useState<Player | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [autoRoll, setAutoRoll] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const hostRef = useRef<BackgammonHost | null>(null);
  const sessionRef = useRef<RoomSession | null>(null);
  const isHostRef = useRef(false);
  const seatingRef = useRef<number[]>([]);
  const statusRef = useRef<OnlineStatus>('idle');
  const pingRef = useRef<number | null>(null);
  const intentionalCloseRef = useRef(false);

  const setStatus = useCallback((next: OnlineStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const sendRaw = useCallback((message: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }, []);

  const sendRelay = useCallback(
    (kind: 'move' | 'event' | 'view', payload: unknown) => sendRaw({ type: 'relay', kind, payload }),
    [sendRaw],
  );

  // Host: push the authoritative state to guests and keep the server's turn
  // pointer in sync so the next mover is allowed to relay.
  const broadcastState = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const state = host.getState();
    sendRelay('view', state);
    sendRaw({ type: 'setTurn', currentSeatIndex: host.currentSeatIndex() });
    sendRaw({ type: 'snapshot', payload: host.snapshot() });
    if (state.phase === 'gameOver' && state.result) {
      const winnerSeat = state.result.winner === 'white' ? seatingRef.current[0] : seatingRef.current[1];
      sendRaw({ type: 'endGame', winnerSeatIndex: winnerSeat ?? null });
      setStatus('gameOver');
    }
    setGameState(state);
  }, [sendRaw, sendRelay, setStatus]);

  const sendAction = useCallback(
    (action: BackgammonAction) => {
      if (isHostRef.current && hostRef.current && sessionRef.current) {
        try {
          hostRef.current.applyAction(sessionRef.current.seatIndex, action);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Invalid action');
          return;
        }
        broadcastState();
      } else {
        sendRelay('move', action);
      }
    },
    [broadcastState, sendRelay],
  );

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case 'presence': {
          setRoom(msg.room);
          if (statusRef.current === 'connecting') setStatus('lobby');
          return;
        }
        case 'gameStarted': {
          const seating = msg.activeSeatIndices;
          seatingRef.current = seating;
          const mySeat = sessionRef.current?.seatIndex ?? seating[0];
          setMyPlayer(seating.indexOf(mySeat) === 0 ? 'white' : 'black');
          if (isHostRef.current) {
            const parsed = backgammonGameConfigSchema.safeParse(msg.gameConfig);
            hostRef.current = new BackgammonHost({
              seating,
              startingSeatIndex: msg.currentSeatIndex,
              config: parsed.success ? parsed.data : undefined,
            });
            setStatus('playing');
            broadcastState();
          } else {
            setStatus('playing');
          }
          return;
        }
        case 'relayed': {
          if (msg.kind === 'move' && isHostRef.current && hostRef.current) {
            const parsed = backgammonActionSchema.safeParse(msg.payload);
            if (parsed.success) {
              try {
                hostRef.current.applyAction(msg.fromSeat, parsed.data);
                broadcastState();
              } catch {
                // Illegal relayed action — ignore; the guest's UI only offers legal ones.
              }
            }
          } else if (msg.kind === 'view' && !isHostRef.current) {
            // Everything off the wire is untrusted, the host's own frames
            // included: an unparseable one used to reach the board as a
            // `GameState` and blank the page. Dropping it leaves the last good
            // board on screen, and the next broadcast repairs it.
            const state = parseGameState(msg.payload);
            if (!state) {
              // Unless it does not: a host whose frames systematically fail to
              // parse — an incompatibility rather than a corrupt packet — sends
              // nothing but bad frames, and the board simply stops moving. That
              // silence is the worst version of this failure, so it leaves a
              // trace even though the recovery is to wait.
              console.warn('Dropped a relayed view that could not be parsed', msg.payload);
              return;
            }
            setGameState(state);
            setStatus(state.phase === 'gameOver' ? 'gameOver' : 'playing');
          }
          return;
        }
        case 'snapshotRestore': {
          // Taking over as host after a disconnect: the snapshot decides what
          // the game *is* from here on, so a bad one is worth refusing outright
          // rather than resuming from a board nobody can play.
          if (isHostRef.current && hostRef.current && msg.payload) {
            const snapshot = parseHostSnapshot(msg.payload);
            if (!snapshot) {
              setError('The game state could not be restored.');
              return;
            }
            try {
              hostRef.current.restore(snapshot);
            } catch (e) {
              // The schema above already rejects every snapshot the host itself
              // would refuse, so nothing is expected to land here. It is guarded
              // anyway because the alternative is invisible: an uncaught throw
              // unwinds into `ws.onmessage`'s catch and is read as a malformed
              // frame, leaving a game that has silently stopped advancing. If
              // the two ever drift apart, this is what says so.
              setError(e instanceof Error ? e.message : 'The game state could not be restored.');
              return;
            }
            broadcastState();
          }
          return;
        }
        case 'roomClosed': {
          setError('The room was closed.');
          setStatus('error');
          return;
        }
        case 'actionRejected': {
          setError(msg.reason);
          return;
        }
        case 'turn':
          // The relayed view is the source of truth for guests; nothing to do.
          return;
      }
    },
    [broadcastState, setStatus],
  );

  const connect = useCallback(
    (s: RoomSession) => {
      intentionalCloseRef.current = false;
      const ws = new WebSocket(s.wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        sendRaw({
          type: 'auth',
          protocolVersion: PROTOCOL_VERSION,
          roomCode: s.roomCode,
          seatIndex: s.seatIndex,
          seatToken: s.seatToken,
        });
        pingRef.current = window.setInterval(() => sendRaw({ type: 'ping' }), PING_INTERVAL_MS);
      };
      ws.onmessage = (event) => {
        try {
          handleMessage(JSON.parse(event.data as string) as ServerMessage);
        } catch {
          // Ignore malformed frames.
        }
      };
      ws.onclose = () => {
        if (pingRef.current !== null) window.clearInterval(pingRef.current);
        pingRef.current = null;
        if (!intentionalCloseRef.current) {
          setError('Connection lost.');
          setStatus('disconnected');
        }
      };
      ws.onerror = () => setError('Connection error.');
    },
    [handleMessage, sendRaw, setStatus],
  );

  const enterRoom = useCallback(
    async (factory: () => Promise<RoomSession>) => {
      setError(null);
      setStatus('connecting');
      try {
        const s = await factory();
        sessionRef.current = s;
        isHostRef.current = s.seatIndex === s.hostSeatIndex;
        setSession(s);
        connect(s);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to reach the server.');
        setStatus('error');
      }
    },
    [connect, setStatus],
  );

  const hostRoom = useCallback(() => enterRoom(() => createOnlineRoom({ useDoublingCube: true })), [enterRoom]);
  const joinRoom = useCallback((code: string) => enterRoom(() => joinOnlineRoom(code)), [enterRoom]);

  const setReady = useCallback((playerName?: string) => sendRaw({ type: 'setReady', playerName }), [sendRaw]);
  const start = useCallback(() => sendRaw({ type: 'startGame', clientVersion: PROTOCOL_VERSION }), [sendRaw]);
  const leave = useCallback(() => {
    intentionalCloseRef.current = true;
    sendRaw({ type: 'leaveLobby' });
    wsRef.current?.close();
    hostRef.current = null;
    setSession(null);
    sessionRef.current = null;
    setRoom(null);
    setGameState(null);
    setMyPlayer(null);
    setStatus('idle');
  }, [sendRaw, setStatus]);

  const view = useMemo<BackgammonView | null>(
    () => (gameState && myPlayer ? serializeView(gameState, myPlayer) : null),
    [gameState, myPlayer],
  );

  // A selection is only meaningful while it is our move, and an empty move list is
  // what makes every part of the selection below inert when it is not.
  const canSelect = (view?.yourTurn ?? false) && gameState?.phase === 'moving';
  const legalMoves = useMemo(() => (canSelect ? (view?.legalMoves ?? []) : []), [canSelect, view]);

  // The same selection the local game uses; only what playing a move *does*
  // differs. A guest never applies anything itself — it relays the move and waits
  // for the host's board to come back.
  const selection = useCheckerSelection(legalMoves, (move) =>
    sendAction({ type: 'move', from: move.from, to: move.to, die: move.die }),
  );

  // One definition of "on roll", for the button, the guard and auto-roll alike —
  // the button used to carry its own, which had already drifted from this one by
  // leaving out the status. Closing over the boolean rather than over
  // `view`/`gameState` also keeps `rollDice` stable across the broadcasts that
  // replace both objects without changing whose turn it is.
  const canRoll = status === 'playing' && (view?.yourTurn ?? false) && gameState?.phase === 'rolling';
  const rollDice = useCallback(() => {
    if (canRoll) sendAction({ type: 'roll' });
  }, [canRoll, sendAction]);

  useAutoRoll(autoRoll, canRoll, rollDice);

  const double = useCallback(() => {
    if (gameState && myPlayer && canDouble(gameState, myPlayer)) sendAction({ type: 'offerDouble' });
  }, [gameState, myPlayer, sendAction]);

  const respond = useCallback(
    (accept: boolean) => {
      if (gameState?.phase === 'doubleOffered' && myPlayer && gameState.doubleOfferedBy === opponent(myPlayer)) {
        sendAction({ type: 'respondDouble', accept });
      }
    },
    [gameState, myPlayer, sendAction],
  );

  // Tidy up the socket on unmount.
  useEffect(
    () => () => {
      intentionalCloseRef.current = true;
      if (pingRef.current !== null) window.clearInterval(pingRef.current);
      wsRef.current?.close();
    },
    [],
  );

  return {
    ...selection,
    status,
    error,
    session,
    room,
    myPlayer,
    view,
    state: gameState,
    hostRoom,
    joinRoom,
    setReady,
    start,
    leave,
    autoRoll,
    setAutoRoll,
    canRoll,
    rollDice,
    double,
    respond,
  };
};
