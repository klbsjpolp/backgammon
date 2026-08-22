import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { applyRoll, createInitialState, type GameState } from '@backgammon/core';
import { TurnStatus } from './TurnStatus';

/** The one region that speaks. It has to be the same element across renders. */
const liveRegion = (container: HTMLElement) => container.querySelector('[aria-live="polite"]');

describe('TurnStatus — what is announced', () => {
  it('keeps a single live region mounted before there is anything to say', () => {
    // The point of the whole exercise: a region inserted alongside its content
    // is silent in every major screen reader, so it has to already be there.
    const { container } = render(<TurnStatus state={createInitialState('white')} you="white" opponentLabel="IA" />);
    const regions = container.querySelectorAll('[aria-live]');
    expect(regions).toHaveLength(1);
    expect(liveRegion(container)?.textContent).toMatch(/blanc doit lancer/i);
  });

  it('survives the roll it is meant to announce, rather than being remounted by it', () => {
    const before = createInitialState('white');
    const { container, rerender } = render(<TurnStatus state={before} you="white" opponentLabel="IA" />);
    const region = liveRegion(container);

    rerender(<TurnStatus state={applyRoll(before, [6, 5])} you="white" opponentLabel="IA" />);

    // Same node, new text — which is what fires an announcement.
    expect(liveRegion(container)).toBe(region);
    expect(region?.textContent).toMatch(/dés 6-5, il reste 6, 5 à jouer/i);
  });

  it('speaks the dice, which are drawn somewhere with nothing permanent to say them', () => {
    const { container } = render(
      <TurnStatus state={applyRoll(createInitialState('white'), [3, 3])} you="white" opponentLabel="IA" />,
    );
    // `<Dice>` is unmounted until a roll lands, so it can never announce one.
    expect(liveRegion(container)?.textContent).toMatch(/dés 3-3, il reste 3, 3, 3, 3 à jouer/i);
  });

  it('carries a roll nobody could play without remounting either', () => {
    const passed: GameState = { ...createInitialState('white'), noPlay: { player: 'black', roll: [6, 5] } };
    const { container, rerender } = render(
      <TurnStatus state={createInitialState('white')} you="white" opponentLabel="IA" />,
    );
    const region = liveRegion(container);

    rerender(<TurnStatus state={passed} you="white" opponentLabel="IA" />);

    expect(liveRegion(container)).toBe(region);
    expect(region?.textContent).toMatch(/IA a fait 6-5 et n'a pas pu jouer/i);
    // And it is still on screen for a sighted player, outside the live region.
    expect(screen.getByText(/IA a fait 6-5 et n'a pas pu jouer/i, { ignore: '[aria-live]' })).toBeDefined();
  });

  it('stays two lines whether or not a roll went unplayed', () => {
    const quiet = render(<TurnStatus state={createInitialState('white')} you="white" opponentLabel="IA" />);
    const passed: GameState = { ...createInitialState('white'), noPlay: { player: 'black', roll: [6, 5] } };
    const loud = render(<TurnStatus state={passed} you="white" opponentLabel="IA" />);

    // The height of this box is the position of the board under it, so the
    // number of lines has to be the same in both.
    const lines = (r: { container: HTMLElement }) => r.container.querySelector('.min-h-\\[2lh\\]')?.children.length;
    expect(lines(quiet)).toBe(2);
    expect(lines(loud)).toBe(2);
  });

  it('never lets the cube be the part that is cut', () => {
    // The cube is drawn nowhere else on the page: a stake you cannot see is one
    // you are playing for without knowing it. So it leads the line, ahead of
    // both the news and the pip counts.
    const doubled: GameState = {
      ...createInitialState('white'),
      cube: { value: 2, owner: 'white' },
      noPlay: { player: 'black', roll: [6, 5] },
    };
    render(<TurnStatus state={doubled} you="white" opponentLabel="IA" />);

    const line = screen.getByText(/videau ×2 \(blanc\)/, { ignore: '[aria-live]' });
    expect(line.textContent).toMatch(/^videau ×2 \(blanc\) · IA a fait 6-5 et n'a pas pu jouer · pips/);
  });

  it('keeps the pip counts while a roll nobody could play is still on screen', () => {
    // `noPlay` lives until the player who rolled it rolls again, which is a
    // whole turn cycle — long enough that the counts cannot go away for it.
    const passed: GameState = { ...createInitialState('white'), noPlay: { player: 'black', roll: [6, 5] } };
    render(<TurnStatus state={passed} you="white" opponentLabel="IA" />);

    const line = screen.getByText(/n'a pas pu jouer/, { ignore: '[aria-live]' });
    expect(line.textContent).toMatch(/pips B 167 \/ N 167$/);
  });

  it('gives the result both lines rather than clipping it', () => {
    const won: GameState = {
      ...createInitialState('white'),
      phase: 'gameOver',
      result: { winner: 'black', kind: 'backgammon', points: 3, cubeValue: 1 },
    };
    const { container } = render(<TurnStatus state={won} you="white" opponentLabel="IA" />);

    // The landscape sidebar is ~156px and the sentence is ~220px, so on one
    // truncated line the win kind and the points — what the game was played
    // for — are what falls off the end. A finished game has nothing left to
    // count, so the counts stand down and the reservation is already paid for.
    const box = container.querySelector('.min-h-\\[2lh\\]');
    expect(box?.children).toHaveLength(1);
    // Free to wrap — clamping it to the two lines the box reserves still cut
    // the sentence off in the sidebar, which needs three for it.
    expect(box?.firstElementChild?.className).not.toContain('truncate');
    expect(box?.textContent).toBe('Noir gagne un backgammon — 3 points');
  });

  it('leaves the visible spans silent so nothing is said twice', () => {
    const { container } = render(
      <TurnStatus state={applyRoll(createInitialState('white'), [6, 5])} you="white" opponentLabel="IA" />,
    );
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(1);
    expect(liveRegion(container)?.className).toContain('sr-only');
  });
});
