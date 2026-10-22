/**
 * Plays two builds of the AI against each other — the measurement every change
 * to `evaluateBoard` or the cube owes before it goes in (see CLAUDE.md).
 *
 *   pnpm --filter @backgammon/core duel --b $B   # this checkout (A) against B
 *
 * `--a` and `--b` are absolute paths to a core `src/index.ts` (pnpm runs this
 * from the package directory), and both default to this checkout. Get a base
 * with `git worktree add /tmp/base origin/main`: core has no runtime
 * dependencies, so the worktree needs no install.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type * as Core from '../src/index.js';

type Engine = typeof Core;

export interface DuelOptions {
  games: number;
  seed: number;
  cube: boolean;
}

export interface DuelResult {
  games: number;
  /** Points won by A minus points won by B, summed over every game. */
  net: number;
  winsA: number;
  /**
   * Two standard errors of the mean net points per game, taken over pairs: the
   * two games of a pair share their dice, so they are one observation, not two.
   */
  margin: number;
}

// A game is a few hundred plies; this only exists so a broken engine fails
// instead of hanging the run.
const MAX_PLIES = 10_000;

const playGame = (white: Engine, black: Engine, rules: Engine, rng: Core.Rng, cube: boolean): Core.GameResult => {
  const side = (player: Core.Player): Engine => (player === 'white' ? white : black);
  let s = rules.createInitialState('white');
  for (let ply = 0; ply < MAX_PLIES; ply++) {
    if (s.result) return s.result;
    if (s.phase === 'rolling' && cube && side(s.turn).shouldDouble(s, s.turn)) {
      const responder = rules.opponent(s.turn);
      s = rules.offerDouble(s);
      s = rules.respondDouble(s, side(responder).shouldTakeDouble(s, responder));
      continue;
    }
    s = rules.roll(s, rng);
    if (s.phase === 'moving') s = side(s.turn).applyAiTurn(s);
  }
  throw new Error(`game did not finish within ${MAX_PLIES} plies`);
};

/**
 * Games are dealt in pairs: both games of a pair use the same seed, with A white
 * in the first and black in the second, so each engine plays every dice sequence
 * from both sides. That cancels the seed asymmetry, which alone moves a win rate
 * ~2%, and it makes two identical engines score exactly zero. Points rather than
 * wins, because a gammon saved is worth as much as a game won.
 */
export const duel = (a: Engine, b: Engine, { games, seed, cube }: DuelOptions): DuelResult => {
  // Two pairs at the least, since one pair is one observation and has no spread.
  if (!Number.isInteger(games) || games < 4 || games % 2 !== 0) {
    throw new Error(
      `games must be an even number of at least 4, so every seed is played from both sides (got ${games})`,
    );
  }
  const pairs = games / 2;
  let net = 0;
  let sumSq = 0;
  let winsA = 0;
  for (let p = 0; p < pairs; p++) {
    let pairNet = 0;
    for (const aIsWhite of [true, false]) {
      const result = playGame(aIsWhite ? a : b, aIsWhite ? b : a, a, a.createRng(seed + p), cube);
      const aWon = (result.winner === 'white') === aIsWhite;
      pairNet += aWon ? result.points : -result.points;
      if (aWon) winsA++;
    }
    net += pairNet;
    sumSq += pairNet * pairNet;
  }
  // A game is worth half a pair, so two standard errors of the per-game mean
  // are 2 · √(variance / pairs) / 2.
  const pairMean = net / pairs;
  const variance = (sumSq - pairs * pairMean * pairMean) / (pairs - 1);
  return { games, net, winsA, margin: Math.sqrt(variance / pairs) };
};

const load = async (path: string | undefined): Promise<Engine> =>
  (await import(
    pathToFileURL(resolve(path ?? fileURLToPath(new URL('../src/index.ts', import.meta.url)))).href
  )) as Engine;

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      a: { type: 'string' },
      b: { type: 'string' },
      games: { type: 'string', default: '600' },
      seed: { type: 'string', default: '1' },
      'no-cube': { type: 'boolean', default: false },
    },
  });
  const [a, b] = await Promise.all([load(values.a), load(values.b)]);
  const started = performance.now();
  const r = duel(a, b, { games: Number(values.games), seed: Number(values.seed), cube: !values['no-cube'] });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const perGame = (r.net / r.games).toFixed(3);
  const winRate = ((100 * r.winsA) / r.games).toFixed(1);
  console.info(`${r.games} games in ${seconds}s`);
  console.info(`A net ${r.net} points, ${perGame} ± ${r.margin.toFixed(3)} per game; A won ${winRate}%`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
