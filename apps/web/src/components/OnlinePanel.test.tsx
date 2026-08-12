import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createInitialState, applyRoll, type GameState } from '@backgammon/core';
import type { OnlineGame } from '@/online/useOnlineGame';
import { useOnlineGame } from '@/online/useOnlineGame';
import { OnlinePanel } from './OnlinePanel';

vi.mock('@/online/useOnlineGame', () => ({ useOnlineGame: vi.fn() }));

const useOnlineGameMock = vi.mocked(useOnlineGame);

const baseGame = (): OnlineGame => ({
  status: 'idle',
  error: null,
  session: null,
  room: null,
  myPlayer: null,
  view: null,
  state: null,
  selectableFroms: [],
  selectedFrom: null,
  targets: [],
  hostRoom: vi.fn().mockResolvedValue(undefined),
  joinRoom: vi.fn().mockResolvedValue(undefined),
  setReady: vi.fn(),
  start: vi.fn(),
  leave: vi.fn(),
  rollDice: vi.fn(),
  clickPoint: vi.fn(),
  double: vi.fn(),
  respond: vi.fn(),
});

const renderPanel = (overrides: Partial<OnlineGame> = {}) => {
  const game = { ...baseGame(), ...overrides };
  useOnlineGameMock.mockReturnValue(game);
  render(<OnlinePanel />);
  return game;
};

const session = (seatIndex: number, hostSeatIndex = 0) => ({
  expiresAt: '2099-01-01T00:00:00.000Z',
  hostSeatIndex,
  roomCode: 'ABCD',
  seatCapacity: 2,
  seatIndex,
  seatToken: 'token',
  wsUrl: 'wss://relay.test/ws',
});

const room = (readyStates: ('ready' | 'never-ready')[]) => ({
  connectedSeats: [0, 1],
  currentSeatIndex: null,
  disconnectedSeats: [],
  expiresAt: '2099-01-01T00:00:00.000Z',
  hostSeatIndex: 0,
  lobbySeats: readyStates.map((readyState, seatIndex) => ({ seatIndex, readyState, displayName: null })),
  roomCode: 'ABCD',
  seatCapacity: 2,
  status: 'WAITING' as const,
  version: 1,
});

const playing = (overrides: Partial<OnlineGame> = {}): Partial<OnlineGame> => ({
  status: 'playing',
  session: session(1),
  myPlayer: 'black',
  state: createInitialState('black'),
  view: { state: createInitialState('black'), you: 'black', yourTurn: true, legalMoves: [] },
  ...overrides,
});

beforeEach(() => {
  useOnlineGameMock.mockReset();
});

