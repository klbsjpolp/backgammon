import { describe, expect, it } from 'vitest';
import {
  allHome,
  applyAiTurn,
  applyLegalMove,
  applyMove,
  applyRoll,
  BAR,
  OFF,
  canDouble,
  checkersOn,
  chooseTurn,
  createInitialBoard,
  createInitialState,
  createRng,
  currentLegalMoves,
  evaluateBoard,
  legalMoves,
  offerDouble,
  pipCount,
  playMove,
  respondDouble,
  roll,
  shouldDouble,
  shouldTakeDouble,
  winProbability,
  type Board,
  type GameState,
  type Player,
} from '../src/index.js';

const makeBoard = (
  points: Record<number, number>,
  bar: Partial<Record<Player, number>> = {},
  off: Partial<Record<Player, number>> = {},
): Board => {
  const arr = new Array<number>(24).fill(0);
  for (const [k, v] of Object.entries(points)) arr[Number(k)] = v;
  return {
    points: arr,
    bar: { white: 0, black: 0, ...bar },
    off: { white: 0, black: 0, ...off },
  };
};

const movingState = (board: Board, turn: Player, remaining: number[]): GameState => ({
  ...createInitialState(turn),
  board,
  phase: 'moving',
  roll: [remaining[0], remaining[1] ?? remaining[0]],
  remaining,
});

describe('board setup', () => {
  it('opens with the standard position and equal pip counts of 167', () => {
    const board = createInitialBoard();
    expect(pipCount(board, 'white')).toBe(167);
    expect(pipCount(board, 'black')).toBe(167);
    const total = board.points.reduce((sum, v) => sum + Math.abs(v), 0);
    expect(total).toBe(30); // 15 white + 15 black checkers placed
  });
});

describe('bar re-entry', () => {
  it('forces entry from the bar and blocks closed entry points', () => {
    // White on the bar; black holds 23,22,21,20 (blocks dice 1..4). Only die 5
    // (-> index 19) and die 6 (-> index 18) can enter.
    const board = makeBoard({ 12: 14, 23: -2, 22: -2, 21: -2, 20: -2 }, { white: 1 });
    const moves = legalMoves(board, 'white', [5, 2]);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ from: BAR, to: 19, die: 5, hit: false });
  });
});

describe('hitting', () => {
  it('sends a hit blot to the bar', () => {
    const board = makeBoard({ 10: 1, 7: -1 });
    const after = applyMove(board, 'white', { from: 10, to: 7, die: 3, hit: true });
    expect(after.points[7]).toBe(1); // white now occupies the point
    expect(after.points[10]).toBe(0);
    expect(after.bar.black).toBe(1);
  });
});

describe('bearing off', () => {
  it('bears a checker off with an exact die', () => {
    const board = makeBoard({ 5: 2, 3: 1 }, {}, { white: 12 });
    const moves = legalMoves(board, 'white', [6, 1]);
    expect(moves).toContainEqual({ from: 5, to: OFF, die: 6, hit: false });
    // Cannot overshoot the 4-point (index 3) with a 6 while the 6-point is occupied.
    expect(moves.some((m) => m.from === 3 && m.to === OFF)).toBe(false);
  });

  it('allows overshoot bear-off only from the highest occupied point', () => {
    const board = makeBoard({ 3: 1 }, {}, { white: 14 });
    const moves = legalMoves(board, 'white', [6, 6, 6, 6]);
    expect(moves).toContainEqual({ from: 3, to: OFF, die: 6, hit: false });
  });

  it('bears off correctly for black (mirrored)', () => {
    const board = makeBoard({ 18: -2 }, {}, { black: 13 });
    const moves = legalMoves(board, 'black', [6, 1]);
    expect(moves).toContainEqual({ from: 18, to: OFF, die: 6, hit: false });
    const after = applyMove(board, 'black', { from: 18, to: OFF, die: 6, hit: false });
    expect(after.off.black).toBe(14);
    expect(after.points[18]).toBe(-1);
  });
});

describe('use-both-dice rule', () => {
  it('forces the higher die when only one of two can be played', () => {
    // Single white checker on the 24-point (index 23). Both 6 (->17) and 5
    // (->18) are individually playable, but the 12-point is blocked so the
    // second die can never follow. The rule requires playing the higher die.
    const board = makeBoard({ 23: 1, 12: -2, 6: -13 }, {}, { white: 14 });
    const moves = legalMoves(board, 'white', [6, 5]);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ from: 23, to: 17, die: 6 });
  });
});

