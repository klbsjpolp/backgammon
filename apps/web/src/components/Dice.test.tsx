import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createInitialState, type GameState } from '@backgammon/core';
import { FullscreenContext } from '@/fullscreen';
import { Dice } from './Dice';

const moving = (roll: [number, number], remaining: number[]): GameState => ({
  ...createInitialState('white'),
  phase: 'moving',
  roll,
  remaining,
});

/**
 * The dice as drawn, in order, each with whether it is shown as already played.
 * A drawn face has no text to match on, so the value it renders is read off the
 * attribute the component labels it with.
 */
const drawn = () =>
  [...screen.getByLabelText('dés').querySelectorAll('svg')].map((el) => ({
    face: Number(el.getAttribute('data-face')),
    played: el.getAttribute('data-played') === 'true',
  }));

describe('Dice', () => {
  it('draws one die per pip of the roll', () => {
    render(<Dice state={moving([6, 5], [6, 5])} />);
    expect(drawn()).toEqual([
      { face: 6, played: false },
      { face: 5, played: false },
    ]);
  });

  it('fades the dice already spent on a move', () => {
    render(<Dice state={moving([6, 5], [5])} />);
    expect(drawn()).toEqual([
      { face: 6, played: true },
      { face: 5, played: false },
    ]);
  });

  it('draws four dice on doubles, since that is how many moves they buy', () => {
    render(<Dice state={moving([3, 3], [3, 3])} />);
    // Two of the four are gone: `remaining` counts values, so the first two of a
    // value are the ones still to play.
    expect(drawn()).toEqual([
      { face: 3, played: false },
      { face: 3, played: false },
      { face: 3, played: true },
      { face: 3, played: true },
    ]);
  });

  it('reads the pips still to play out to a screen reader', () => {
    render(<Dice state={moving([6, 5], [6, 5])} />);
    expect(screen.getByText('restants :').parentElement?.textContent).toBe('restants : 6, 5');
  });

  it('draws every face with the number of pips it is worth', () => {
    // The arrangement is a lookup table, so the thing that can go wrong is a
    // face having the wrong number of pips in it — that, a count can see.
    for (const value of [1, 2, 3, 4, 5, 6]) {
      const { container, unmount } = render(<Dice state={moving([value, value === 6 ? 1 : 6], [])} />);
      expect(container.querySelector(`svg[data-face='${value}']`)?.querySelectorAll('circle')).toHaveLength(value);
      unmount();
    }
  });

  it('draws nothing before the roll', () => {
    render(<Dice state={{ ...createInitialState('white'), phase: 'rolling', roll: null, remaining: [] }} />);
    expect(screen.queryByLabelText('dice')).toBeNull();
  });
});

describe('Dice — the size the caller asked for', () => {
  /**
   * The one thing a die's size must never be is a flat pixel count. `Controls`
   * reserves the dice cell at the width of four of them, measured against the
   * `1em` the caller sets — a fixed 40px made a double 171px wide against that
   * 132px reservation, and on a 360px phone the fourth die was drawn under the
   * new-game button. Fullscreen is the one exception, and it is derived from
   * the board's own unit rather than fixed, because the buttons beside the dice
   * cost the same pixels whatever the board's size.
   */
  const die = (container: HTMLElement) => container.querySelector('svg[data-face]');

  it('takes its size from the caller everywhere but fullscreen', () => {
    const { container } = render(<Dice state={moving([6, 5], [6, 5])} />);
    expect(die(container)?.getAttribute('class')).toContain('size-[1em]');
  });

  it('takes it from the board in fullscreen, where the caller has no say', () => {
    const { container } = render(
      <FullscreenContext.Provider value={{ isFullscreen: true, isSupported: true, toggle: () => {} }}>
        <Dice state={moving([6, 5], [6, 5])} />
      </FullscreenContext.Provider>,
    );
    const cls = die(container)?.getAttribute('class');
    expect(cls).toContain('size-board-die');
    expect(cls).not.toContain('size-[1em]');
  });
});

describe('Dice — what it does not claim to do', () => {
  it('holds no live region of its own', () => {
    // It is unmounted until a roll lands, so any region inside it would enter
    // the DOM together with its content and never announce. Saying the roll is
    // `TurnStatus`'s job, from a region that is always mounted.
    const { container } = render(<Dice state={moving([6, 5], [6, 5])} />);
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(0);
  });
});
