# Backgammon

A backgammon game built on the same stack as [skip-bo](https://github.com/klbsjpolp/skip-bo),
designed to reuse the shared multiplayer infrastructure in
[realtime-infra](https://github.com/klbsjpolp/realtime-infra).

## Layout

```
packages/backgammon-core      @backgammon/core     pure rules engine (board, dice, moves, cube, AI)
packages/backgammon-runtime   @backgammon/runtime  host-authoritative runtime + action schema
apps/web                      @backgammon/web      React + Vite + Tailwind board UI (local play vs AI)
```

The runtime is host-authoritative and transport-agnostic, shaped to plug into
`@klbsjpolp/realtime-core` for online play (the same model skip-bo uses). See
[DECISIONS.md](DECISIONS.md) for scope, rules, and what's deferred.

## Develop

```bash
pnpm install
pnpm dev          # web app on http://localhost:5173
pnpm build        # build core, runtime, then the web bundle
pnpm test         # vitest across all packages
pnpm typecheck
pnpm lint
```

## Status

v1 ships **local play** (you vs a heuristic AI) with full rules: bar/hit/bearing off,
the use-both-dice rule, doubling cube, and gammon/backgammon scoring. Online
multiplayer is architected but not yet wired (pending the `@klbsjpolp/realtime-core`
npm publish). See [DECISIONS.md](DECISIONS.md).