describe('win detection', () => {
  const bearOffLast = (black: Record<number, number>, blackOff: number) => {
    const board = makeBoard({ 0: 1, ...black }, {}, { white: 14, black: blackOff });
    const state = movingState(board, 'white', [1, 1]);
    return playMove(state, { from: 0, to: OFF, die: 1, hit: false });
  };

  it('scores a single game when the loser has borne a checker off', () => {
    const next = bearOffLast({ 20: -14 }, 1);
    expect(next.phase).toBe('gameOver');
    expect(next.result).toMatchObject({ winner: 'white', kind: 'single', points: 1 });
  });

  it('scores a gammon when the loser has borne nothing off', () => {
    const next = bearOffLast({ 20: -15 }, 0);
    expect(next.result).toMatchObject({ kind: 'gammon', points: 2 });
  });

  it('scores a backgammon when the loser is still in the winner home board', () => {
    // A black checker on index 3 sits in white's home board.
    const next = bearOffLast({ 3: -1, 20: -14 }, 0);
    expect(next.result).toMatchObject({ kind: 'backgammon', points: 3 });
  });
});

describe('doubling cube', () => {
  it('doubles and hands the cube to the taker on accept', () => {
    const offered = offerDouble(createInitialState('white'));
    expect(offered.phase).toBe('doubleOffered');
    const taken = respondDouble(offered, true);
    expect(taken.cube).toEqual({ value: 2, owner: 'black' });
    expect(taken.phase).toBe('rolling');
  });

  it('ends the game on decline, conceding the cube stake', () => {
    const dropped = respondDouble(offerDouble(createInitialState('white')), false);
    expect(dropped.phase).toBe('gameOver');
    expect(dropped.result).toMatchObject({ winner: 'white', points: 1 });
  });

  it('only lets the cube owner double', () => {
    const state = { ...createInitialState('white'), cube: { value: 2, owner: 'black' as Player } };
    expect(canDouble(state, 'white')).toBe(false);
  });
});

describe('allHome', () => {
  // Exported, and the only reader of `homeRange` that nothing inside core calls:
  // move generation runs in the normalized frame and has its own `allHomeNorm`.
  // So the absolute-coordinate version, and its mirror, are only ever exercised
  // here.
  it('counts borne-off checkers as home, in both directions', () => {
    expect(allHome(makeBoard({ 5: 10 }, {}, { white: 5 }), 'white')).toBe(true);
    expect(allHome(makeBoard({ 18: -10 }, {}, { black: 5 }), 'black')).toBe(true);
  });

  it('is false with a checker outside the home board or on the bar', () => {
    expect(allHome(makeBoard({ 5: 14, 6: 1 }), 'white')).toBe(false); // the 6 is one point out
    expect(allHome(makeBoard({ 18: -14, 17: -1 }), 'black')).toBe(false); // mirrored
    expect(allHome(makeBoard({ 5: 14 }, { white: 1 }), 'white')).toBe(false);
  });
});

