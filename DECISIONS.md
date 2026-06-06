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
  multiplies by the cube.
- **Single games** (play to a win), not match play.

## Stack

- Same primary libraries as skip-bo: React 19, Vite 8, Tailwind 4, Vitest 4, zod 4,
  immer 11, TypeScript 6, pnpm.
- **XState was intentionally omitted** (skip-bo uses it). Backgammon's turn FSM
  (rolling → moving → doubleOffered → gameOver) is already owned by `@backgammon/core`
  as pure transitions, so the web app drives it with a thin React hook instead of
  duplicating the machine in XState. Revisit if the online turn loop needs it.

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

## Deferred

- Match play, Crawford rule, Jacoby rule.
- Stronger AI still possible (current bot does full move-sequence search with a
  shot-aware evaluation — much stronger than the original greedy pick, but not equity-based).
- PWA, Sentry, theme system, Playwright e2e.
- Online polish: reconnection/resume parity with skip-bo, richer lobby (names, kicking),
  animation/drag-and-drop (v1 uses click-to-move).
