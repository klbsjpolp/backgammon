---
name: core-rules
description: Change the backgammon rules engine — legal moves, bearing off, hitting, the bar, the doubling cube, win detection, or the AI. Use when editing packages/backgammon-core, or when a move is generated that should not be (or not generated that should be).
---

# Working in the rules engine

`@backgammon/core` is pure: no React, no I/O, no randomness except through an injected `Rng`. Everything else in the
repo is downstream of it, so a mistake here is a corrupt board on someone's phone rather than a failing render.

## Three coordinate systems — keep them straight

| Frame          | Where                                                      | Convention                                                                                                                                                                  |
| -------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Absolute**   | `Board.points`, `Move.from` / `Move.to`, everything public | 24 signed counts, index 0..23. `+` = white, `−` = black, `0` = empty. White travels 23 → 0, home 0..5; black mirrors. `BAR = -1`, `OFF = 24`.                               |
| **Normalized** | inside `moves.ts` only                                     | The mover is always positive, always travels 23 → 0, enters onto 18..23, bears off below 0. White is the identity; black is mirrored across index 23 with the sign flipped. |
| **Displayed**  | `Board.tsx`                                                | Each player's own 1..24, counting up from the point they bear off from. The two players disagree about every point, as on a real board.                                     |

**Never special-case black in rule code.** Normalize with `toNorm`, decide, map back with `toAbsIndex`. A branch on
`player === 'black'` inside move generation is the bug, not the fix — the whole point of the normalized frame is that
there is one set of rules.

## The validation boundary

- **`playMove` validates** against `legalMoves` and throws otherwise. Everything reachable from the UI or the network
  goes through it, including the host.
- **`applyLegalMove` does not**, and exists for exactly one caller: the AI search, which just took the move out of
  `currentLegalMoves` and would otherwise pay for the check at every one of up to 60k nodes. It still insists the die
  is among `remaining` — at `indexOf === -1` the two slices that remove it overlap and `remaining` _grows_, handing
  the mover a die nobody rolled and a turn that cannot end. That check costs an `indexOf` it was already doing.
- **`applyMove` reads whether a move hits** off the board rather than trusting `Move.hit`, which is an _output_ of the
  generator describing what a move will do, not an instruction to it.

If you add a path that mutates the board, decide which side of this line it is on and say so in a comment.

## Rules already implemented — do not re-derive them

Doubles play four moves; entering from the bar precedes everything else; bearing off needs all fifteen home, with
overshoot only from the highest occupied point; the use-both-dice rule (and play the higher when only one fits) is
enforced in generation, not by the caller. A roll with no legal move sets `GameState.noPlay` and passes the turn —
it must stay set until the same player rolls again, or the UI has nothing to say.

Win detection covers single / gammon (2×) / backgammon (3×) and multiplies by the cube. The AI's cube decisions come
off `winProbability`, a heuristic (not a rollout): `shouldDouble` inside 0.68–0.85, `shouldTakeDouble` at a 0.22 take
point.

## Tests

`packages/backgammon-core/tests/core.test.ts`, through the public API. Use `createRng(seed)` for deterministic dice —
never stub `Math.random`. Any change to `applyMove` or bearing off wants an assertion that **the checker count is
still 30**: that is the invariant the whole engine exists to preserve, and the failure mode it guards is silent.

Then `pnpm --filter @backgammon/core test`, and `pnpm test` before committing — the runtime's host tests and the web
app's hooks both replay real games through this code.
