import { describe, expect, it } from 'vitest';
import * as core from '../src/index.js';
import { duel } from '../scripts/duel.js';

// The harness is only run by hand, so nothing else would notice it stop
// compiling against the engine or stop finishing games.
describe('duel harness', () => {
  it('plays every game to a result, the same way for the same seed', () => {
    const options = { games: 4, seed: 7, cube: true };
    const first = duel(core, core, options);
    expect(first.games).toBe(4);
    expect(duel(core, core, options)).toEqual(first);
  });

  // Each seed is played once from each side, so an engine against itself plays
  // the same game twice with the colours swapped and wins exactly one of them.
  it('scores an engine against itself at exactly zero', () => {
    const result = duel(core, core, { games: 6, seed: 3, cube: true });
    expect(result.net).toBe(0);
    expect(result.winsA).toBe(3);
  });

  it('refuses a game count that cannot be split into pairs', () => {
    for (const games of [0, 3, 2.5, Number.NaN]) {
      expect(() => duel(core, core, { games, seed: 1, cube: true })).toThrow(/even/);
    }
  });
});
