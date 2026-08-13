---
name: change-game-state
description: Add or change a field on GameState, BackgammonAction or HostSnapshot without breaking online play between mismatched versions. Use when touching core's types.ts, runtime's stateSchema.ts / actionSchema.ts, or when a guest's board freezes or a frame is dropped.
---

# Changing what goes over the wire

`GameState` is not just an internal type: the host relays it to guests, and **the two ends run independently
deployed versions**. Updates are deferred while a game is in progress, so a host one release behind a guest is an
ordinary Tuesday, not an exotic case. Every change here is a compatibility question first.

## The order to do it in

1. **`packages/backgammon-core/src/types.ts`** — the field, with a comment saying what it is _for_. If the turn state
   could already carry it, it does not belong here; `noPlay` exists because passing the turn clears `roll`, and that
   reasoning is the comment.
2. **`packages/backgammon-runtime/src/stateSchema.ts`** — the matching schema entry. You cannot skip this: the
   declared return type of `parseGameState` is `GameState | null`, so a field added to the type and forgotten here
   makes the parse result unassignable and **`pnpm typecheck` fails**. That is the design. Fix the schema, never the
   signature.
3. **Producers** — `game.ts` transitions must set it, and `createInitialState` must have a value for it.
4. **Consumers** — `TurnStatus` if it is worth saying out loud, the panels/hooks otherwise.

## The compatibility rule

A field this project **adds** must be tolerated as _absent_, not merely null:

```ts
noPlay: z.object({ … }).nullish().transform((value) => value ?? null),
```

`.nullable()` would have required the key and rejected **every** frame an older host sends — the guest's board then
freezes for the rest of the game, which is far worse than not having the feature. The `.transform` is what keeps the
parsed result assignable to `GameState`.

Removing or renaming a field is the harder direction and usually is not worth it: keep accepting the old shape for at
least one release, or you break the game for whoever has a tab open.

A frame that fails to parse is dropped with a `console.warn` and the last good board stays on screen. Keep the warn.
"The next broadcast repairs it" is true of a corrupt packet and false of a version incompatibility, and the silent
version of that failure is the one nobody can debug.

## Snapshots ask a harder question

`hostSnapshotSchema` is not "can this be drawn" but "can the whole game be resumed from this", so it carries
cross-field `.refine`s — every seat has a colour, and the two seats hold different ones. A well-formed record is not
a usable seating: `{}` satisfies the shape and leaves the host with no colours at all. If you add anything to
`HostSnapshot`, ask what makes it _unresumable_ and refine on that.

`BackgammonHost.setSeating` builds its maps and only then commits them, so a host that refuses a snapshot is still
the host it was. Preserve that ordering.

## Actions are the other direction

`actionSchema.ts` guards what a guest sends to the host. The host validates and applies through `playMove` (never
`applyLegalMove`) and rolls all dice itself, so a guest cannot forge a roll. Anything you add to `BackgammonAction`
gets the same treatment: parse it, then check it against the legal set before it touches the state.

## Tests

`packages/backgammon-runtime/tests/hostRuntime.test.ts` is the place. Assert both directions of the skew you just
created: a frame **without** the new key still parses, and a frame with it round-trips. Use `createRng(seed)` for
deterministic dice.