describe('OnlinePanel', () => {
  describe('before a room exists', () => {
    it('offers hosting and joining, and blocks an empty code', () => {
      const game = renderPanel();

      const join = screen.getByRole<HTMLButtonElement>('button', { name: /^join$/i });
      expect(join.disabled).toBe(true);

      fireEvent.change(screen.getByLabelText(/room code/i), { target: { value: 'abcd' } });
      expect(join.disabled).toBe(false);
      fireEvent.click(join);
      expect(game.joinRoom).toHaveBeenCalledWith('ABCD');

      fireEvent.click(screen.getByRole('button', { name: /host a new game/i }));
      expect(game.hostRoom).toHaveBeenCalled();
    });

    it('shows the error from a failed attempt', () => {
      renderPanel({ status: 'error', error: 'Online play is not configured.' });
      expect(screen.getByText(/not configured/i)).toBeDefined();
    });

    it('shows a connecting notice', () => {
      renderPanel({ status: 'connecting' });
      expect(screen.getByText(/connecting/i)).toBeDefined();
    });
  });

  describe('lobby', () => {
    it('shows the room code and seats, and gates start on the host with two ready seats', () => {
      const game = renderPanel({ status: 'lobby', session: session(0), room: room(['ready', 'never-ready']) });

      expect(screen.getByText('ABCD')).toBeDefined();
      expect(screen.getByText(/seat 0 \(you\)/i)).toBeDefined();
      const start = screen.getByRole<HTMLButtonElement>('button', { name: /start game/i });
      expect(start.disabled).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: /ready/i }));
      expect(game.setReady).toHaveBeenCalled();
    });

    it('enables start once both seats are ready', () => {
      renderPanel({ status: 'lobby', session: session(0), room: room(['ready', 'ready']) });
      expect(screen.getByRole<HTMLButtonElement>('button', { name: /start game/i }).disabled).toBe(false);
    });

    it('does not offer start to a guest', () => {
      renderPanel({ status: 'lobby', session: session(1), room: room(['ready', 'ready']) });
      expect(screen.queryByRole('button', { name: /start game/i })).toBeNull();
    });
  });

  describe('in game', () => {
    it('waits for the host before there is any state to draw', () => {
      renderPanel({ status: 'playing', session: session(1) });
      expect(screen.getByText(/waiting for the host/i)).toBeDefined();
    });

    it('draws the board from the seat point of view', () => {
      renderPanel(playing());
      expect(screen.getByText(/you play black/i)).toBeDefined();
      const points = screen.getAllByLabelText(/^point \d+,/);
      expect(points).toHaveLength(24);
      // Black's home board is drawn bottom-right, next to its own tray, and it
      // is black's tray — not white's — that this seat can bear off onto.
      expect(points.at(-1)?.dataset.point).toBe('23');
      expect(screen.getByRole<HTMLButtonElement>('button', { name: /black off/i }).disabled).toBe(false);
      expect(screen.getByRole<HTMLButtonElement>('button', { name: /white off/i }).disabled).toBe(true);
    });

    it('enables roll on your turn', () => {
      const game = renderPanel(playing());
      fireEvent.click(screen.getByRole('button', { name: /^roll$/i }));
      expect(game.rollDice).toHaveBeenCalled();
    });

    it('disables roll while the opponent is on roll', () => {
      const notYours = createInitialState('white');
      renderPanel(
        playing({ state: notYours, view: { state: notYours, you: 'black', yourTurn: false, legalMoves: [] } }),
      );
      expect(screen.getByRole<HTMLButtonElement>('button', { name: /^roll$/i }).disabled).toBe(true);
    });

    it('enables double when the cube is centred and it is your roll', () => {
      const game = renderPanel(playing());
      fireEvent.click(screen.getByRole('button', { name: /^double$/i }));
      expect(game.double).toHaveBeenCalled();
    });

    it('disables double when the opponent owns the cube', () => {
      const owned: GameState = { ...createInitialState('black'), cube: { value: 2, owner: 'white' } };
      renderPanel(playing({ state: owned, view: { state: owned, you: 'black', yourTurn: true, legalMoves: [] } }));
      expect(screen.getByRole<HTMLButtonElement>('button', { name: /^double$/i }).disabled).toBe(true);
    });

    it('cannot double in the middle of a move', () => {
      const moving = applyRoll(createInitialState('black'), [3, 1]);
      renderPanel(playing({ state: moving, view: { state: moving, you: 'black', yourTurn: true, legalMoves: [] } }));
      expect(screen.getByRole<HTMLButtonElement>('button', { name: /^double$/i }).disabled).toBe(true);
    });

    it('offers take and drop only to the seat the double was aimed at', () => {
      const offered: GameState = { ...createInitialState('black'), phase: 'doubleOffered', doubleOfferedBy: 'white' };
      const game = renderPanel(
        playing({ state: offered, view: { state: offered, you: 'black', yourTurn: false, legalMoves: [] } }),
      );

      fireEvent.click(screen.getByRole('button', { name: /take/i }));
      expect(game.respond).toHaveBeenCalledWith(true);
      fireEvent.click(screen.getByRole('button', { name: /drop/i }));
      expect(game.respond).toHaveBeenCalledWith(false);
    });

    it('hides take and drop from the seat that offered the double', () => {
      const offered: GameState = { ...createInitialState('black'), phase: 'doubleOffered', doubleOfferedBy: 'black' };
      renderPanel(playing({ state: offered, view: { state: offered, you: 'black', yourTurn: false, legalMoves: [] } }));
      expect(screen.queryByRole('button', { name: /take/i })).toBeNull();
    });

    it('announces the result from the seat point of view', () => {
      const won: GameState = {
        ...createInitialState('black'),
        phase: 'gameOver',
        result: { winner: 'black', kind: 'gammon', points: 4, cubeValue: 2 },
      };
      renderPanel({
        ...playing({ state: won, view: { state: won, you: 'black', yourTurn: false, legalMoves: [] } }),
        status: 'gameOver',
      });
      expect(screen.getByText(/you win a gammon — 4 points/i, { ignore: '.sr-only' })).toBeDefined();
    });

    it('warns when the connection drops mid-game', () => {
      renderPanel(playing({ status: 'disconnected', error: 'Connection lost.' }));
      expect(screen.getAllByText(/connection lost/i).length).toBeGreaterThan(0);
    });

    it('leaves the room only once the tap is confirmed', () => {
      const game = renderPanel(playing());
      const leave = () => screen.getByRole('button', { name: /leave/i });

      fireEvent.click(leave());
      expect(game.leave).not.toHaveBeenCalled();

      fireEvent.click(leave());
      expect(game.leave).toHaveBeenCalled();
    });
  });
});