describe('ai', () => {
  it('uses both dice when a full sequence is available', () => {
    const state = applyRoll(createInitialState('white'), [3, 1]);
    expect(chooseTurn(state)).toHaveLength(2);
  });

  it('evaluation penalizes a blot exposed to a direct shot', () => {
    const exposed = makeBoard({ 12: 1, 6: -1 }); // black on 6 hits the 12-blot with a 6
    const safe = makeBoard({ 12: 1, 0: -1 }); // black on 0 has no direct shot
    expect(evaluateBoard(exposed, 'white')).toBeLessThan(evaluateBoard(safe, 'white'));
  });

  it('counts the shots an opponent on the bar plays as it enters', () => {
    // Same two blots and the same pip count either way; only their exposure to
    // black's entry differs. Reading shots off `points` alone scored these equal.
    const clear = makeBoard({ 0: 1, 7: 1, 23: -1 }, { black: 1 }); // only a 1 enters onto a blot
    const covered = makeBoard({ 3: 1, 4: 1, 23: -1 }, { black: 1 }); // a 4 and a 5 both do
    expect(evaluateBoard(covered, 'white')).toBeLessThan(evaluateBoard(clear, 'white'));
  });

  it('keeps entry shots out of the cube calculation', () => {
    // `winProbability` shares `directShots` with the evaluation and weighs it
    // against a bar term tuned without entry shots, so counting them there
    // re-tunes every doubling decision — 31 calls flipped over 800 measured
    // games. Only checker play was measured, so only checker play sees them.
    const clear = makeBoard({ 0: 1, 7: 1, 23: -1 }, { black: 1 });
    const covered = makeBoard({ 3: 1, 4: 1, 23: -1 }, { black: 1 });
    const state = (board: Board): GameState => ({ ...createInitialState('white'), board });
    expect(winProbability(state(covered), 'white')).toBe(winProbability(state(clear), 'white'));
  });

  it('prefers a checker still doing something to a sixth one on a made point', () => {
    // 43 pips and one made point on either side: nothing but the stack separates
    // them, and without a term for it the search took whichever it saw first.
    const stacked = makeBoard({ 5: 5, 12: 1, 0: -1 });
    const spread = makeBoard({ 5: 4, 9: 1, 8: 1, 0: -1 });
    expect(pipCount(stacked, 'white')).toBe(pipCount(spread, 'white'));
    expect(evaluateBoard(stacked, 'white')).toBeLessThan(evaluateBoard(spread, 'white'));
  });

  it("runs out of the winner's home board rather than tidying its own", () => {
    // Black has twelve off and white has none, so white is playing for the two
    // points a backgammon would cost rather than for a game it cannot win. Both
    // plays below spend the same eleven pips; white used to choose 8->2, 5->0,
    // leaving the anchor on 22 to be trebled.
    const board = makeBoard({ 22: 2, 13: 2, 12: 2, 8: 3, 5: 6, 21: -2, 20: -1 }, {}, { black: 12 });
    const after = applyAiTurn(movingState(board, 'white', [6, 5]));
    let trapped = 0;
    for (let i = 18; i <= 23; i++) trapped += checkersOn(after.board, 'white', i);
    expect(trapped).toBe(0);
  });

  it("runs out of the winner's home board as black too", () => {
    // The same position mirrored across index 23 with the colours swapped. The
    // trapped checkers are black's, on 1, and home is 0..5 rather than 18..23 —
    // the one place in the evaluation that has to name a player's own end of the
    // board, so it gets the mirror asserted rather than assumed.
    const board = makeBoard({ 1: -2, 10: -2, 11: -2, 15: -3, 18: -6, 2: 2, 3: 1 }, {}, { white: 12 });
    const after = applyAiTurn(movingState(board, 'black', [6, 5]));
    let trapped = 0;
    for (let i = 0; i <= 5; i++) trapped += checkersOn(after.board, 'black', i);
    expect(trapped).toBe(0);
  });

  it('holds the anchor while the game is still winnable', () => {
    // The same shape with black only four checkers into its bear-off: an anchor
    // in the winner's home board is the last thing that can still win outright,
    // so the backgammon term stays quiet until black has eight off.
    const board = makeBoard({ 22: 2, 13: 2, 12: 2, 8: 3, 5: 6, 21: -2, 20: -1, 19: -6, 18: -2 }, {}, { black: 4 });
    const after = applyAiTurn(movingState(board, 'white', [6, 5]));
    expect(checkersOn(after.board, 'white', 22)).toBe(2);
  });
});

