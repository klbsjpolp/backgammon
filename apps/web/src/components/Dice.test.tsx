import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { createInitialState, type GameState } from '@backgammon/core';
import { Dice } from './Dice';

const moving = (roll: [number, number], remaining: number[]): GameState => ({
  ...createInitialState('white'),
  phase: 'moving',
  roll,
  remaining,
});

/** The pips as drawn, in order, each with whether it is shown as already played. */
const drawn = () =>
  within(screen.getByLabelText('dice'))
    .getAllByText(/[⚀-⚅]/)
    .map((el) => ({ face: el.textContent, played: el.className.includes('opacity-30') }));

describe('Dice', () => {
  it('draws one die per pip of the roll', () => {
    render(<Dice state={moving([6, 5], [6, 5])} />);
    expect(drawn()).toEqual([
      { face: '⚅', played: false },
      { face: '⚄', played: false },
    ]);
  });

  it('fades the dice already spent on a move', () => {
    render(<Dice state={moving([6, 5], [5])} />);
    expect(drawn()).toEqual([
      { face: '⚅', played: true },
      { face: '⚄', played: false },
    ]);
  });

  it('draws four dice on doubles, since that is how many moves they buy', () => {
    render(<Dice state={moving([3, 3], [3, 3])} />);
    // Two of the four are gone: `remaining` counts values, so the first two of a
    // value are the ones still to play.
    expect(drawn()).toEqual([
      { face: '⚂', played: false },
      { face: '⚂', played: false },
      { face: '⚂', played: true },
      { face: '⚂', played: true },
    ]);
  });

  it('reads the pips still to play out to a screen reader', () => {
    render(<Dice state={moving([6, 5], [6, 5])} />);
    expect(screen.getByText('remaining:').parentElement?.textContent).toBe('remaining: 6, 5');
  });

  it('draws nothing before the roll', () => {
    render(<Dice state={{ ...createInitialState('white'), phase: 'rolling', roll: null, remaining: [] }} />);
    expect(screen.queryByLabelText('dice')).toBeNull();
  });
});
