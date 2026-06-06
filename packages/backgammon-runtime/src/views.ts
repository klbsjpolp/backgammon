import type { GameState, Move, Player } from '@backgammon/core';
import { currentLegalMoves } from '@backgammon/core';

/**
 * What a single seat sees. Backgammon is a perfect-information game, so unlike
 * skip-bo there is nothing to redact — every seat receives the full state. The
 * view just adds seat-relative conveniences (`you`, `yourTurn`, `legalMoves`).
 */
export interface BackgammonView {
  state: GameState;
  you: Player;
  yourTurn: boolean;
  legalMoves: Move[];
}

export const serializeView = (state: GameState, you: Player): BackgammonView => ({
  state,
  you,
  yourTurn: state.turn === you && state.phase !== 'gameOver',
  legalMoves: state.turn === you ? currentLegalMoves(state) : [],
});
