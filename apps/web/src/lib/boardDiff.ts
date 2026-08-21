import type { Board, Player } from '@backgammon/core';

/**
 * A pile of checkers, named the way the board's markup names it (`data-pile`).
 * One per point, one per player on the bar, one per player's tray.
 */
export type PileId = string;

export const pointPile = (index: number): PileId => `point-${index}`;
export const barPile = (player: Player): PileId => `bar-${player}`;
export const offPile = (player: Player): PileId => `off-${player}`;

export interface CheckerMotion {
  player: Player;
  from: PileId;
  to: PileId;
  /** `hit` is the blot the move above knocked to the bar, not a move of its own. */
  kind: 'move' | 'hit';
}

const PLAYERS: Player[] = ['white', 'black'];

/** One player's checkers, pile by pile. Empty piles are absent rather than zero. */
const pilesOf = (board: Board, player: Player): Map<PileId, number> => {
  const sign = player === 'white' ? 1 : -1;
  const piles = new Map<PileId, number>();

  board.points.forEach((count, index) => {
    const mine = count * sign;
    if (mine > 0) piles.set(pointPile(index), mine);
  });
  if (board.bar[player] > 0) piles.set(barPile(player), board.bar[player]);
  if (board.off[player] > 0) piles.set(offPile(player), board.off[player]);

  return piles;
};

interface Delta {
  gained: PileId[];
  lost: PileId[];
}

/**
 * `null` when any pile changed by more than one checker — a new game, a frame a
 * guest never received, or anything else that is not a single move being played.
 */
const deltaOf = (before: Map<PileId, number>, after: Map<PileId, number>): Delta | null => {
  const delta: Delta = { gained: [], lost: [] };

  for (const pile of new Set([...before.keys(), ...after.keys()])) {
    const change = (after.get(pile) ?? 0) - (before.get(pile) ?? 0);
    if (change === 0) continue;
    if (change === 1) delta.gained.push(pile);
    else if (change === -1) delta.lost.push(pile);
    else return null;
  }

  return delta.gained.length > 1 || delta.lost.length > 1 ? null : delta;
};

/**
 * What travelled between two boards, so the UI can draw the checker going there
 * instead of teleporting it.
 *
 * Derived by comparing the two boards rather than carried alongside them, because
 * the two games arrive at a new board by different routes: locally the move is in
 * hand, but a guest is handed a state and never sees the `Move` that produced it.
 * A diff is the one description both can make, and it costs the wire nothing.
 *
 * Anything that is not exactly one checker moving — the opening position, a
 * board that jumped several moves because a relayed frame went missing — returns
 * empty, and the board simply appears as it always did.
 */
export const describeMotions = (before: Board, after: Board): CheckerMotion[] => {
  const steps: { player: Player; delta: Delta }[] = [];

  for (const player of PLAYERS) {
    const delta = deltaOf(pilesOf(before, player), pilesOf(after, player));
    if (!delta) return [];
    if (delta.gained.length === 0 && delta.lost.length === 0) continue;
    // Every move takes one checker off a pile and puts it on another; entering
    // from the bar and bearing off are that same shape, with the bar or the tray
    // as one end of it. Anything else is not a move.
    if (delta.gained.length !== 1 || delta.lost.length !== 1) return [];
    steps.push({ player, delta });
  }

  if (steps.length === 0) return [];
  if (steps.length === 1) {
    const [{ player, delta }] = steps;
    return [{ player, from: delta.lost[0], to: delta.gained[0], kind: 'move' }];
  }

  // Both sides changed. The only way one move does that is a hit, so the mover is
  // whichever of them did not end up on the bar.
  const victim = steps.find(({ player, delta }) => delta.gained[0] === barPile(player));
  const mover = steps.find((step) => step !== victim);
  if (!victim || !mover) return [];
  // And the blot has to have been standing exactly where the move landed.
  if (victim.delta.lost[0] !== mover.delta.gained[0]) return [];

  return [
    { player: mover.player, from: mover.delta.lost[0], to: mover.delta.gained[0], kind: 'move' },
    { player: victim.player, from: victim.delta.lost[0], to: victim.delta.gained[0], kind: 'hit' },
  ];
};
