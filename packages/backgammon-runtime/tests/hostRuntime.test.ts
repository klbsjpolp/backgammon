import { describe, expect, it } from 'vitest';
import { createRng } from '@backgammon/core';
import { BackgammonHost } from '../src/index.js';

const newHost = (seating = [0, 1], seed = 7) =>
  new BackgammonHost({ seating, config: { startingPlayer: 'white' }, rng: createRng(seed) });

describe('BackgammonHost', () => {
  it('maps seats to colors in seating order', () => {
    const host = newHost([3, 5]);
    expect(host.viewFor(3).you).toBe('white');
    expect(host.viewFor(5).you).toBe('black');
    expect(host.currentSeatIndex()).toBe(3); // white starts
  });

  it('rolls authoritatively and accepts a legal move from the seat on roll', () => {
    const host = newHost();
    host.applyAction(0, { type: 'roll' });
    const view = host.viewFor(0);
    expect(view.yourTurn).toBe(true);
    expect(view.state.phase).toBe('moving');
    expect(view.legalMoves.length).toBeGreaterThan(0);

    const move = view.legalMoves[0];
    expect(() => host.applyAction(0, { type: 'move', from: move.from, to: move.to, die: move.die })).not.toThrow();
  });

  it('rejects actions from the seat not on roll', () => {
    const host = newHost();
    expect(() => host.applyAction(1, { type: 'roll' })).toThrow(/not your turn/);
  });

  it('rejects an illegal move', () => {
    const host = newHost();
    host.applyAction(0, { type: 'roll' });
    expect(() => host.applyAction(0, { type: 'move', from: 99, to: 0, die: 1 })).toThrow(/illegal move/);
  });

  it('handles a doubling cube offer and take', () => {
    const host = newHost();
    host.applyAction(0, { type: 'offerDouble' });
    expect(host.getState().phase).toBe('doubleOffered');
    // The offerer cannot answer their own double.
    expect(() => host.applyAction(0, { type: 'respondDouble', accept: true })).toThrow(/not your double/);
    host.applyAction(1, { type: 'respondDouble', accept: true });
    expect(host.getState().cube).toEqual({ value: 2, owner: 'black' });
  });

  it('starts the player on the server-chosen seat', () => {
    const host = new BackgammonHost({ seating: [0, 1], startingSeatIndex: 1, rng: createRng(2) });
    expect(host.getState().turn).toBe('black');
    expect(host.currentSeatIndex()).toBe(1);
  });

  it('hands the turn to the other seat after a full turn (online exchange)', () => {
    const host = new BackgammonHost({ seating: [0, 1], startingSeatIndex: 0, rng: createRng(3) });
    host.applyAction(0, { type: 'roll' });
    let guard = 0;
    while (host.getState().turn === 'white' && host.getState().phase === 'moving' && guard++ < 10) {
      const move = host.viewFor(0).legalMoves[0];
      host.applyAction(0, { type: 'move', from: move.from, to: move.to, die: move.die });
    }
    expect(host.getState().turn).toBe('black');
    expect(host.currentSeatIndex()).toBe(1);
    // The other seat (a guest) may now act; the seat that just played may not.
    expect(() => host.applyAction(1, { type: 'roll' })).not.toThrow();
    expect(() => host.applyAction(0, { type: 'roll' })).toThrow(/not your turn/);
  });

  it('round-trips through a snapshot', () => {
    const host = newHost();
    host.applyAction(0, { type: 'roll' });
    const snap = host.snapshot();

    const restored = new BackgammonHost({ seating: [0, 1], rng: createRng(1) });
    restored.restore(snap);
    expect(restored.getState()).toEqual(host.getState());
    expect(restored.viewFor(0).legalMoves).toEqual(host.viewFor(0).legalMoves);
  });
});