describe('ai cube strategy', () => {
  /** A pure race: each side stacked on one point, nothing left to contest. */
  const race = (whiteOff: number, blackOff: number, turn: Player = 'white'): GameState => ({
    ...createInitialState(turn),
    board: makeBoard({ 3: 15 - whiteOff, 20: -(15 - blackOff) }, {}, { white: whiteOff, black: blackOff }),
  });

  it('gives the opening position a near-even probability, edge to the player on roll', () => {
    const state = createInitialState('white');
    const p = winProbability(state, 'white');
    expect(p).toBeGreaterThan(0.5);
    expect(p).toBeLessThan(0.6);
    // The two sides' estimates are complementary.
    expect(p + winProbability(state, 'black')).toBeCloseTo(1, 5);
  });

  it('reports certainty once a side has borne all fifteen off', () => {
    expect(winProbability(race(15, 4), 'white')).toBe(1);
    expect(winProbability(race(15, 4), 'black')).toBe(0);
  });

  it('rises with the pip lead', () => {
    const slight = winProbability(race(3, 0), 'white');
    const large = winProbability(race(9, 0), 'white');
    expect(slight).toBeLessThan(large);
    expect(large).toBeGreaterThan(0.9);
  });

  it('does not double from the opening position', () => {
    expect(shouldDouble(createInitialState('white'), 'white')).toBe(false);
  });

  it('doubles inside the window and holds back when too good', () => {
    expect(shouldDouble(race(3, 0), 'white')).toBe(true);
    // A commanding lead is worth playing on for the gammon rather than cashing.
    expect(shouldDouble(race(9, 0), 'white')).toBe(false);
  });

  it('never doubles when it does not own the cube', () => {
    const state = { ...race(3, 0), cube: { value: 2, owner: 'black' as Player } };
    expect(canDouble(state, 'white')).toBe(false);
    expect(shouldDouble(state, 'white')).toBe(false);
  });

  it('never doubles outside the rolling phase', () => {
    expect(shouldDouble({ ...race(3, 0), phase: 'moving' }, 'white')).toBe(false);
  });

  it('drops a hopeless double and takes a playable one', () => {
    expect(shouldTakeDouble(race(9, 0), 'black')).toBe(false);
    expect(shouldTakeDouble(race(0, 0), 'black')).toBe(true);
  });
});

describe('full game simulation', () => {
  it('plays a seeded AI-vs-AI game to completion with a clean win', () => {
    let s = createInitialState('white');
    const rng = createRng(1234);
    let guard = 0;
    while (s.phase !== 'gameOver' && guard++ < 5000) {
      if (s.phase === 'rolling') s = roll(s, rng);
      else if (s.phase === 'moving') s = applyAiTurn(s);
      else break;
    }
    expect(s.phase).toBe('gameOver');
    expect(s.result).not.toBeNull();
    expect(s.board.off[s.result!.winner]).toBe(15);
  });
});

describe('illegal moves', () => {
  it('refuses a move that is not in the legal set', () => {
    const state = movingState(createInitialBoard(), 'white', [3, 1]);
    // Index 11 is a made black point; before validation this overwrote all five
    // of its checkers with one white one and sent a single checker to the bar.
    expect(() => playMove(state, { from: 23, to: 11, die: 3, hit: true })).toThrow(/illegal move/);
  });

  it('refuses a die that was never rolled', () => {
    const state = movingState(createInitialBoard(), 'white', [3, 1]);
    // This one consumed nothing, so the turn could never end.
    expect(() => playMove(state, { from: 23, to: 17, die: 6, hit: false })).toThrow(/illegal move/);
  });

  it('reads the hit off the board rather than trusting the caller', () => {
    const board = makeBoard({ 10: 1, 7: -2 });
    // `hit: true` against a made point: honouring it would delete both checkers.
    const after = applyMove(board, 'white', { from: 10, to: 7, die: 3, hit: true });
    expect(after.points[7]).toBe(-1); // black keeps its point, white joins nothing
    expect(after.bar.black).toBe(0);
  });
});

describe('a roll with no legal move', () => {
  /** White is on the bar and black owns all six entry points. */
  const danced = () => {
    const board = makeBoard({ 23: -2, 22: -2, 21: -2, 20: -2, 19: -2, 18: -2, 0: 13 }, { white: 2 });
    return applyRoll({ ...createInitialState('white'), board }, [3, 4]);
  };

  it('passes the turn and remembers the roll nobody could play', () => {
    const after = danced();
    expect(after.turn).toBe('black');
    expect(after.phase).toBe('rolling');
    // Without this the dice were discarded before the UI could draw them.
    expect(after.noPlay).toEqual({ player: 'white', roll: [3, 4] });
  });

  it('keeps it through the opponent reply and clears it on the next own roll', () => {
    const blackRolled = applyRoll(danced(), [6, 5]);
    // Still on screen while the opponent plays, which is the point of holding it.
    expect(blackRolled.noPlay).toEqual({ player: 'white', roll: [3, 4] });

    // White's turn comes round again, this time on a board it can play.
    const backToWhite: GameState = {
      ...blackRolled,
      board: createInitialBoard(),
      turn: 'white',
      phase: 'rolling',
      roll: null,
      remaining: [],
    };
    expect(applyRoll(backToWhite, [6, 5]).noPlay).toBeNull();
  });
});

