# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

A backgammon game: a pure rules engine, a host-authoritative runtime for online play, and a React board.
[README.md](README.md) is the user-facing tour; **[DECISIONS.md](DECISIONS.md) is the reference** — it records why
things are the way they are, and most of the traps below are explained there in full.

It is ~1,700 lines, so read the section that covers your change rather than the file: `grep -n '^##' DECISIONS.md`
for the headings, then `sed -n` the range. Where to look:

| Touching                                | Section                                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `evaluateBoard`, the cube, AI strength  | **AI** (and its sub-sections)                                                                  |
| what a guest may send or trust, schemas | **Trust boundaries**, **Online / realtime-infra integration**                                  |
| no-play rolls, sole moves, undo         | **A roll nobody can play**, **The move that has nothing to decide**, **Taking a checker back** |
| checker animation, drag, trays          | **Checkers that travel**, **Checkers you can pick up**, **Checkers put away, not counted**     |
| layout, `--pt`, header, full screen     | **Phone layout**, **Full screen**, **Nothing on the page moves during a game**                 |
| colours, rings, texture                 | **Themes**                                                                                     |
| screen readers, focus                   | **Accessibility**                                                                              |
| service worker, offline, saved games    | **Installable, and offline**, **A game against the AI outlives the page**                      |
| UI wording                              | **The interface is French**                                                                    |
| CI, releases, dependencies              | **Stack**, **Releasing under a branch ruleset**                                                |
| something that looks missing            | **Deferred** — it may be left out on purpose                                                   |

```
packages/backgammon-core      @backgammon/core     rules: board, dice, moves, cube, AI. No React, no I/O.
packages/backgammon-runtime   @backgammon/runtime  host runtime + zod schemas for the wire. No transport.
apps/web                      @backgammon/web      React 19 + Vite 8 + Tailwind 4 board UI.
```

Dependencies flow one way: `core` ← `runtime` ← `web`. The web app is the only place that knows about the network
(`@klbsjpolp/realtime-core` in `apps/web/src/online/`); the runtime stays transport-agnostic on purpose.

## Commands

pnpm workspace, Node 22.12+, 24 or 26+ (Vitest 5 skips the odd releases). `pnpm install` first — CI installs from the lockfile, so commit it when deps change.

```bash
pnpm dev          # web app on http://localhost:5173
pnpm test         # vitest, all three packages
pnpm typecheck    # tsc --noEmit, all three
pnpm lint         # prettier --check, then eslint on all three
pnpm format       # prettier --write (run this before lint if format:check fails)
pnpm build        # core → runtime → web
```

Run **`pnpm peers check && pnpm lint && pnpm typecheck && pnpm test`** before committing — that is what CI runs (on
Node 22 and 24), plus `pnpm build`. `peers check` only says anything after a dependency change, but then it is the one
step that fails in CI and nowhere else.

The full gate takes about a minute and a half, most of it `pnpm lint` (prettier walks the whole tree) and the web
tests. While iterating, check only what you touched and leave the full gate for the end:

```bash
pnpm exec prettier --check --ignore-unknown $(git diff --name-only --diff-filter=d HEAD)   # git add -N new files first
pnpm --filter @backgammon/core test                       # one package
pnpm --filter @backgammon/web exec vitest run src/useLocalGame.test.ts   # one file
pnpm --filter @backgammon/web exec eslint src/components/Board.tsx       # one file's lint
```

## Board coordinates — read this before touching `core`

`Board.points` is 24 signed counts: **positive = white, negative = black, 0 = empty**, absolute index 0..23. White
moves 23 → 0 and bears off below 0 (home 0..5); black is the mirror. `BAR = -1` and `OFF = 24` are the sentinels in
`Move.from` / `Move.to`.

All rule logic runs in a **normalized frame** (`moves.ts`) where the mover always travels 23 → 0, enters onto 18..23
and bears off below 0. White is the identity, black is mirrored across index 23 with the sign flipped. **Never
special-case black in rule code** — normalize, decide, map back with `toAbsIndex`.

The UI numbers points a third way: each player sees their own 1..24, counting from the point they bear off from
(`Board.tsx`). Engine index, normalized index, and displayed number are three different things — don't mix them.

