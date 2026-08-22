import type { Player, WinKind } from '@backgammon/core';

/**
 * The words for the values the engine speaks in. `core` names the seats
 * `white` / `black` and the win kinds `single` / `gammon` / `backgammon`, and
 * those names reach the screen — in the turn line, on the trays, in the cube's
 * owner. Translating them at the point of use is how a colour ends up said
 * three different ways, so every sentence that names one comes here.
 */

/** Mid-sentence: "videau ×2 (noir)". See {@link capitalise} for the other half. */
export const SIDE: Record<Player, string> = { white: 'blanc', black: 'noir' };

/** The checkers of a side rather than the side itself: "vous jouez les blancs". */
export const SIDE_PLURAL: Record<Player, string> = { white: 'blancs', black: 'noirs' };

/**
 * Carries its article, because the three kinds do not share one: a French
 * template with the article written into it is wrong for a third of the
 * results it renders.
 */
export const WIN_KIND: Record<WinKind, string> = {
  single: 'une partie simple',
  gammon: 'un gammon',
  backgammon: 'un backgammon',
};

/**
 * A sentence starting on a word from the tables above. The turn line used to
 * lean on CSS `capitalize` for this, which title-cases *every* word — right
 * for an English headline, wrong for a French sentence ("Noir Gagne Un
 * Gammon").
 */
export const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
