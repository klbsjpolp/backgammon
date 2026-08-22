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
  playOnlyMove: vi.fn(),
  targetsFrom: () => [OFF],
  selectFrom: vi.fn(),
  moveChecker: vi.fn(),
  ...overrides,
});

/** Point indices in DOM order — the board reads left-to-right, top row then bottom. */
const renderedPoints = () =>
  screen.getAllByLabelText(/^flèche \d+,/).map((el) => Number((el as HTMLElement).dataset.point));

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

    fireEvent.click(screen.getByRole('button', { name: /blancs sortis/i }));
    expect(clickPoint).toHaveBeenCalledWith(OFF);
  });

  it('lets black bear off by clicking its own tray', () => {
    const clickPoint = vi.fn();
    render(<Board controller={controllerFor('black', { clickPoint })} />);

    fireEvent.click(screen.getByRole('button', { name: /noirs sortis/i }));
    expect(clickPoint).toHaveBeenCalledWith(OFF);
  });

  it('leaves the opponent tray inert', () => {
    const clickPoint = vi.fn();
    render(<Board controller={controllerFor('black', { clickPoint })} />);

    const opponentTray = screen.getByRole<HTMLButtonElement>('button', { name: /blancs sortis/i });
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

    fireEvent.click(screen.getByLabelText(/^barre,/));
    expect(clickPoint).toHaveBeenCalledWith(-1); // BAR
  });

  it('plays a point only move on a double click', () => {
    const playOnlyMove = vi.fn();
    render(<Board controller={controllerFor('white', { playOnlyMove })} />);

    const point = screen.getByLabelText(/^flèche 3,/);
    // The clicks a double click is made of arrive first, and select as they always do.
    fireEvent.click(point);
    fireEvent.click(point);
    fireEvent.dblClick(point);

    expect(playOnlyMove).toHaveBeenCalledWith(2);
  });

  it('takes a double click on the bar the same way', () => {
    const playOnlyMove = vi.fn();
    const state = bearingOffState('white');
    render(
      <Board
        controller={controllerFor('white', {
          playOnlyMove,
          state: { ...state, board: { ...state.board, bar: { white: 1, black: 0 } } },
        })}
      />,
    );

    const bar = screen.getByLabelText(/^barre,/);
    fireEvent.click(bar);
    fireEvent.click(bar);
    fireEvent.dblClick(bar);

    expect(playOnlyMove).toHaveBeenCalledWith(-1); // BAR
  });

  it('ignores a double click whose first click already moved a checker', () => {
    const playOnlyMove = vi.fn();
    const state = bearingOffState('white');
    const { rerender } = render(<Board controller={controllerFor('white', { playOnlyMove, state })} />);

    // Clicking a source and then double-clicking the destination: the first of
    // those two clicks lands the checker, and the shortcut must not spend a
    // second die on it.
    fireEvent.click(screen.getByLabelText(/^flèche 3,/));
    const landed = { ...state, board: { ...state.board, points: state.board.points.map((c, i) => (i === 2 ? 4 : c)) } };
    rerender(<Board controller={controllerFor('white', { playOnlyMove, state: landed })} />);
    fireEvent.click(screen.getByLabelText(/^flèche 3,/));
    fireEvent.dblClick(screen.getByLabelText(/^flèche 3,/));

    expect(playOnlyMove).not.toHaveBeenCalled();
  });

  it('sizes the overflow count on a stacked point', () => {
    const state = bearingOffState('white');
    const points = [...state.board.points];
    points[2] = 8; // more than the five checkers a point draws, so the count shows
    render(<Board controller={controllerFor('white', { state: { ...state, board: { ...state.board, points } } })} />);

    // The size has to survive `cn()` — merged next to the checker's text colour it
    // was being classified as a colour and dropped, leaving the count at body size.
    const count = within(screen.getByLabelText(/^flèche 3,/)).getByText('8');
    expect(count.closest('div')?.className).toMatch(/text-board-checker/);
  });

  it('marks how deep a stack is, so the overlap does not have to be counted in CSS', () => {
    const state = bearingOffState('white');
    const points = [...state.board.points];
    points[2] = 2;
    points[4] = 5;
    points[5] = 9; // deeper than five, which is as deep as the stack is ever drawn
    render(<Board controller={controllerFor('white', { state: { ...state, board: { ...state.board, points } } })} />);

    const depthOn = (point: number) =>
      screen
        .getByLabelText(new RegExp(`^flèche ${point},`))
        .querySelector('.board-stack')
        ?.getAttribute('data-stack');

    // Counting the children in CSS instead (`:has(> :nth-child(5))`) is what let
    // a growing stack keep the flat spacing and spill past its point on WebKit
    // until a rotation forced a recalc.
    expect(depthOn(3)).toBe('2');
    expect(depthOn(5)).toBe('5');
    expect(depthOn(6)).toBe('5');
  });
});

describe('Board — what it says out loud', () => {
  it('numbers the points the way the player counts them, from either side', () => {
    // The engine's array index is 0..23 in white's direction; a player counts
    // 1..24 from their own home, so the two sides disagree on every point.
    const { unmount } = render(<Board controller={controllerFor('white')} />);
    // White's ace point is index 0 — the one it bears off from.
    expect(screen.getByLabelText(/^flèche 1,/).dataset.point).toBe('0');
    expect(screen.getByLabelText(/^flèche 24,/).dataset.point).toBe('23');
    unmount();

    render(<Board controller={controllerFor('black')} />);
    // Black bears off past index 23, so that is *its* ace point.
    expect(screen.getByLabelText(/^flèche 1,/).dataset.point).toBe('23');
    expect(screen.getByLabelText(/^flèche 24,/).dataset.point).toBe('0');
  });

  it('reads out who is standing on a point and how many', () => {
    render(<Board controller={controllerFor('white')} />);
    expect(screen.getByLabelText(/^flèche 3, 3 pions blancs/)).toBeDefined();
    expect(screen.getByLabelText(/^flèche 22, 3 pions noirs/)).toBeDefined();
    expect(screen.getByLabelText(/^flèche 2, vide/)).toBeDefined();
  });

  it('says which points are in play and leaves the rest out of the tab order', () => {
    render(<Board controller={controllerFor('white')} />);

    const held = screen.getByLabelText(/^flèche 3, .*vous tenez le pion à déplacer/);
    expect(held.getAttribute('aria-pressed')).toBe('true');
    expect(held.getAttribute('tabindex')).toBeNull();

    // An empty point is still readable, but tabbing past 24 of them to reach the
    // two you can play is not a keyboard story.
    const idle = screen.getByLabelText(/^flèche 2, vide/);
    expect(idle.getAttribute('aria-disabled')).toBe('true');
    expect(idle.getAttribute('tabindex')).toBe('-1');
  });

  it('counts the bar and the trays in their names', () => {
    const state = bearingOffState('white');
    render(
      <Board
        controller={controllerFor('white', {
          state: { ...state, board: { ...state.board, bar: { white: 2, black: 1 } } },
        })}
      />,
    );

    expect(screen.getByLabelText(/^barre, 2 de vos pions, 1 des siens/)).toBeDefined();
    expect(screen.getByRole('button', { name: /blancs sortis, 12 sur 15/i })).toBeDefined();
  });
});
