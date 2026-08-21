import type { Move } from '@backgammon/core';

/**
 * The one move a point offers, or `null` when it offers a choice.
 *
 * "One move" is one *destination*, not one entry in the list: a point low enough
 * in the home board bears off with either die, and those are two entries that put
 * the checker in the same place. The die is then picked exactly as a second click
 * picks it — the first move in the list that lands there — so the shortcut can
 * never play something the two clicks would not have.
 */
export const soleMoveFrom = (legalMoves: readonly Move[], from: number): Move | null => {
  const fromHere = legalMoves.filter((m) => m.from === from);
  const [first] = fromHere;
  if (!first) return null;
  return fromHere.every((m) => m.to === first.to) ? first : null;
};
