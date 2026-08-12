import { z } from 'zod';
import type { GameState } from '@backgammon/core';
import type { HostSnapshot } from './hostRuntime.js';
import { CHECKERS_PER_SIDE, POINT_COUNT } from '@backgammon/core';

/**
 * The shape of a relayed {@link GameState}.
 *
 * The host already refuses to *apply* anything a guest sends that is not a legal
 * action — that is what `backgammonActionSchema` and `BackgammonHost` are for.
 * This is the other direction, and it was the missing half: a guest rendered
 * whatever arrived on the wire as a `GameState` with no check at all, so one
 * malformed or truncated frame reached the board as `undefined` and took the
 * whole page down. Anything relaying game state is untrusted input, whichever
 * end it comes from.
 *
 * It checks structure, not strategy — a board that parses can still be one no
 * sequence of moves could reach. Guests do not re-derive the game; the host is
 * authoritative over what is *true*, and this is only about what is *renderable*.
 */
const playerSchema = z.enum(['white', 'black']);

const perPlayerCount = z.object({
  white: z.number().int().min(0).max(CHECKERS_PER_SIDE),
  black: z.number().int().min(0).max(CHECKERS_PER_SIDE),
});

const boardSchema = z.object({
  points: z.array(z.number().int().min(-CHECKERS_PER_SIDE).max(CHECKERS_PER_SIDE)).length(POINT_COUNT),
  bar: perPlayerCount,
  off: perPlayerCount,
});

const dieSchema = z.number().int().min(1).max(6);
const rollSchema = z.tuple([dieSchema, dieSchema]);

export const gameStateSchema = z.object({
  board: boardSchema,
  turn: playerSchema,
  phase: z.enum(['rolling', 'moving', 'doubleOffered', 'gameOver']),
  roll: rollSchema.nullable(),
  // Four at most: a double is played as four moves of the same die.
  remaining: z.array(dieSchema).max(4),
  cube: z.object({ value: z.number().int().positive(), owner: playerSchema.nullable() }),
  doubleOfferedBy: playerSchema.nullable(),
  noPlay: z.object({ player: playerSchema, roll: rollSchema }).nullable(),
  result: z
    .object({
      winner: playerSchema,
      kind: z.enum(['single', 'gammon', 'backgammon']),
      points: z.number().int().positive(),
      cubeValue: z.number().int().positive(),
    })
    .nullable(),
});

/**
 * Parses a relayed payload into a {@link GameState}, or returns null when it is
 * not one. Null means "ignore this frame and keep the last good state" — a guest
 * that drops a bad frame stays on a board it can draw, which beats replacing a
 * playable game with a blank page.
 */
export const parseGameState = (payload: unknown): GameState | null => {
  const parsed = gameStateSchema.safeParse(payload);
  // The declared return type is what keeps this schema honest: add a field to
  // `GameState` and forget it here, and the inferred parse result stops being
  // assignable to it — the mismatch is a compile error, not a runtime surprise.
  return parsed.success ? parsed.data : null;
};

/**
 * The shape of a {@link HostSnapshot}. Seat indices are whatever the server
 * hands out, so they are only required to be non-negative integers; the host's
 * own `restore` is what insists the seating and the colours line up.
 */
export const hostSnapshotSchema = z.object({
  state: gameStateSchema,
  seating: z.array(z.number().int().min(0)).length(2),
  players: z.record(z.string(), playerSchema),
});

/** Parses a relayed snapshot, or returns null when it is not one. */
export const parseHostSnapshot = (payload: unknown): HostSnapshot | null => {
  const parsed = hostSnapshotSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
};