## Invariants that are easy to break

- **`playMove` validates; `applyLegalMove` does not.** An unvalidated move silently corrupts the board (checkers
  deleted, a die that was never rolled left unconsumed). Only the AI search may use `applyLegalMove`, because it just
  took the move out of `currentLegalMoves`. Anything reachable from the network or the UI goes through `playMove`.
- **Relayed state is parsed, never cast.** `parseGameState` / `parseHostSnapshot` in `runtime/src/stateSchema.ts` are
  the guest's edge. Their declared return types are what keep them in step with `GameState` — if you add a field there
  and forget the schema, it stops compiling. That is deliberate; fix the schema rather than the signature.
- **The wire is a compatibility contract.** Hosts and guests run independently deployed versions, and updates are
  deferred mid-game, so a host one release behind is ordinary. A field you _add_ must be tolerated as absent —
  `.nullish().transform((v) => v ?? null)`, not `.nullable()`. A dropped frame is `console.warn`ed, because a silent
  incompatibility is the worst version of this bug.
- **`directShots` has two callers.** `evaluateBoard` weighs it for checker play, `winProbability` for cube decisions.
  Changing what counts as a shot silently re-tunes doubling, which no checker-play measurement covers — `entryShots`
  is a separate term added only in `evaluateBoard` for exactly that reason.
- **Checker count is 30, always.** Any change to `applyMove` / bearing off wants a test that asserts it.
- **The version in `package.json` is derived, never hand-edited.** `commit-and-tag-version` computes it from the
  commit history on every push to `main`. Don't touch it, `CHANGELOG.md`, or the tags.

## Changing the AI evaluation

`evaluateBoard` is tuned, not derived, and reasoning about it is wrong often enough that nothing goes in unmeasured.

- **Duel it, and read the margin.** `packages/backgammon-core/scripts/duel.ts` plays seeded games between two copies
  of core and scores points rather than wins. Games are dealt in pairs, one seed played once from each side, because
  the seed asymmetry alone moves the win rate ~2% and would otherwise read as a result. 600 games takes ~7s:

  ```bash
  git worktree add /tmp/base origin/main
  B=/tmp/base/packages/backgammon-core/src/index.ts       # absolute: pnpm runs it from the package
  pnpm --filter @backgammon/core duel --b $B             # your checkout (A) against main (B)
  ```

  It prints A's net points per game with a ±2 SE margin; a difference inside the margin is not a result. An engine
  against itself scores exactly zero, which is what to check if you change the harness. `--games` (even), `--seed`
  and `--no-cube` (checker play alone) are the knobs.

- **Most good-sounding terms measure as nothing.** A race branch, quadrant crossovers and four gammon-specific terms
  all tied or lost; what won was a stacking penalty, backgammon stakes and counting hits from the bar. DECISIONS.md
  records which and why the losers lost — read it before re-deriving one of them.
- **A term that can only subtract plays one-sided.** Entry shots at the board-shot weight talked the AI out of
  hitting, because the hit is what puts the checker on the bar it is then charged for.

## Web app conventions

Each rule here has its reason in a skill — `board-layout`, `add-theme` or `web-interaction` — and DECISIONS.md.
Load the skill before changing what the rule covers; the one-liners are here so nobody breaks one without knowing.

- **The board's size is one CSS length.** Everything is a multiple of `--pt`, as `board-*` tokens in
  `@theme inline` (required: `--pt` lives on `.board-fit`, not `:root`). Markup uses the tokens and contains no
  arithmetic. Page chrome is paid for out of `--avail-h` / `--avail-w`; after any change to either, run
  `pnpm --filter @backgammon/web layout`, which screenshots six viewports and fails if any of them scrolls.
- **The interface is French.** Every visible string, accessible name, placeholder and error banner — there is no
  i18n layer, on purpose. Engine vocabulary (`white`, `gammon`, …) reaches the screen through
  `apps/web/src/lib/french.ts`, never translated at the point of use, and a sentence capitalises its own first word
  (no CSS `capitalize`). Code, comments, commits and docs stay English.
