# Backgammon — recorded decisions

Decisions made while scaffolding this repo (autonomously, per the user's "do what
you think and record it" instruction). Open questions are at the bottom.

## Architecture

- **Separate repo**, pnpm workspace, mirroring skip-bo's structure and stack. Reuses
  the shared multiplayer infra from
  [`realtime-infra`](https://github.com/klbsjpolp/realtime-infra) by consuming
  `@klbsjpolp/realtime-core` from npm.
- **Internal package scope `@backgammon/*`**: `@backgammon/core` (rules),
  `@backgammon/runtime` (host-authoritative binding to the relay), `@backgammon/web`.
- **Host-authoritative online play**, identical model to skip-bo: one client (seat 0)
  runs `@backgammon/core` and relays state through the game-agnostic server. Backgammon
  is a **perfect-information** game, so unlike skip-bo there is **no hidden-information
  redaction** — the host relays the full board to every seat.

## Rules scope (v1)

- Standard backgammon: 24 points, 15 checkers/side, standard starting position.
- Full move rules: direction per player, two dice, **doubles play four moves**, entering
  from the bar before any other move, hitting blots (send to bar), bearing off (all 15 in
  home board; overshoot allowed only from the highest occupied point).
- Legal-move generation enforces the "must use both dice if possible; if only one can be
  played, play the higher" rule.
- **Doubling cube** is modelled in core (value, owner, offer/take/drop) and detected in
  the runtime/UI. Win detection includes **single / gammon (2×) / backgammon (3×)** and
  multiplies by the cube. The AI turns the cube too — see below.
- **Single games** (play to a win), not match play.

## AI

- **Checker play**: full search over every legal move sequence for the dice (capped at
  60k nodes), keeping the sequence whose resulting board evaluates highest. The evaluation
  weighs the pip race, made points, home-board structure, primes and direct shots at blots.
- **Cube play**: `winProbability` estimates the AI's chances from the pip race, corrected
  by primes, blot exposure and checkers on the bar, then squashed through a logistic scaled
  by how much race is left. It is a heuristic for cube decisions, not a rollout — it puts
  the opening position at ~0.54 for the player on roll. `shouldDouble` fires inside the
  classic window (0.68–0.85: strong enough to gain, not so strong that playing on for the
  gammon beats cashing) and `shouldTakeDouble` uses a take point of 0.22, a little under the
  textbook 25% to account for owning the cube after taking.

## Trust boundaries

Three places take input that the rest of the code cannot vouch for, and each is
now checked at the edge rather than assumed correct further in.

- **`playMove` validates.** It used to apply whatever `Move` it was handed. An
  illegal one could not fail loudly — it wrote a board the rules can no longer
  produce and play carried on from there: a die that was never rolled went
  unconsumed (so the turn could never end), and landing on a made point
  overwrote every checker standing on it, which is checkers _deleted_ from a
  game whose whole invariant is that there are thirty of them. Nothing reached
  it that way in practice — the host looks moves up in the legal set and the
  hooks only offer what the generator returned — but "no caller does this" is
  not a property anything was checking, and the failure mode was silent
  corruption rather than an error. `playMove` now checks the move against
  `legalMoves` and throws otherwise. `applyMove` reads whether a move hits off
  the board instead of trusting `Move.hit`, which is an _output_ of the
  generator describing what the move will do, not an instruction to it.

  The AI search would pay for that check at every node, having just taken its
  move out of `currentLegalMoves` — so `applyLegalMove` is the unchecked path,
  documented as being for callers that did exactly that, and `playMove` is
  validate-then-`applyLegalMove`. "Unchecked" has one exception: it still
  insists the die is among the remaining ones, because at `indexOf === -1` the
  two slices that remove it overlap and `remaining` _grows_ instead — handing
  the mover a die nobody rolled and a turn that cannot end. That check costs the
  `indexOf` it was already doing. The one caller that could go either way is the
  host, which keeps the validating one: it is the online trust boundary, it pays
  the cost once per network action rather than once per search node, and it
  should stay correct even if the lookup above it ever drifts.

- **Relayed state is parsed, in both directions.** The host already refused to
  apply any action a guest sent that was not legal (`backgammonActionSchema` and
  `BackgammonHost`); the other direction had nothing. A guest rendered whatever
  arrived as `msg.payload as GameState`, so a truncated or malformed frame
  reached the board as `undefined` and took the page down with it.
  `gameStateSchema` and `hostSnapshotSchema` in `@backgammon/runtime` close
  that: a view that does not parse is dropped and the last good board stays on
  screen, and a snapshot that does not parse is refused rather than resumed
  from. They check that the state is _renderable_, not that it is reachable by
  legal play — the host stays authoritative over what is true. The declared
  return types of `parseGameState` and `parseHostSnapshot` are what keep them in
  step with the types: add a field to `GameState` and forget the schema, and it
  stops compiling.

  **A schema on a wire is also a compatibility contract**, which is the easier
  half to get wrong. Both ends are versioned independently and updates are
  deferred while a game is in progress, so a host on the previous release
  talking to a guest on the current one is ordinary rather than exotic. A field
  this project _adds_ must therefore be tolerated as absent — `noPlay` is
  `.nullish().transform((v) => v ?? null)`, not `.nullable()`, because requiring
  the key would have rejected every frame an older host sends and frozen the
  guest's board for the rest of the game. A dropped frame is also `console.warn`ed:
  "the next broadcast repairs it" is true of a corrupt packet and false of an
  incompatibility, and the silent version of that failure is the worst one to
  debug.

  A snapshot answers a harder question than a view — not "can this be drawn" but
  "can the game be resumed from this" — so `hostSnapshotSchema` checks across
  fields that the seating and the colours line up. `BackgammonHost.setSeating`
  builds its maps and only then commits them, so a host that refuses a snapshot
  is still the host it was; it used to clear the live maps before validating and
  leave itself with no colours at all.

- **An `ErrorBoundary` wraps the app.** React unmounts the whole tree when a
  render throws, so anything that got past the two checks above still showed as
  a blank white page with no way out but the browser's own reload — on a phone,
  indistinguishable from the app being broken for good.

## A roll nobody can play

Rolling into a position with no legal move — usually a failed entry from the bar
— passes the turn straight back, and passing it clears `roll`. The dice were
therefore gone before anything had drawn them: the player was told nothing at
all and simply found that it was suddenly not their move. The same in reverse
hid the AI's dances completely.

`GameState.noPlay` carries the roll that could not be played, and the status line
says so. It is held until the player who rolled it rolls again, rather than being
cleared by the next roll of any kind, so it stays up for the whole of the
opponent's reply instead of flashing past inside the AI's think time.

## Accessibility

The board was a grid of 27 buttons that all announced the same way and all sat in
the tab order, whether or not they could be played, saying nothing about what was
standing on them. It now reads as a board:

- Every point names its occupancy (`point 13, 5 white checkers`) and its role in
  the move being made — holding the checker, having one you can move, or being
  somewhere it can go. The bar counts both sides in its name, since being on it
  decides the entire turn.
- Points that are not in play are `aria-disabled` and out of the tab order, so a
  Tab lands on the two or three points that can actually be played rather than
  on all 24. They stay in the accessible tree — a screen reader still reads the
  whole board — which is why this is `aria-disabled` and `tabIndex={-1}` rather
  than `disabled`, which drops the button out of the tree in some readers.
- **One** polite live region carries everything worth hearing — whose turn it
  is, what was rolled and what is left of it, and a roll nobody could play. It
  is `sr-only` and always mounted, and the visible spans carry no `aria-live` of
  their own, so nothing is said twice.

  Always mounted is the load-bearing part. A live region has to be in the
  accessible tree _before_ its content changes for the change to be announced;
  one that appears together with its text is silent in NVDA, JAWS and VoiceOver
  alike. The first cut of this put `aria-live` on the no-play line and inside
  `<Dice>`, both conditionally rendered — and `<Dice>` is unmounted altogether
  until a roll lands, so it could never announce the roll that mounts it. That
  is why the dice are spoken from the status line rather than from the component
  that draws them: the board has nothing permanently on screen to say them from.

The colour side of this was already covered — `contrast.test.ts` holds every
theme to WCAG 3:1 for the board's state rings — which is what makes the gap
worth closing: the palette was being checked and the semantics were not.

## Board orientation

The board is drawn from the point of view of whoever is looking at it: `BoardController`
carries a `you` color, and black's layout is white's mirrored across the middle so that
**both players see their own home board bottom-right, next to their own bear-off tray**.
The near tray is always the viewer's, which is what lets either color bear off.

The points are **numbered the way the viewer counts them** — 1 is the point they bear off
from, 24 the furthest away — so the two players disagree about every point, which is how a
real board works. What was drawn before was the engine's array index (0..23, always in
white's direction): no backgammon board has a 0-point, and for black every number was
counting the wrong way.

## Phone layout

The board used to be drawn at a fixed pixel size (40px points), which overflowed any
phone in portrait. It is now derived from a single CSS length, `--pt` (the width of one
point), computed in `apps/web/src/index.css` as the largest unit that fits both the
width and the height the viewport still has free. Everything else — checkers, bar,
trays, labels, gaps — is a multiple of `--pt`, so one number rescales the whole board
and it never overflows. This is the same shape as Tailwind's own spacing scale
(`calc(var(--spacing) * n)`), with the base unit derived from the viewport rather than
constant; a fixed scale with breakpoint steps cannot express "fill exactly what is
left", which is the property that removes the overflow.

Those multiples are named `board-*` tokens declared in **`@theme inline`**, so the
markup reads `w-board-point` / `size-board-checker` / `gap-board-gutter` and contains no
arithmetic — the interlocking ratios (12 points + bar + tray + gutters must add up to
the 17 the width divisor assumes) all sit together in one block. `inline` is required
rather than incidental: `--pt` is declared on `.board-fit`, not `:root`, so the
utilities have to carry the expression and evaluate it on the element that inherits
`--pt`. A plain `@theme` would resolve them against `:root`, where `--pt` does not
exist. It also keeps the global surface empty — `inline` emits no variables, only the
utilities the board actually uses.

Three cases, all CSS-only (no resize observers, no JS breakpoints):

- **Portrait phone** (`≤640px` wide): the board is **turned a quarter turn** — a board
  is twice as wide as it is tall, the worst possible fit for a portrait screen, and laid
  out flat it leaves most of the height empty while shrinking the checkers to a couple of
  millimetres. Rotating swaps the axes and buys ~50% larger points. Your home board and
  tray land bottom-left; `.board-label` turns the text back upright. Hit testing follows
  the transform, so clicking is unaffected.
- **Landscape phone** (`compact` variant: landscape and `≤640px` tall): the controls move
  into a column _beside_ the board instead of under it, where they used to sit below the
  fold and under the thumb rest. The primary buttons are a two-up grid there so take/drop
  and clear-selection still fit; the hint line is dropped.
- **Anything roomier**: unchanged — `--pt` caps at the original 40px.

`--pt` is only ever as large as the room left over, so every fixed thing on the page is
paid for by the checkers. Three rounds of that, after the board still came out too small
to play on a phone:

- **A checker fills its point** (0.85 × `--pt`, less the point's own border and padding,
  which are fixed pixels and so eat a growing share as `--pt` shrinks). The 0.68 it used
  to be left a margin all the way around every checker — the single largest waste on the
  board, and the one nothing else could buy back.
- **Deep stacks overlap**, so a point is 3.85 × `--pt` deep rather than the ~4.6 five
  full-size checkers laid flat would need: `.board-stack` closes the gap at four and
  overlaps at five, and sizing every point for the deepest case instead would cost the
  whole board ~20% for a case that arises on two or three points at a time. Two point
  depths plus the gutters and padding are what the height divisor (8.6) counts.

  How deep the stack is comes from a **`data-stack` attribute the component writes**, not
  from `:has(> :nth-child(n))` counting the children in CSS. The `:has()` version read
  better and was wrong on WebKit: landing a checker on a point did not re-evaluate it, so
  a point that grew to five kept the flat spacing and spilled past its own border until
  something forced a full style recalc — rotating the phone, most visibly. The attribute
  is invalidated by the same DOM write that changes the count, so the two cannot disagree.

- **The page chrome was measured, not guessed.** The dice moved out of the board's own
  column and up into the header row beside the title — the one row every layout already
  pays for — the status line and the header row were tightened, and the version footer is
  dropped in landscape. What is left is what `--avail-h` / `--avail-w` reserve, down from
  22rem to 18.5rem in portrait and from 7.5rem to 3.5rem in landscape, and the board now
  has the full width of the screen (portrait) or of everything but the sidebar
  (landscape) to be drawn in.

  Anything riding in that row still costs the board height, so the dice are drawn as
  **pips with the ones already played faded**, rather than spelled out beside a
  "remaining: 6, 5" line: the same information in a third of the width, and four pips on
  doubles say what four moves are coming better than the text did. The title is the item
  that gives when a narrow phone runs out of row, as it already was for the switches; the
  slot reserves its width so that a roll landing does not re-truncate the heading
  mid-turn. The board still owns the dice — only it knows what was rolled — and portals
  them into the slot, falling back to drawing them under itself when there is none.

  On a phone the pips are set to **the height of the header row** (1.875rem) rather than
  to the title's size. The die glyphs carry a lot of built-in padding — the drawn die is
  noticeably smaller than its font size — so matching the text around them left the roll
  a smudge at arm's length. It costs the board nothing: the mode switch opposite is the
  taller item and still sets the row's height, so `--avail-h` is unchanged. It costs the
  title, which was already the item that gives.

Between them the checkers came out ~85% larger in landscape and ~40% in portrait on a
modern phone, with the page still fitting the viewport exactly (no scroll). Where the
screen's height is what binds — a tall phone, either way up — the board is already using
every pixel of it and the last round bought nothing; the width it freed shows up on the
phones where width was the limit instead, ~15% on a small landscape screen. The
reservations subtract `env(safe-area-inset-*)` where the padding they stand for does:
the page is `viewport-fit=cover`, so a board that claims its full width in landscape
would otherwise claim the notch as well.

Destructive controls (**new game**, **leave**) are separated from the primary row and are
`ConfirmButton`s: one tap arms, a second confirms, and it disarms after four seconds or on
blur. On a phone they are a thumb-width from the board and a stray tap used to be
unrecoverable. **Once the game is over, new game confirms nothing** — there is no game
left to throw away, and the guard was then only friction between the result and the next
game. Every button carries a 44px minimum touch target, and the page reserves
`env(safe-area-inset-bottom)`.

## Themes

Three themes ship: **Classic** (green felt and brass, the original look),
**Midnight** (indigo, dark) and **Parchment** (cream paper and a wooden board — the
one light theme). The choice is remembered in `localStorage` under
`backgammon:theme`.

Everything hangs off one CSS layer, `apps/web/src/theme/themes.css`. Each theme is a
single block of semantic variables — `--surface`, `--muted`, `--danger`, `--felt`,
`--point-even`, `--checker-light`, `--pick`, … — and `@theme inline` maps them to
Tailwind utilities (`bg-surface`, `ring-pick`, `border-point-line`). No component
names a palette colour any more, so a fourth theme is one block plus one entry in
`themes.ts`; nothing else changes. Alpha is baked into the values rather than left
to `/60` modifiers in the markup, because how translucent a point sits on the felt
is a property of the theme and a light theme wants different numbers than a dark one.

Two consequences of declaring the variables on `[data-theme='…']` rather than only
on `:root`:

- The **switcher** is three swatches, each drawn _in_ the theme it selects: the
  swatch sets `data-theme` on itself, so the variables resolve inside it and you see
  the felt and accent you would get instead of a legend to decode. It also fits the
  header on a phone, where the mode switch has already eaten most of the width —
  a second header row would push the board past the height budget in
  `--avail-h`.
- `color-scheme` is set per theme, so the UA's own widgets (scrollbars, focus rings,
  form controls) follow along; Parchment is the only one that reports `light`.

The board's state signals are held to WCAG's 3:1 for non-text UI against **both**
point colours, and `contrast.test.ts` asserts it for every theme in the catalogue
rather than leaving it to the eye. Two rules fall out of that and are worth knowing
before adding a theme:

- **A ring's emphasis is distance from the surface, and the direction depends on the
  board.** On a dark felt "stronger" is lighter; on Parchment it is darker, because a
  mid-toned point leaves no room above it. `--pick-strong` must out-contrast `--pick`,
  not out-brighten it, which is the second thing the test checks.
- **A checker's edge is drawn by whichever of its body and its rim can be seen.** A
  pale checker on a dark point needs no rim; the same checker on cream, or a dark
  checker on a dark felt, is invisible without one, so the rim carries the 3:1 alone.
  Both dark themes needed their rims lifted for this — black checkers on a dark board
  were 2.66 and 1.35 against their points.

A small inline script in `index.html` applies the stored theme (and the matching
`<meta name="theme-color">`) **before first paint**, so a reload does not flash
Classic on its way to the chosen palette. It duplicates the storage key and the
theme ids from `themes.ts` on purpose — it has to run before any module loads.
Storage failures (Safari private browsing) degrade to "the theme switches but is
not remembered" rather than throwing.

## Stack

- Same primary libraries as skip-bo: React 19, Vite 8, Tailwind 4, Vitest 4, zod 4,
  immer 11, TypeScript 6, pnpm.
- **XState was intentionally omitted** (skip-bo uses it). Backgammon's turn FSM
  (rolling → moving → doubleOffered → gameOver) is already owned by `@backgammon/core`
  as pure transitions, so the web app drives it with a thin React hook instead of
  duplicating the machine in XState. Revisit if the online turn loop needs it.
- **The two game modes share their chrome.** `TurnStatus` and `TurnControls` are
  what the local and online panels have in common; both used to write the status
  string, the status bar and the roll/double/take/drop cluster out for
  themselves, which is exactly how they drifted — only the local one named the
  cube's owner, and only the local one spelled out the stake when a double was
  offered to you, though neither is a local concern. What is genuinely different
  is the wiring, and that is what the props are. The panels are the two hooks
  and the pieces they hand to `GameLayout`, nothing else.

## Online / realtime-infra integration

- The runtime is **transport-agnostic** and host-authoritative, deliberately shaped to
  plug into `@klbsjpolp/realtime-core`: `BackgammonAction` is the opaque `relay.move`
  payload, the host validates+applies and rolls dice authoritatively, and `serializeView`
  produces the per-seat view the host relays. This mirrors skip-bo's split.
- The runtime itself stays transport-agnostic (no realtime-core import). The **web app**
  wires the relay: `apps/web/src/online/` consumes `@klbsjpolp/realtime-core` for the HTTP
  room API and the WebSocket relay protocol.

## Online multiplayer — IMPLEMENTED

- `apps/web/src/online/useOnlineGame.ts` is the host-authoritative online hook:
  - HTTP create/join room (`api.ts`), WebSocket auth, lobby presence, `startGame`.
  - On `gameStarted` the host seat builds a `BackgammonHost` (seating + the server's
    `currentSeatIndex` as the first turn) and broadcasts the full state via `relay:view`;
    guests render relayed views and send action intents via `relay:move`.
  - Dice are rolled by the host only. The host keeps the server's turn pointer in sync
    via `setTurn`, stores a `snapshot` for reconnect, and sends `endGame` on a win.
  - Backgammon is perfect-information, so the broadcast view is the full `GameState`.
- The web app depends on `@klbsjpolp/realtime-core ^0.1.0`. **Until that is published**,
  a temporary `file:` override in `pnpm-workspace.yaml` resolves it from a local tarball;
  the lockfile is left pending. Finalize: publish realtime-core, remove the override,
  `pnpm install`, then set the `VITE_BACKGAMMON_API_URL` secret. (Same gate as skip-bo.)
- A `Deploy` workflow ships the web app to GitHub Pages.

## Releasing under a branch ruleset

- The `Deploy` workflow cuts the release itself — version bump, CHANGELOG, tag, and a
  push straight to `main` — so protecting `main` puts the workflow on the wrong side of
  its own ruleset. `GITHUB_TOKEN` cannot satisfy a ruleset, so `RELEASE_PUSH_TOKEN` is
  **required**, not an optimisation. It used to fall back to `github.token`, which read
  as a graceful degradation and was not one: it only moved the failure from checkout to
  the push, by which point `commit-and-tag-version` had already written the commit and
  the tag. The job now refuses before checkout when the secret is missing.
- **The release job clears its own debris.** `--atomic` stops a new orphan tag appearing;
  it does nothing about the one already published, and that one is self-perpetuating —
  every run recomputes the same version and dies on `tag already exists`, so the pipeline
  cannot heal on its own. A step before the release reads the version a dry run is about
  to cut and deletes that tag if it exists and its commit is **not reachable from `main`**,
  which is the one case where it can only be debris: a tag from a release that landed is
  by definition on `main`. A tag that _is_ reachable stops the job rather than being
  touched — at that point something is wrong that deleting a release tag would only hide.
- **The release push is `--atomic`.** `git push --follow-tags` updates the branch and the
  tag as independent refs, so the declined push still published `v0.1.17` while leaving
  its release commit unreachable — and every run after that recomputed the same version
  and died on `fatal: tag 'v0.1.17' already exists`. A half-applied release is worse than
  a failed one, because it poisons the next one; all-or-nothing is the only shape that
  degrades safely here.
- **`workflow_run` fires on completion, not on success.** Chaining Deploy to CI that way
  reads as "deploy what CI proved", but the event carries a `conclusion` that has to be
  checked or a red CI ships anyway. The gate lives in the `release` job's `if`, alongside
  the `github-actions[bot]` actor guard, rather than in a separate job — one condition,
  and skipping `release` skips everything downstream of it.

## Deferred

- Match play, Crawford rule, Jacoby rule.
- Opening roll to decide who starts (white starts locally; online the server's
  `currentSeatIndex` decides).
- Undoing a checker move before the turn is committed.
- Stronger AI still possible: checker play is a full move-sequence search with a shot-aware
  evaluation, and cube decisions come off a heuristic win-probability estimate — neither is
  equity-based, and rollouts would beat both.
- PWA, Sentry, Playwright e2e.
- Online polish: reconnection/resume parity with skip-bo, richer lobby (names, kicking),
  animation/drag-and-drop (v1 uses click-to-move). A dropped socket still ends the
  game for that seat: `useOnlineGame` reports `disconnected` and stops there,
  though the seat token it would need to resume is sitting in `sessionRef`.
- The `dist/` output of `@backgammon/core` and `@backgammon/runtime` is built by
  `pnpm build` and consumed by nothing: both packages point `exports` at their
  TypeScript sources, which is what lets the web app's dev server and HMR reach
  into them. The build is therefore a second type-check of what `pnpm typecheck`
  already checks. Left as it is on purpose — pointing `exports` at `dist` would
  buy nothing until one of these packages is published, and would cost the
  source-level dev loop.
