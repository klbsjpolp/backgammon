import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  chooseTurn,
  currentLegalMoves,
  canDouble,
  createInitialState,
  offerDouble,
  OFF,
  playMove,
  respondDouble,
  roll,
  shouldDouble,
  shouldTakeDouble,
  type GameState,
  type Move,
  type Player,
} from '@backgammon/core';
import { useAutoRoll } from '@/useAutoRoll';

const HUMAN: Player = 'white';
const AI: Player = 'black';
/** Long enough that the AI reads as deciding something rather than reacting. */
const AI_DELAY_MS = 600;
/**
 * Between two checkers of the same turn. Shorter than the pause before it, because
 * this is one decision unfolding rather than a new one being made — and because a
 * double buys four moves, which at the full delay is most of three seconds of
 * watching.
 */
const AI_MOVE_MS = 400;

export interface LocalGame {
  state: GameState;
  /** Color the human plays; the board is drawn from this side. */
  you: Player;
  legalMoves: Move[];
  selectableFroms: number[];
  selectedFrom: number | null;
  targets: number[];
  isHumanTurn: boolean;
  /** The human is the one who has yet to roll — what Roll and auto-roll both wait on. */
  canRoll: boolean;
  canHumanDouble: boolean;
  /** True while the AI has a double pending the human's take/drop answer. */
  doubleToYou: boolean;
  /** Roll for the human automatically, instead of waiting for the Roll button. */
  autoRoll: boolean;
  setAutoRoll: (value: boolean) => void;
  newGame: () => void;
  rollDice: () => void;
  clickPoint: (index: number) => void;
  clearSelection: () => void;
  double: () => void;
  respond: (accept: boolean) => void;
}

export const useLocalGame = (): LocalGame => {
  const [state, setState] = useState<GameState>(() => createInitialState(HUMAN));
  const [selectedFrom, setSelectedFrom] = useState<number | null>(null);
  const [autoRoll, setAutoRoll] = useState(false);

  const isHumanTurn = state.turn === HUMAN;

  const legalMoves = useMemo(
    () => (isHumanTurn && state.phase === 'moving' ? currentLegalMoves(state) : []),
    [state, isHumanTurn],
  );

  const selectableFroms = useMemo(() => [...new Set(legalMoves.map((m) => m.from))], [legalMoves]);

  const targets = useMemo(
    () => (selectedFrom === null ? [] : legalMoves.filter((m) => m.from === selectedFrom).map((m) => m.to)),
    [legalMoves, selectedFrom],
  );

  const newGame = useCallback(() => {
    setSelectedFrom(null);
    setState(createInitialState(HUMAN));
  }, []);

  const rollDice = useCallback(() => {
    setState((s) => (s.turn === HUMAN && s.phase === 'rolling' ? roll(s) : s));
  }, []);

  const double = useCallback(() => {
    setState((s) => (canDouble(s, HUMAN) ? offerDouble(s) : s));
  }, []);

  const respond = useCallback((accept: boolean) => {
    setState((s) => (s.phase === 'doubleOffered' && s.doubleOfferedBy === AI ? respondDouble(s, accept) : s));
  }, []);

  const clearSelection = useCallback(() => setSelectedFrom(null), []);

  const clickPoint = useCallback(
    (index: number) => {
      if (!isHumanTurn || state.phase !== 'moving') return;

      if (selectedFrom === null) {
        if (selectableFroms.includes(index)) setSelectedFrom(index);
        return;
      }

      const move = legalMoves.find((m) => m.from === selectedFrom && m.to === index);
      if (move) {
        setState((s) => playMove(s, move));
        setSelectedFrom(null);
        return;
      }

      // Not a target: treat as re-selecting a different source, else deselect.
      setSelectedFrom(selectableFroms.includes(index) ? index : null);
    },
    [isHumanTurn, state.phase, selectedFrom, selectableFroms, legalMoves],
  );

  const canRoll = isHumanTurn && state.phase === 'rolling';
  useAutoRoll(autoRoll, canRoll, rollDice);

  // Drive the AI: offer a double when the cube is right, roll, play its turn a
  // checker at a time, or answer a human double offer.
  useEffect(() => {
    if (state.phase === 'gameOver') return;

    if (state.turn === AI && state.phase === 'rolling') {
      const t = setTimeout(
        () =>
          setState((s) => {
            if (!(s.turn === AI && s.phase === 'rolling')) return s;
            return shouldDouble(s, AI) ? offerDouble(s) : roll(s);
          }),
        AI_DELAY_MS,
      );
      return () => clearTimeout(t);
    }
    if (state.turn === AI && state.phase === 'moving') {
      // One checker per beat. `applyAiTurn` played the whole turn in a single
      // state, so two to four checkers changed places at once and nothing on
      // screen said which ones — the human's own move is one they just made and
      // are expecting, but the AI's is the only account they get of it.
      //
      // The move is re-decided from the board in front of it rather than walked
      // out of a sequence stored on the side: there is then no plan that can
      // disagree with the state, and the timer needs no cancelling beyond the
      // guard every other AI timer here already carries. It does not cost play
      // either, because a turn that is partly played has a subset of the dice
      // left, so the search from here still reaches every continuation the first
      // one was choosing between.
      const t = setTimeout(
        () =>
          setState((s) => {
            if (!(s.turn === AI && s.phase === 'moving')) return s;
            // `moving` is only ever entered with a move available, and the turn
            // ends the moment one stops being, so there is always a first move.
            const [move] = chooseTurn(s);
            // Not `applyLegalMove`: the fast path belongs to the search itself,
            // which regenerates nothing. This is the UI applying a move.
            return playMove(s, move);
          }),
        AI_MOVE_MS,
      );
      return () => clearTimeout(t);
    }
    if (state.phase === 'doubleOffered' && state.doubleOfferedBy === HUMAN) {
      const t = setTimeout(
        () =>
          setState((s) =>
            s.phase === 'doubleOffered' && s.doubleOfferedBy === HUMAN ? respondDouble(s, shouldTakeDouble(s, AI)) : s,
          ),
        AI_DELAY_MS,
      );
      return () => clearTimeout(t);
    }
  }, [state]);

  return {
    state,
    you: HUMAN,
    legalMoves,
    selectableFroms,
    selectedFrom,
    targets,
    isHumanTurn,
    canRoll,
    canHumanDouble: canDouble(state, HUMAN),
    doubleToYou: state.phase === 'doubleOffered' && state.doubleOfferedBy === AI,
    autoRoll,
    setAutoRoll,
    newGame,
    rollDice,
    clickPoint,
    clearSelection,
    double,
    respond,
  };
};

export { OFF };