- **Colours come from the theme layer** (`apps/web/src/theme/themes.css`). No component names a palette colour, alpha
  is baked into the variable rather than a `/60` modifier, and every theme passes `contrast.test.ts`.
- **One live region, always mounted.** `TurnAnnouncer` is the only one and sits beside `GameLayout`, not inside
  `TurnStatus`; anything that moves the status leaves it where it is. Points out of play are `aria-disabled` with
  `tabIndex={-1}`, never `disabled`.
- **Both game modes share their chrome.** `TurnStatus`, `TurnControls` and `useCheckerSelection` are the one copy;
  the panels differ only in wiring. A drag goes through the same selection (`selectFrom`, `moveChecker`), and its
  scroll lock (`touch-action: none` plus a cancelled `touchmove`) is what keeps iOS from stealing it.
- The rules engine is the state machine (`phase`: rolling → moving → doubleOffered → gameOver). React hooks drive it;
  there is no XState here on purpose.
- **`location.reload()` does not pick up a deploy** — the service worker re-serves the precached build. Go through
  `reloadApp`; keep the worker in `prompt` mode and `runtime-config.json` out of every cache.

## Skills in this repo

`.claude/skills/` holds the recipes for the changes that are easiest to get subtly wrong. Reach for them by name:
`core-rules` (the rules engine and its coordinate frames), `change-game-state` (anything crossing the wire between
host and guest), `board-layout` (`--pt` and the page's height budget), `add-theme` (palette plus the contrast gate),
`web-interaction` (selection, drag, the announcer, updates) and `record-decision` (the house style for
`DECISIONS.md` entries and commit bodies). `/check` runs the CI gate and fixes what it can.

## Code style

- TypeScript strict everywhere, `noUnusedLocals` / `noUnusedParameters` on. Arrow-function consts over `function`.
- Type-only imports use `import type` (`consistent-type-imports`, separate statements) — eslint enforces it.
- `console.log` is an eslint error; `console.error` / `warn` / `info` are allowed.
- Prettier: 120 columns, single quotes, semicolons, trailing commas. `pnpm format` settles all arguments about it.
- **Comments explain why, not what.** The codebase's comments are load-bearing: they record the failure a line
  prevents or the constraint it satisfies. Match that — a comment restating the code is worse than none.

## Tests

Vitest. Core and runtime keep tests in `tests/`; the web app colocates `*.test.tsx` beside the component and uses
jsdom + Testing Library. `createRng(seed)` in `core` gives deterministic dice — use it instead of stubbing
`Math.random`. Test through the public API of a package rather than its internals.

`npx vitest run --coverage --coverage.reporter=text` inside a package lists uncovered lines. Codecov comments on
every PR and flags changed lines no test reaches.

`apps/web/vitest.setup.ts` exists only to hand the web tests a working `localStorage` on Node ≥ 25, which defines an
inert one that Vitest's jsdom environment then refuses to overwrite. It is inert itself on the Node versions CI runs;
delete it once Vitest handles the collision.

## Commits

Conventional Commits, enforced by commitlint in a husky `commit-msg` hook. Scopes in use: `core`, `runtime`, `web`;
`docs`, `chore`, `ci` are usually unscoped. `feat:` and `fix:` move the version, so pick the type honestly.

The subject is lowercase and says what changed in plain words, not in jargon —
`fix(web): announce from a live region that is already there`, not `fix(web): fix a11y issue`. **The body is where the
real work is**: what was wrong, why the obvious fix was not the fix, what it costs. Look at `git log` before writing
one; the bar here is high. `pnpm commit` walks through a conforming message interactively.

**Record decisions in `DECISIONS.md`** when you make one worth defending — a trade-off, a constraint discovered the
hard way, a thing deliberately not done. Prose in the same voice as the rest of that file, not bullets of what you
typed.

## Pull requests

CodeRabbit does not review this repository on its own (it has fewer than 10 stars). After opening a PR, **tick the
"🔍 Trigger review" box** in the comment CodeRabbit posts on it — edit that comment, turning its `- [ ]` into `- [x]`,
and leave the rest of the body untouched — then address the review it posts.
