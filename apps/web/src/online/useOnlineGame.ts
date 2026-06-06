import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PROTOCOL_VERSION, type RoomSession, type RoomSummary, type ServerMessage } from '@klbsjpolp/realtime-core';
import {
  BackgammonHost,
  backgammonActionSchema,
  backgammonGameConfigSchema,
  serializeView,
  type BackgammonAction,
  type BackgammonView,
  type HostSnapshot,
} from '@backgammon/runtime';
import { canDouble, opponent, type GameState, type Player } from '@backgammon/core';
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
  rollDice: () => void;
  clickPoint: (index: number) => void;
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
  const [selectedFrom, setSelectedFrom] = useState<number | null>(null);

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
      setSelectedFrom(null);
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
            const state = msg.payload as GameState;
            setGameState(state);
            setStatus(state.phase === 'gameOver' ? 'gameOver' : 'playing');
          }
          return;
        }
        case 'snapshotRestore': {
          if (isHostRef.current && hostRef.current && msg.payload) {
            hostRef.current.restore(msg.payload as HostSnapshot);
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

  // A selection is only meaningful while it is our move; otherwise treat it as
  // cleared (this also drops any stale selection without a setState-in-effect).
  const canSelect = (view?.yourTurn ?? false) && gameState?.phase === 'moving';
  const selected = canSelect ? selectedFrom : null;

  const selectableFroms = useMemo(() => [...new Set((view?.legalMoves ?? []).map((m) => m.from))], [view]);
  const targets = useMemo(
    () => (selected === null ? [] : (view?.legalMoves ?? []).filter((m) => m.from === selected).map((m) => m.to)),
    [view, selected],
  );

  const rollDice = useCallback(() => {
    if (view?.yourTurn && gameState?.phase === 'rolling') sendAction({ type: 'roll' });
  }, [view, gameState, sendAction]);

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

  const clickPoint = useCallback(
    (index: number) => {
      if (!canSelect || !view) return;
      if (selected === null) {
        if (selectableFroms.includes(index)) setSelectedFrom(index);
        return;
      }
      const move = view.legalMoves.find((m) => m.from === selected && m.to === index);
      if (move) {
        sendAction({ type: 'move', from: move.from, to: move.to, die: move.die });
        return;
      }
      setSelectedFrom(selectableFroms.includes(index) ? index : null);
    },
    [canSelect, view, selected, selectableFroms, sendAction],
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
    status,
    error,
    session,
    room,
    myPlayer,
    view,
    state: gameState,
    selectableFroms,
    selectedFrom: selected,
    targets,
    hostRoom,
    joinRoom,
    setReady,
    start,
    leave,
    rollDice,
    clickPoint,
    double,
    respond,
  };
};
