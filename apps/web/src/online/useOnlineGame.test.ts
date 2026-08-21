import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { RoomSession, RoomSummary, ServerMessage } from '@klbsjpolp/realtime-core';
import type { GameState } from '@backgammon/core';
import { createOnlineRoom, joinOnlineRoom } from './api';
import { useOnlineGame } from './useOnlineGame';

vi.mock('./api', () => ({
  createOnlineRoom: vi.fn(),
  joinOnlineRoom: vi.fn(),
}));

const createRoomMock = vi.mocked(createOnlineRoom);
const joinRoomMock = vi.mocked(joinOnlineRoom);

/**
 * Stand-in for the browser WebSocket: records what the hook sends and lets the
 * test push server frames back at it.
 */
class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readyState = 0;
  readonly sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close() {
    this.readyState = 3;
  }

  /** Complete the handshake the way the real socket would. */
  open() {
    this.readyState = FakeWebSocket.OPEN;
    act(() => this.onopen?.());
  }

  emit(message: ServerMessage) {
    act(() => this.onmessage?.({ data: JSON.stringify(message) }));
  }

  /** Every frame of a given type, oldest first. */
  sentOfType(type: string) {
    return this.sent.filter((m) => m.type === type);
  }
}

const socket = () => {
  const ws = FakeWebSocket.instances.at(-1);
  if (!ws) throw new Error('no socket was opened');
  return ws;
};

const session = (seatIndex: number, hostSeatIndex = 0): RoomSession => ({
  expiresAt: '2099-01-01T00:00:00.000Z',
  hostSeatIndex,
  roomCode: 'ABCD',
  seatCapacity: 2,
  seatIndex,
  seatToken: `token-${seatIndex}`,
  wsUrl: 'wss://relay.test/ws',
});

const roomSummary = (): RoomSummary => ({
  connectedSeats: [0, 1],
  currentSeatIndex: null,
  disconnectedSeats: [],
  expiresAt: '2099-01-01T00:00:00.000Z',
  hostSeatIndex: 0,
  lobbySeats: [
    { seatIndex: 0, readyState: 'ready', displayName: 'Host' },
    { seatIndex: 1, readyState: 'ready', displayName: 'Guest' },
  ],
  roomCode: 'ABCD',
  seatCapacity: 2,
  status: 'WAITING',
  version: 1,
});

const gameStarted = (currentSeatIndex = 0): ServerMessage => ({
  type: 'gameStarted',
  activeSeatIndices: [0, 1],
  currentSeatIndex,
  gameConfig: { useDoublingCube: true },
});

/** Drive a hook from `idle` all the way to `playing` on the given seat. */
const startGame = async (
  result: { current: ReturnType<typeof useOnlineGame> },
  seatIndex: number,
  currentSeatIndex = 0,
) => {
  await act(async () => {
    await result.current.hostRoom();
  });
  socket().open();
  socket().emit({ type: 'presence', room: roomSummary() });
  socket().emit(gameStarted(currentSeatIndex));
  await waitFor(() => expect(result.current.status).toBe('playing'));
  expect(result.current.session?.seatIndex).toBe(seatIndex);
};