describe('engine invariants', () => {
  const totalFor = (board: Board, player: Player): number => {
    let n = board.bar[player] + board.off[player];
    for (let i = 0; i < 24; i++) n += checkersOn(board, player, i);
    return n;
  };

  it('conserves thirty checkers and never mixes colours on a point', () => {
    // Random legal play, which is the only way to reach the awkward positions
    // (dancing off a closed board, forced bear-offs) that hand-written cases miss.
    // 25 seeds of this routinely run close to vitest's 5000ms default, so it
    // needs its own longer budget rather than tripping on machine variance.
    for (let seed = 1; seed <= 25; seed++) {
      const rng = createRng(seed * 7919);
      let s = createInitialState(seed % 2 ? 'white' : 'black');
      for (let guard = 0; guard < 1500 && s.phase !== 'gameOver'; guard++) {
        if (s.phase === 'rolling') {
          s = roll(s, rng);
          continue;
        }
        const moves = currentLegalMoves(s);
        expect(moves.length, `seed ${seed}: moving phase with nothing to play`).toBeGreaterThan(0);
        s = playMove(s, moves[Math.floor(rng() * moves.length)]);

        expect(totalFor(s.board, 'white')).toBe(15);
        expect(totalFor(s.board, 'black')).toBe(15);
        for (let i = 0; i < 24; i++) {
          expect(
            checkersOn(s.board, 'white', i) === 0 || checkersOn(s.board, 'black', i) === 0,
            `seed ${seed}: point ${i} holds both colours`,
          ).toBe(true);
        }
      }
      expect(s.phase, `seed ${seed} never finished`).toBe('gameOver');
      expect(s.board.off[s.result!.winner]).toBe(15);
    }
  }, 20000);

  it('only offers moves that belong to a longest sequence', () => {
    // The use-both-dice rule, checked against a brute force that shares no code
    // with the filter under test.
    const longest = (board: Board, player: Player, dice: number[]): number => {
      if (dice.length === 0) return 0;
      let best = 0;
      for (const die of new Set(dice)) {
        const rest = dice.slice();
        rest.splice(rest.indexOf(die), 1);
        // A single die on its own is never filtered, so this enumerates freely.
        for (const m of legalMoves(board, player, [die])) {
          best = Math.max(best, 1 + longest(applyMove(board, player, m), player, rest));
        }
      }
      return best;
    };

    const rng = createRng(20260812);
    let s = createInitialState('white');
    let checked = 0;
    for (let guard = 0; guard < 3000 && checked < 250; guard++) {
      if (s.phase === 'gameOver') s = createInitialState('white');
      if (s.phase === 'rolling') {
        s = roll(s, rng);
        continue;
      }
      const moves = currentLegalMoves(s);
      const max = longest(s.board, s.turn, s.remaining);
      for (const m of moves) {
        const rest = s.remaining.slice();
        rest.splice(rest.indexOf(m.die), 1);
        expect(
          1 + longest(applyMove(s.board, s.turn, m), s.turn, rest),
          `${JSON.stringify(m)} does not reach the ${max}-die maximum`,
        ).toBe(max);
        checked++;
      }
      s = playMove(s, moves[Math.floor(rng() * moves.length)]);
    }
    expect(checked).toBeGreaterThan(200);
  });
});

describe('applyLegalMove — the unchecked fast path', () => {
  it('refuses a die that is not among the remaining ones', () => {
    const state = movingState(createInitialBoard(), 'white', [3, 5]);
    const legal = currentLegalMoves(state)[0];
    // Splicing at indexOf === -1 overlaps the two slices, so `remaining` grew to
    // [3, 3, 5]: a die nobody rolled, and a turn that could never end.
    expect(() => applyLegalMove(state, { ...legal, die: 6 })).toThrow(/not among the remaining dice/);
  });

  it('still consumes the right die when there are duplicates', () => {
    const state = movingState(createInitialBoard(), 'white', [3, 3, 3, 3]);
    const after = applyLegalMove(state, currentLegalMoves(state)[0]);
    expect(after.remaining).toEqual([3, 3, 3]);
  });
});
