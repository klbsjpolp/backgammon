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
    const { container } = render(<TurnStatus state={createInitialState('white')} you="white" opponentLabel="AI" />);
    const regions = container.querySelectorAll('[aria-live]');
    expect(regions).toHaveLength(1);
    expect(liveRegion(container)?.textContent).toMatch(/white to roll/i);
  });

  it('survives the roll it is meant to announce, rather than being remounted by it', () => {
    const before = createInitialState('white');
    const { container, rerender } = render(<TurnStatus state={before} you="white" opponentLabel="AI" />);
    const region = liveRegion(container);

    rerender(<TurnStatus state={applyRoll(before, [6, 5])} you="white" opponentLabel="AI" />);

    // Same node, new text — which is what fires an announcement.
    expect(liveRegion(container)).toBe(region);
    expect(region?.textContent).toMatch(/rolled 6-5, 6, 5 left to play/i);
  });

  it('speaks the dice, which are drawn somewhere with nothing permanent to say them', () => {
    const { container } = render(
      <TurnStatus state={applyRoll(createInitialState('white'), [3, 3])} you="white" opponentLabel="AI" />,
    );
    // `<Dice>` is unmounted until a roll lands, so it can never announce one.
    expect(liveRegion(container)?.textContent).toMatch(/rolled 3-3, 3, 3, 3, 3 left to play/i);
  });

  it('carries a roll nobody could play without remounting either', () => {
    const passed: GameState = { ...createInitialState('white'), noPlay: { player: 'black', roll: [6, 5] } };
    const { container, rerender } = render(
      <TurnStatus state={createInitialState('white')} you="white" opponentLabel="AI" />,
    );
    const region = liveRegion(container);

    rerender(<TurnStatus state={passed} you="white" opponentLabel="AI" />);

    expect(liveRegion(container)).toBe(region);
    expect(region?.textContent).toMatch(/AI rolled 6-5 and could not move/i);
    // And it is still on screen for a sighted player, outside the live region.
    expect(screen.getByText(/AI rolled 6-5 and could not move/i, { ignore: '[aria-live]' })).toBeDefined();
  });

  it('stays two lines whether or not a roll went unplayed', () => {
    const quiet = render(<TurnStatus state={createInitialState('white')} you="white" opponentLabel="AI" />);
    const passed: GameState = { ...createInitialState('white'), noPlay: { player: 'black', roll: [6, 5] } };
    const loud = render(<TurnStatus state={passed} you="white" opponentLabel="AI" />);

    // The height of this box is the position of the board under it, so the
    // number of lines has to be the same in both.
    const lines = (r: { container: HTMLElement }) =>
      [...(r.container.firstElementChild?.children ?? [])].filter((el) => !el.className.includes('sr-only')).length;
    expect(lines(quiet)).toBe(2);
    expect(lines(loud)).toBe(2);
  });

  it('gives the second line to the news, and the pip counts back when it passes', () => {
    const passed: GameState = { ...createInitialState('white'), noPlay: { player: 'black', roll: [6, 5] } };
    const { container, rerender } = render(<TurnStatus state={passed} you="white" opponentLabel="AI" />);

    // Reference the player can read a moment later, in place of news that is
    // gone by the next roll — rather than a line reserved for one of them and
    // empty nearly always.
    expect(container.textContent).toContain('AI rolled 6-5 and could not move');
    expect(screen.queryByText(/pips W 167/, { ignore: '[aria-live]' })).toBeNull();

    rerender(<TurnStatus state={createInitialState('white')} you="white" opponentLabel="AI" />);
    expect(screen.getByText(/cube ×1 · pips W 167 \/ B 167/)).toBeDefined();
  });

  it('leaves the visible spans silent so nothing is said twice', () => {
    const { container } = render(
      <TurnStatus state={applyRoll(createInitialState('white'), [6, 5])} you="white" opponentLabel="AI" />,
    );
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(1);
    expect(liveRegion(container)?.className).toContain('sr-only');
  });
});