describe('useOnlineGame', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    createRoomMock.mockResolvedValue(session(0));
    joinRoomMock.mockResolvedValue(session(1));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('starts idle with nothing connected', () => {
    const { result } = renderHook(() => useOnlineGame());
    expect(result.current.status).toBe('idle');
    expect(result.current.state).toBeNull();
    expect(result.current.myPlayer).toBeNull();
  });

  it('surfaces a failure to reach the server', async () => {
    createRoomMock.mockRejectedValue(new Error('Online play is not configured.'));
    const { result } = renderHook(() => useOnlineGame());

    await act(async () => {
      await result.current.hostRoom();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/not configured/);
  });

  it('authenticates on open and enters the lobby on presence', async () => {
    const { result } = renderHook(() => useOnlineGame());

    await act(async () => {
      await result.current.hostRoom();
    });
    expect(result.current.status).toBe('connecting');
    expect(socket().url).toBe('wss://relay.test/ws');

    socket().open();
    expect(socket().sentOfType('auth')[0]).toMatchObject({ roomCode: 'ABCD', seatIndex: 0, seatToken: 'token-0' });

    socket().emit({ type: 'presence', room: roomSummary() });
    expect(result.current.status).toBe('lobby');
    expect(result.current.room?.lobbySeats).toHaveLength(2);
  });

  it('seats the host as white and broadcasts the opening state', async () => {
    const { result } = renderHook(() => useOnlineGame());
    await startGame(result, 0);

    expect(result.current.myPlayer).toBe('white');
    const view = socket().sentOfType('relay').at(-1);
    expect(view).toMatchObject({ kind: 'view' });
    expect((view?.payload as GameState).phase).toBe('rolling');
    // The server's turn pointer is kept in lockstep with the game.
    expect(socket().sentOfType('setTurn').at(-1)).toMatchObject({ currentSeatIndex: 0 });
    expect(socket().sentOfType('snapshot')).toHaveLength(1);
  });

  it('rolls authoritatively as host and rebroadcasts', async () => {
    const { result } = renderHook(() => useOnlineGame());
    await startGame(result, 0);

    act(() => result.current.rollDice());

    await waitFor(() => expect(result.current.state?.phase).toBe('moving'));
    expect(result.current.view?.yourTurn).toBe(true);
    expect(result.current.selectableFroms.length).toBeGreaterThan(0);
    const view = socket().sentOfType('relay').at(-1);
    expect((view?.payload as GameState).roll).not.toBeNull();
  });

  it('applies a legal move relayed by the guest and hands the turn over', async () => {
    const { result } = renderHook(() => useOnlineGame());
    // The guest (seat 1, black) is on roll first.
    await startGame(result, 0, 1);
    expect(result.current.myPlayer).toBe('white');

    socket().emit({ type: 'relayed', fromSeat: 1, kind: 'move', payload: { type: 'roll' } });
    await waitFor(() => expect(result.current.state?.phase).toBe('moving'));
    expect(result.current.state?.turn).toBe('black');
    expect(socket().sentOfType('setTurn').at(-1)).toMatchObject({ currentSeatIndex: 1 });
  });

  it('ignores an illegal action relayed by a guest', async () => {
    const { result } = renderHook(() => useOnlineGame());
    await startGame(result, 0, 1);
    const before = result.current.state;

    // Seat 0 is not on roll, and the payload is malformed anyway.
    socket().emit({ type: 'relayed', fromSeat: 0, kind: 'move', payload: { type: 'roll' } });
    socket().emit({ type: 'relayed', fromSeat: 1, kind: 'move', payload: { type: 'nonsense' } });

    expect(result.current.state).toEqual(before);
  });

  it('refuses a snapshot it cannot parse rather than resuming from it', async () => {
    const { result } = renderHook(() => useOnlineGame());
    await startGame(result, 0);
    act(() => result.current.rollDice());
    await waitFor(() => expect(result.current.state?.phase).toBe('moving'));
    const before = result.current.state;

    socket().emit({ type: 'snapshotRestore', payload: { seating: [0, 1], state: { board: null } } });

    expect(result.current.state).toEqual(before);
    expect(result.current.error).toMatch(/could not be restored/i);
  });

  it('reports a snapshot the host refuses instead of swallowing the throw', async () => {
    const { result } = renderHook(() => useOnlineGame());
    await startGame(result, 0);
    const before = result.current.state;

    // A snapshot leaving seat 1 without a colour used to parse, then throw
    // inside `restore` — a throw that unwound into ws.onmessage's catch and
    // vanished, leaving the host with no seat map and every later action
    // failing with `unknown seat`. It is now refused before it gets there.
    socket().emit({
      type: 'snapshotRestore',
      payload: { state: before, seating: [0, 1], players: { 0: 'white' } },
    });

    expect(result.current.state).toEqual(before);
    expect(result.current.error).toMatch(/could not be restored/i);
    // Still the host it was: rolling has to keep working.
    act(() => result.current.rollDice());
    await waitFor(() => expect(result.current.state?.phase).toBe('moving'));
  });

  it('rebuilds from a snapshot restore', async () => {
    const { result } = renderHook(() => useOnlineGame());
    await startGame(result, 0);
    act(() => result.current.rollDice());
    await waitFor(() => expect(result.current.state?.phase).toBe('moving'));

    const snapshot = socket().sentOfType('snapshot').at(-1)?.payload;
    socket().emit({ type: 'snapshotRestore', payload: snapshot });

    expect(result.current.state?.phase).toBe('moving');
  });

  describe('as a guest', () => {
    const startAsGuest = async (result: { current: ReturnType<typeof useOnlineGame> }) => {
      await act(async () => {
        await result.current.joinRoom('ABCD');
      });
      socket().open();
      socket().emit({ type: 'presence', room: roomSummary() });
      socket().emit(gameStarted(1));
      await waitFor(() => expect(result.current.status).toBe('playing'));
    };

    it('plays black and waits for the host view rather than building state itself', async () => {
      const { result } = renderHook(() => useOnlineGame());
      await startAsGuest(result);

      expect(result.current.myPlayer).toBe('black');
      // A guest is authoritative over nothing: no view, turn or snapshot frames.
      expect(socket().sentOfType('setTurn')).toHaveLength(0);
      expect(socket().sentOfType('snapshot')).toHaveLength(0);
      expect(result.current.state).toBeNull();
    });

    it('renders the relayed view and sends intents rather than applying them', async () => {
      const { result } = renderHook(() => useOnlineGame());
      await startAsGuest(result);

      const { createInitialState, applyRoll } = await import('@backgammon/core');
      const moving = applyRoll(createInitialState('black'), [3, 1]);
      socket().emit({ type: 'relayed', fromSeat: 0, kind: 'view', payload: moving });

      await waitFor(() => expect(result.current.state?.phase).toBe('moving'));
      expect(result.current.view?.yourTurn).toBe(true);

      const from = result.current.selectableFroms[0];
      act(() => result.current.clickPoint(from));
      expect(result.current.selectedFrom).toBe(from);

      act(() => result.current.clickPoint(result.current.targets[0]));
      const relayed = socket().sentOfType('relay').at(-1);
      expect(relayed).toMatchObject({ kind: 'move' });
      expect(relayed?.payload).toMatchObject({ type: 'move', from });
      // The guest does not move its own board; it waits for the host's view.
      expect(result.current.state).toEqual(moving);
    });

    it('sends a point only move on its own, without a destination click', async () => {
      const { result } = renderHook(() => useOnlineGame());
      await startAsGuest(result);

      const { createInitialState, applyRoll } = await import('@backgammon/core');
      // 6-5: black's back checker can only run to its 18-point, the 5 being
      // blocked by white's midpoint.
      socket().emit({
        type: 'relayed',
        fromSeat: 0,
        kind: 'view',
        payload: applyRoll(createInitialState('black'), [6, 5]),
      });
      await waitFor(() => expect(result.current.state?.phase).toBe('moving'));

      act(() => result.current.playOnlyMove(0));

      expect(socket().sentOfType('relay').at(-1)?.payload).toMatchObject({ type: 'move', from: 0, to: 6, die: 6 });
    });

    it('sends nothing off a point with a choice, or when it is not our move', async () => {
      const { result } = renderHook(() => useOnlineGame());
      await startAsGuest(result);

      const { createInitialState, applyRoll } = await import('@backgammon/core');
      // White on roll: a guest whose turn it is not has no move to shortcut,
      // however few the point in front of them offers.
      socket().emit({
        type: 'relayed',
        fromSeat: 0,
        kind: 'view',
        payload: applyRoll(createInitialState('white'), [6, 5]),
      });
      await waitFor(() => expect(result.current.state?.phase).toBe('moving'));
      act(() => result.current.playOnlyMove(0));
      expect(socket().sentOfType('relay')).toHaveLength(0);

      socket().emit({
        type: 'relayed',
        fromSeat: 0,
        kind: 'view',
        payload: applyRoll(createInitialState('black'), [6, 5]),
      });
      await waitFor(() => expect(result.current.view?.yourTurn).toBe(true));

      // Black's midpoint can play either die, and picking one is picking the move.
      act(() => result.current.playOnlyMove(11));
      expect(socket().sentOfType('relay')).toHaveLength(0);
    });

    it('keeps the last good board when a relayed view is not one', async () => {
      const { result } = renderHook(() => useOnlineGame());
      await startAsGuest(result);

      const { createInitialState, applyRoll } = await import('@backgammon/core');
      const moving = applyRoll(createInitialState('black'), [3, 1]);
      socket().emit({ type: 'relayed', fromSeat: 0, kind: 'view', payload: moving });
      await waitFor(() => expect(result.current.state?.phase).toBe('moving'));

      // Each of these used to be rendered as a GameState, which took the page
      // down rather than the frame.
      socket().emit({ type: 'relayed', fromSeat: 0, kind: 'view', payload: null });
      socket().emit({ type: 'relayed', fromSeat: 0, kind: 'view', payload: { phase: 'moving' } });
      socket().emit({
        type: 'relayed',
        fromSeat: 0,
        kind: 'view',
        payload: { ...moving, board: { ...moving.board, points: [1, 2] } },
      });

      expect(result.current.state).toEqual(moving);
      expect(result.current.status).toBe('playing');
    });

    it('renders a view from a host running an older build', async () => {
      const { result } = renderHook(() => useOnlineGame());
      await startAsGuest(result);

      const { createInitialState, applyRoll } = await import('@backgammon/core');
      const moving = applyRoll(createInitialState('black'), [3, 1]);
      const legacy = JSON.parse(JSON.stringify(moving)) as Record<string, unknown>;
      delete legacy.noPlay; // what every build before `noPlay` serializes

      socket().emit({ type: 'relayed', fromSeat: 0, kind: 'view', payload: legacy });

      // Requiring the key would reject every frame that host sends and leave the
      // guest's board frozen for the rest of the game, with nothing said.
      await waitFor(() => expect(result.current.state?.phase).toBe('moving'));
      expect(result.current.state?.noPlay).toBeNull();
    });

    it('ends on the relayed game-over view', async () => {
      const { result } = renderHook(() => useOnlineGame());
      await startAsGuest(result);

      const { createInitialState } = await import('@backgammon/core');
      const finished: GameState = {
        ...createInitialState('black'),
        phase: 'gameOver',
        result: { winner: 'black', kind: 'single', points: 1, cubeValue: 1 },
      };
      socket().emit({ type: 'relayed', fromSeat: 0, kind: 'view', payload: finished });

      await waitFor(() => expect(result.current.status).toBe('gameOver'));
    });
  });

  it('reports a dropped connection', async () => {
    const { result } = renderHook(() => useOnlineGame());
    await startGame(result, 0);

    act(() => socket().onclose?.());

    expect(result.current.status).toBe('disconnected');
    expect(result.current.error).toMatch(/lost/i);
  });

  it('reports a closed room and a rejected action', async () => {
    const { result } = renderHook(() => useOnlineGame());
    await startGame(result, 0);

    socket().emit({ type: 'actionRejected', code: 'not_your_turn', reason: 'not your turn' });
    expect(result.current.error).toBe('not your turn');

    socket().emit({ type: 'roomClosed', roomCode: 'ABCD', status: 'FINISHED' });
    expect(result.current.status).toBe('error');
  });

  it('tears everything down on leave without reporting a lost connection', async () => {
    const { result } = renderHook(() => useOnlineGame());
    await startGame(result, 0);

    act(() => result.current.leave());
    act(() => socket().onclose?.());

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.state).toBeNull();
    expect(socket().sentOfType('leaveLobby')).toHaveLength(1);
  });

  it('ignores malformed server frames', async () => {
    const { result } = renderHook(() => useOnlineGame());
    await startGame(result, 0);

    act(() => socket().onmessage?.({ data: 'not json' }));
    expect(result.current.status).toBe('playing');
  });
});
