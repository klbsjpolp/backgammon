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

  it('leaves the visible spans silent so nothing is said twice', () => {
    const { container } = render(
      <TurnStatus state={applyRoll(createInitialState('white'), [6, 5])} you="white" opponentLabel="AI" />,
    );
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(1);
    expect(liveRegion(container)?.className).toContain('sr-only');
  });
});
