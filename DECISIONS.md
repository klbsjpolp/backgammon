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
- The runtime does **not yet import** `@klbsjpolp/realtime-core`. That package isn't on
  npm yet, and v1 ships local play, so taking a hard dependency on it now would block
  install/publish for no benefit. The actual realtime-core wiring (the web `online/` hook
  that encodes actions into relay envelopes and renders relayed views) lands once
  realtime-core is published — same finalize gate as skip-bo.

## Deferred (not in v1 scaffold) — see open questions

- Online multiplayer UI + the realtime-core hook (architecture is ready; see above).
- Match play, Crawford rule, Jacoby rule.
- AI strength beyond a simple heuristic (greedy pip/blot-aware bot).
- PWA, Sentry, theme system, Playwright e2e, full online lobby UI parity with skip-bo.
- Animation/drag-and-drop polish (v1 uses click-to-move).
