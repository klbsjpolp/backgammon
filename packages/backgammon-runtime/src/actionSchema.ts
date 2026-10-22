import { z } from 'zod';

/**
 * The backgammon action a seat can request. Sent as the opaque `relay.move`
 * payload through the game-agnostic server; the host validates and applies it.
 * Dice are rolled authoritatively by the host (never trusted from a guest), so
 * the `roll` action carries no values — it is only an intent.
 */
export const backgammonActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('roll') }),
  z.object({
    type: z.literal('move'),
    from: z.number().int(),
    to: z.number().int(),
    die: z.number().int().min(1).max(6),
  }),
  // Takes back the last checker moved this turn. A host from before this
  // existed fails to parse it and ignores it, but no guest offers it to one:
  // the button waits on `played`, which such a host never sends.
  z.object({ type: z.literal('undo') }),
  z.object({ type: z.literal('offerDouble') }),
  z.object({ type: z.literal('respondDouble'), accept: z.boolean() }),
]);

export type BackgammonAction = z.infer<typeof backgammonActionSchema>;

/** The opaque `gameConfig` carried on room creation. */
export const backgammonGameConfigSchema = z
  .object({
    startingPlayer: z.enum(['white', 'black']).optional(),
    useDoublingCube: z.boolean().optional(),
  })
  .optional();

export type BackgammonGameConfig = z.infer<typeof backgammonGameConfigSchema>;
