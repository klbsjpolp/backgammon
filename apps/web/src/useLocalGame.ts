import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyAiTurn,
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

const HUMAN: Player = 'white';
const AI: Player = 'black';
const AI_DELAY_MS = 600;

export interface LocalGame {
  state: GameState;
  /** Color the human plays; the board is drawn from this side. */
  you: Player;
  legalMoves: Move[];
  selectableFroms: number[];
  selectedFrom: number | null;
  targets: number[];
  isHumanTurn: boolean;
  canHumanDouble: boolean;
  /** True while the AI has a double pending the human's take/drop answer. */
  doubleToYou: boolean;
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

  // Drive the AI: offer a double when the cube is right, roll, play its whole
  // turn, or answer a human double offer.
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
      const t = setTimeout(
        () => setState((s) => (s.turn === AI && s.phase === 'moving' ? applyAiTurn(s) : s)),
        AI_DELAY_MS,
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
    canHumanDouble: canDouble(state, HUMAN),
    doubleToYou: state.phase === 'doubleOffered' && state.doubleOfferedBy === AI,
    newGame,
    rollDice,
    clickPoint,
    clearSelection,
    double,
    respond,
  };
};

export { OFF };
