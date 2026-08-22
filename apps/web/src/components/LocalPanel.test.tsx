import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createInitialState, type GameState } from '@backgammon/core';
import type { LocalGame } from '@/useLocalGame';
import { useLocalGame } from '@/useLocalGame';
import { LocalPanel } from './LocalPanel';

vi.mock('@/useLocalGame', () => ({ useLocalGame: vi.fn() }));

const useLocalGameMock = vi.mocked(useLocalGame);

const baseGame = (): LocalGame => ({
  state: createInitialState('white'),
  you: 'white',
  legalMoves: [],
  selectableFroms: [],
  selectedFrom: null,
  targets: [],
  isHumanTurn: true,
  canRoll: true,
  canHumanDouble: true,
  doubleToYou: false,
  autoRoll: false,
  setAutoRoll: vi.fn(),
  newGame: vi.fn(),
  rollDice: vi.fn(),
  clickPoint: vi.fn(),
  playOnlyMove: vi.fn(),
  targetsFrom: () => [],
  selectFrom: vi.fn(),
  moveChecker: vi.fn(),
  clearSelection: vi.fn(),
  double: vi.fn(),
  respond: vi.fn(),
});

const renderPanel = (overrides: Partial<LocalGame> = {}) => {
  const game = { ...baseGame(), ...overrides };
  useLocalGameMock.mockReturnValue(game);
  render(<LocalPanel />);
  return game;
};

beforeEach(() => {
  useLocalGameMock.mockReset();
});

describe('LocalPanel', () => {
  it('shows whose turn it is and the running cube and pip counts', () => {
    renderPanel();
    expect(screen.getByText(/blanc doit lancer \(vous\)/i, { ignore: '.sr-only' })).toBeDefined();
    expect(screen.getByText(/videau ×1 · pips B 167 \/ N 167/)).toBeDefined();
  });

  it('marks the AI turn', () => {
    renderPanel({ state: createInitialState('black'), isHumanTurn: false });
    expect(screen.getByText(/noir doit lancer \(IA\)/i, { ignore: '.sr-only' })).toBeDefined();
  });

  it('rolls on demand', () => {
    const game = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /^lancer$/i }));
    expect(game.rollDice).toHaveBeenCalled();
  });

  it('draws the roll in the same block as the buttons, not up in the page header', () => {
    renderPanel({ state: { ...createInitialState('white'), phase: 'moving', roll: [6, 5], remaining: [6, 5] } });
    // Roll sits in a row of that block, so its grandparent is the block itself.
    // Being one container is the point: it is what lets CSS put the dice beside
    // Roll, under it or above it per layout without a copy per breakpoint.
    const controls = screen.getByRole('button', { name: /^lancer$/i }).parentElement?.parentElement;
    expect(controls?.contains(screen.getByLabelText('dés'))).toBe(true);
  });

  it('starts a new game only after the tap is confirmed', () => {
    const game = renderPanel();
    const newGame = () => screen.getByRole('button', { name: /nouvelle partie/i });

    // A single (possibly stray) tap only arms the button.
    fireEvent.click(newGame());
    expect(game.newGame).not.toHaveBeenCalled();
    expect(newGame().textContent).toMatch(/recommencer \?/i);

    fireEvent.click(newGame());
    expect(game.newGame).toHaveBeenCalled();
    expect(newGame().textContent).toMatch(/nouvelle partie/i);
  });

  it('starts a new game on the first tap once the game is over', () => {
    const over: GameState = {
      ...createInitialState('white'),
      phase: 'gameOver',
      result: { winner: 'white', kind: 'single', points: 1, cubeValue: 1 },
    };
    const game = renderPanel({ state: over });

    // Nothing is left to protect, so there is nothing to confirm.
    fireEvent.click(screen.getByRole('button', { name: /nouvelle partie/i }));
    expect(game.newGame).toHaveBeenCalled();
  });

  it('disables roll when it is not your turn', () => {
    renderPanel({ state: createInitialState('black'), isHumanTurn: false, canRoll: false });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /^lancer$/i }).disabled).toBe(true);
  });

  it('disables double when the cube is not yours to turn', () => {
    renderPanel({ canHumanDouble: false });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /^doubler$/i }).disabled).toBe(true);
  });

  it('offers take and drop when the AI doubles, and reports the stake', () => {
    const offered: GameState = {
      ...createInitialState('black'),
      phase: 'doubleOffered',
      doubleOfferedBy: 'black',
      cube: { value: 2, owner: 'black' },
    };
    const game = renderPanel({ state: offered, doubleToYou: true, isHumanTurn: false });

    expect(
      screen.getByText(/IA propose un doublement — prenez à ×4 ou refusez/i, { ignore: '.sr-only' }),
    ).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /prendre/i }));
    expect(game.respond).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: /refuser/i }));
    expect(game.respond).toHaveBeenCalledWith(false);
  });

  it('does not offer take and drop for your own double', () => {
    const offered: GameState = { ...createInitialState('white'), phase: 'doubleOffered', doubleOfferedBy: 'white' };
    renderPanel({ state: offered, doubleToYou: false });

    // Your own offer: named as yours, and without the stake — you are not the
    // one deciding about it.
    expect(screen.getByText(/vous proposez un doublement$/i, { ignore: '.sr-only' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /prendre/i })).toBeNull();
  });

  it('hides the clear-selection button while no checker is picked up', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: /^annuler/i })).toBeNull();
  });

  it('clears a held selection', () => {
    const game = renderPanel({ selectedFrom: 23 });
    fireEvent.click(screen.getByRole('button', { name: /^annuler/i }));
    expect(game.clearSelection).toHaveBeenCalled();
  });

  it('announces the final result', () => {
    const won: GameState = {
      ...createInitialState('white'),
      phase: 'gameOver',
      result: { winner: 'white', kind: 'backgammon', points: 3, cubeValue: 1 },
    };
    renderPanel({ state: won });
    // You are white, so the result is addressed to you rather than narrated.
    expect(screen.getByText(/vous gagnez un backgammon — 3 points/i, { ignore: '.sr-only' })).toBeDefined();
  });
});

describe('LocalPanel — a roll nobody could play', () => {
  const withNoPlay = (player: 'white' | 'black'): GameState => ({
    ...createInitialState(player === 'white' ? 'black' : 'white'),
    noPlay: { player, roll: [6, 5] },
  });

  it('says what the AI rolled when it could not move', () => {
    renderPanel({ state: withNoPlay('black'), isHumanTurn: true });
    // The turn passed straight back, so this is the only trace of the roll.
    expect(screen.getByText(/IA a fait 6-5 et n'a pas pu jouer/i, { ignore: '.sr-only' })).toBeDefined();
  });

  it('says so about your own roll too', () => {
    renderPanel({ state: withNoPlay('white'), isHumanTurn: false });
    expect(screen.getByText(/vous avez fait 6-5 et n'avez pas pu jouer/i, { ignore: '.sr-only' })).toBeDefined();
  });

  it('says nothing when the last roll was playable', () => {
    renderPanel();
    expect(screen.queryByText(/n'a pas pu jouer/i, { ignore: '.sr-only' })).toBeNull();
  });
});
