# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

A backgammon game: a pure rules engine, a host-authoritative runtime for online play, and a React board.
[README.md](README.md) is the user-facing tour; **[DECISIONS.md](DECISIONS.md) is the reference** — it records why
things are the way they are, and most of the traps below are explained there in full.

```
packages/backgammon-core      @backgammon/core     rules: board, dice, moves, cube, AI. No React, no I/O.
packages/backgammon-runtime   @backgammon/runtime  host runtime + zod schemas for the wire. No transport.
apps/web                      @backgammon/web      React 19 + Vite 8 + Tailwind 4 board UI.
```

Dependencies flow one way: `core` ← `runtime` ← `web`. The web app is the only place that knows about the network
(`@klbsjpolp/realtime-core` in `apps/web/src/online/`); the runtime stays transport-agnostic on purpose.

## Commands

pnpm workspace, Node >= 22.12. `pnpm install` first — CI installs from the lockfile, so commit it when deps change.

```bash
pnpm dev          # web app on http://localhost:5173
pnpm test         # vitest, all three packages
pnpm typecheck    # tsc --noEmit, all three
pnpm lint         # prettier --check, then eslint on all three
pnpm format       # prettier --write (run this before lint if format:check fails)
pnpm build        # core → runtime → web
```

Run **`pnpm lint && pnpm typecheck && pnpm test`** before committing — that is what CI runs (on Node 22 and 24), plus
`pnpm build`. Single package: `pnpm --filter @backgammon/core test`. Single file: `pnpm --filter @backgammon/web exec
vitest run src/useLocalGame.test.ts`.

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

- **Duel it, and run base-against-base first.** `npx tsx` a scratch script importing
  `packages/backgammon-core/src/index.js`, play N seeded games swapping sides every game, and score points rather
  than wins. The seed asymmetry alone moves the win rate ~2%, so without that control you will read noise as a
  result. 600 games takes ~10s.
- **Most good-sounding terms measure as nothing.** A race branch, quadrant crossovers and four gammon-specific terms
  all tied or lost; what won was a stacking penalty, backgammon stakes and counting hits from the bar. DECISIONS.md
  records which and why the losers lost — read it before re-deriving one of them.
- **A term that can only subtract plays one-sided.** Entry shots at the board-shot weight talked the AI out of
  hitting, because the hit is what puts the checker on the bar it is then charged for.

## Web app conventions

- **The board's size is one CSS length.** `--pt` (the width of one point) is computed in `apps/web/src/index.css` as
  the largest unit fitting the width and height the viewport has left; everything else is a multiple of it, declared
  as `board-*` tokens in `@theme inline`. Markup uses the tokens (`w-board-point`, `size-board-checker`) and contains
  no arithmetic. If you add page chrome, you spend the board's height — update `--avail-h` / `--avail-w` to match, and
  check a portrait phone and a landscape one (the `compact` variant).
- **`@theme inline` is required, not incidental.** `--pt` lives on `.board-fit`, not `:root`, so the utilities have to
  carry the expression and evaluate it where `--pt` is inherited.
- **Colours come from the theme layer.** `apps/web/src/theme/themes.css` holds one block of semantic variables per
  theme (`--felt`, `--point-even`, `--pick`, …) mapped to utilities. **No component names a palette colour**, and
  alpha is baked into the variable rather than written as a `/60` modifier in the markup. Adding a theme is one block,
  one entry in `themes.ts`, one id in the pre-paint script in `index.html` — and it must pass `contrast.test.ts`,
  which holds every theme to WCAG 3:1 for the board's state rings against both point colours.
- **Accessibility is tested, not aspirational.** There is exactly **one** always-mounted `sr-only` polite live region
  (`TurnAnnouncer`) and it carries everything worth hearing. A live region must be in the tree _before_ its content
  changes or nothing is announced — never render one together with its text. That is why the panels mount it as a
  **sibling of `GameLayout`** rather than inside `TurnStatus`: fullscreen draws the status inside the board's frame,
  and a subtree that changes position in the tree is rebuilt, not moved — which put the region back on screen together
  with its text on every toggle. Anything that relocates the status must leave the announcer where it is. Points out
  of play are `aria-disabled` with `tabIndex={-1}` (not `disabled`, which drops them from the accessible tree in some
  readers).
- **Both game modes share their chrome.** `TurnStatus` and `TurnControls` are common to `LocalPanel` and
  `OnlinePanel`; only the wiring differs. Don't re-implement status text in a panel — that is exactly how they drifted
  apart before. The same goes for holding a checker and playing it: `useCheckerSelection` is the one copy, and the two
  games differ only in what playing a move does (apply it, or relay it).
- **A drag is the click flow entered from the other end**, not a second way to play a move — `useCheckerDrag` holds the
  source with `selectFrom` and plays with `moveChecker`, so letting go over nothing leaves the checker selected. The
  scroll lock is load-bearing: `touch-action: none` on the drag sources plus a `touchmove` that is cancelled for the
  length of a touch gesture, or iOS hands the drag to the page scroller half way through. A release resolves against
  `data-drop-zone` rects, and a zone under the pointer answers for itself — the points tile, so reaching past one to a
  neighbour plays a move nobody aimed at.
- The rules engine is the state machine (`phase`: rolling → moving → doubleOffered → gameOver). React hooks drive it;
  there is no XState here on purpose.
- **A service worker precaches the bundle, so `location.reload()` no longer picks up a deploy** — it re-serves the
  precached build. `reloadApp` hands over to the waiting worker first and only then reloads; anything that wants to move
  the app onto a new version goes through it. The worker is registered in `prompt` mode because `useAppUpdates` owns
  _when_ a reload is safe, and `runtime-config.json` must stay out of every cache or a tab cannot notice a new release.

## Skills in this repo

`.claude/skills/` holds the recipes for the changes that are easiest to get subtly wrong. Reach for them by name:
`core-rules` (the rules engine and its coordinate frames), `change-game-state` (anything crossing the wire between
host and guest), `board-layout` (`--pt` and the page's height budget), `add-theme` (palette plus the contrast gate),
and `record-decision` (the house style for `DECISIONS.md` entries and commit bodies). `/check` runs the CI gate and
fixes what it can.

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
