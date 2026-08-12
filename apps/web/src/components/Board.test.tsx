import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createInitialState, OFF, type GameState, type Player } from '@backgammon/core';
import { Board, type BoardController } from './Board';

const bearingOffState = (turn: Player): GameState => {
  const points = new Array<number>(24).fill(0);
  // Both sides down to their last checkers, each in its own home board.
  points[2] = 3; // white home is 0..5
  points[21] = -3; // black home is 18..23
  return {
    ...createInitialState(turn),
    board: { points, bar: { white: 0, black: 0 }, off: { white: 12, black: 12 } },
    phase: 'moving',
    roll: [6, 5],
    remaining: [6, 5],
  };
};

const controllerFor = (you: Player, overrides: Partial<BoardController> = {}): BoardController => ({
  state: bearingOffState(you),
  you,
  selectableFroms: [you === 'white' ? 2 : 21],
  selectedFrom: you === 'white' ? 2 : 21,
  targets: [OFF],
  clickPoint: vi.fn(),
  ...overrides,
});

/** Point indices in DOM order — the board reads left-to-right, top row then bottom. */
const renderedPoints = () => screen.getAllByLabelText(/^point \d+$/).map((el) => Number(el.dataset.point));

describe('Board', () => {
  it('renders all 24 points for either side', () => {
    render(<Board controller={controllerFor('white')} />);
    expect(renderedPoints()).toHaveLength(24);
  });

  it('puts each player home board in the bottom-right, next to their tray', () => {
    const { unmount } = render(<Board controller={controllerFor('white')} />);
    // White bears off past index 0, so its ace point is the last one drawn.
    expect(renderedPoints().at(-1)).toBe(0);
    unmount();

    render(<Board controller={controllerFor('black')} />);
    // Black is the mirror: it bears off past index 23.
    expect(renderedPoints().at(-1)).toBe(23);
  });

  it('lets white bear off by clicking its own tray', () => {
    const clickPoint = vi.fn();
    render(<Board controller={controllerFor('white', { clickPoint })} />);

    fireEvent.click(screen.getByRole('button', { name: /white off/i }));
    expect(clickPoint).toHaveBeenCalledWith(OFF);
  });

  it('lets black bear off by clicking its own tray', () => {
    const clickPoint = vi.fn();
    render(<Board controller={controllerFor('black', { clickPoint })} />);

    fireEvent.click(screen.getByRole('button', { name: /black off/i }));
    expect(clickPoint).toHaveBeenCalledWith(OFF);
  });

  it('leaves the opponent tray inert', () => {
    const clickPoint = vi.fn();
    render(<Board controller={controllerFor('black', { clickPoint })} />);

    const opponentTray = screen.getByRole<HTMLButtonElement>('button', { name: /white off/i });
    expect(opponentTray.disabled).toBe(true);
    fireEvent.click(opponentTray);
    expect(clickPoint).not.toHaveBeenCalled();
  });

  it('shows the bar and forwards clicks on it', () => {
    const clickPoint = vi.fn();
    const state = bearingOffState('black');
    render(
      <Board
        controller={controllerFor('black', {
          clickPoint,
          state: { ...state, board: { ...state.board, bar: { white: 1, black: 2 } } },
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText('bar'));
    expect(clickPoint).toHaveBeenCalledWith(-1); // BAR
  });

  it('sizes the overflow count on a stacked point', () => {
    const state = bearingOffState('white');
    const points = [...state.board.points];
    points[2] = 8; // more than the five checkers a point draws, so the count shows
    render(<Board controller={controllerFor('white', { state: { ...state, board: { ...state.board, points } } })} />);

    // The size has to survive `cn()` — merged next to the checker's text colour it
    // was being classified as a colour and dropped, leaving the count at body size.
    const count = within(screen.getByLabelText('point 2')).getByText('8');
    expect(count.closest('div')?.className).toMatch(/text-board-checker/);
  });

  it('falls back to drawing the dice itself when there is no header slot', () => {
    render(<Board controller={controllerFor('white')} />);
    // With a slot (the app) they are portalled into the header instead — see
    // `Dice.test.tsx` for what they say. Here the board keeps them.
    const dice = within(screen.getByLabelText('dice'));
    expect(dice.getByText('⚅')).toBeDefined();
    expect(dice.getByText('⚄')).toBeDefined();
  });
});
