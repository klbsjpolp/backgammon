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
  canHumanDouble: true,
  doubleToYou: false,
  newGame: vi.fn(),
  rollDice: vi.fn(),
  clickPoint: vi.fn(),
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
    expect(screen.getByText(/white to roll \(you\)/i)).toBeDefined();
    expect(screen.getByText(/cube ×1 · pips W 167 \/ B 167/)).toBeDefined();
  });

  it('marks the AI turn', () => {
    renderPanel({ state: createInitialState('black'), isHumanTurn: false });
    expect(screen.getByText(/black to roll \(AI\)/i)).toBeDefined();
  });

  it('rolls and starts a new game on demand', () => {
    const game = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /^roll$/i }));
    expect(game.rollDice).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /new game/i }));
    expect(game.newGame).toHaveBeenCalled();
  });

  it('disables roll when it is not your turn', () => {
    renderPanel({ state: createInitialState('black'), isHumanTurn: false });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /^roll$/i }).disabled).toBe(true);
  });

  it('disables double when the cube is not yours to turn', () => {
    renderPanel({ canHumanDouble: false });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /^double$/i }).disabled).toBe(true);
  });

  it('offers take and drop when the AI doubles, and reports the stake', () => {
    const offered: GameState = {
      ...createInitialState('black'),
      phase: 'doubleOffered',
      doubleOfferedBy: 'black',
      cube: { value: 2, owner: 'black' },
    };
    const game = renderPanel({ state: offered, doubleToYou: true, isHumanTurn: false });

    expect(screen.getByText(/AI offers a double — take at ×4 or drop/i)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /take/i }));
    expect(game.respond).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: /drop/i }));
    expect(game.respond).toHaveBeenCalledWith(false);
  });

  it('does not offer take and drop for your own double', () => {
    const offered: GameState = { ...createInitialState('white'), phase: 'doubleOffered', doubleOfferedBy: 'white' };
    renderPanel({ state: offered, doubleToYou: false });

    expect(screen.getByText(/white offers a double/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /take/i })).toBeNull();
  });

  it('hides the clear-selection button while no checker is picked up', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: /clear selection/i })).toBeNull();
  });

  it('clears a held selection', () => {
    const game = renderPanel({ selectedFrom: 23 });
    fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));
    expect(game.clearSelection).toHaveBeenCalled();
  });

  it('announces the final result', () => {
    const won: GameState = {
      ...createInitialState('white'),
      phase: 'gameOver',
      result: { winner: 'white', kind: 'backgammon', points: 3, cubeValue: 1 },
    };
    renderPanel({ state: won });
    expect(screen.getByText(/white wins a backgammon — 3 points/i)).toBeDefined();
  });
});
