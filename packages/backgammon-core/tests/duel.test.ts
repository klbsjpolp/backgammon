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
    expect(first.winsA).toBeGreaterThanOrEqual(0);
    expect(first.winsA).toBeLessThanOrEqual(4);
    expect(duel(core, core, options)).toEqual(first);
  });
});
