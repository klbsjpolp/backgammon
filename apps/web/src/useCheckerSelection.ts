import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Move } from '@backgammon/core';

/**
 * Holding a checker and putting it down — the click flow, and what a drag needs
 * on top of it.
 *
 * Local and online play differ in where the legal moves come from and in what
 * playing one *does* (the local game applies it, the online one relays it), and
 * in nothing else. Both had written this out themselves, which is exactly how the
 * two modes drifted apart before; one copy means a gesture added here is a
 * gesture in both.
 */
export interface CheckerSelection {
  /** Points (and `BAR`) a checker can leave this turn. */
  selectableFroms: number[];
  /** The point being held, or `null`. Never a point that cannot be played from. */
  selectedFrom: number | null;
  /** Where the held checker may land. Empty while nothing is held. */
  targets: number[];
  /**
   * Where a checker on `from` could land — asked by a drag, which has to light up
   * the destinations in the same gesture that picks the checker up and so cannot
   * wait for {@link selectedFrom} to come back around through a render.
   */
  targetsFrom: (from: number) => number[];
  /**
   * Hold `from`, and only that. `clickPoint` has to guess whether a point means
   * "pick this up" or "put it down here"; a drag knows which end it is at.
   */
  selectFrom: (from: number | null) => void;
  /** The click flow: pick up, put down, or re-aim at another source. */
  clickPoint: (index: number) => void;
  /** Play `from` → `to` outright, whatever happens to be held. */
  moveChecker: (from: number, to: number) => void;
  clearSelection: () => void;
}

/**
 * `legalMoves` is empty whenever it is not this client's move, which is what
 * makes every entry point below inert off-turn without a guard of its own.
 */
export const useCheckerSelection = (legalMoves: readonly Move[], play: (move: Move) => void): CheckerSelection => {
  const [held, setHeld] = useState<number | null>(null);

  // `play` is rebuilt whenever the board is, and every callback below would be
  // too — including the ones a live drag captured when it started. Reading it
  // back out of a ref keeps them stable for the length of a gesture.
  const playRef = useRef(play);
  useEffect(() => {
    playRef.current = play;
  });

  const selectableFroms = useMemo(() => [...new Set(legalMoves.map((m) => m.from))], [legalMoves]);

  // Derived rather than stored: a selection outlives neither the move that
  // consumed it nor the turn it was made in, and deriving it is what drops a
  // stale one without a setState buried in an effect.
  const selectedFrom = held !== null && selectableFroms.includes(held) ? held : null;

  const targets = useMemo(
    () => (selectedFrom === null ? [] : legalMoves.filter((m) => m.from === selectedFrom).map((m) => m.to)),
    [legalMoves, selectedFrom],
  );

  const targetsFrom = useCallback(
    (from: number) => legalMoves.filter((m) => m.from === from).map((m) => m.to),
    [legalMoves],
  );

  const moveChecker = useCallback(
    (from: number, to: number) => {
      const move = legalMoves.find((m) => m.from === from && m.to === to);
      if (!move) return;
      setHeld(null);
      playRef.current(move);
    },
    [legalMoves],
  );

  const clickPoint = useCallback(
    (index: number) => {
      if (selectedFrom === null) {
        if (selectableFroms.includes(index)) setHeld(index);
        return;
      }
      const move = legalMoves.find((m) => m.from === selectedFrom && m.to === index);
      if (move) {
        setHeld(null);
        playRef.current(move);
        return;
      }
      // Not a target: treat as re-selecting a different source, else deselect.
      setHeld(selectableFroms.includes(index) ? index : null);
    },
    [legalMoves, selectableFroms, selectedFrom],
  );

  const clearSelection = useCallback(() => setHeld(null), []);

  return {
    selectableFroms,
    selectedFrom,
    targets,
    targetsFrom,
    selectFrom: setHeld,
    clickPoint,
    moveChecker,
    clearSelection,
  };
};
