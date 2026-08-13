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
  type GameState,
  type Move,
  type Player,
} from '@backgammon/core';

const HUMAN: Player = 'white';
const AI: Player = 'black';
const AI_DELAY_MS = 600;
const AUTO_ROLL_DELAY_MS = 300;

export interface LocalGame {
  state: GameState;
  human: Player;
  legalMoves: Move[];
  selectableFroms: number[];
  selectedFrom: number | null;
  targets: number[];
  isHumanTurn: boolean;
  canHumanDouble: boolean;
  autoRoll: boolean;
  setAutoRoll: (value: boolean) => void;
  newGame: () => void;
  rollDice: () => void;
  clickPoint: (index: number) => void;
  clearSelection: () => void;
  double: () => void;
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

  // Auto-roll for the human when enabled.
  useEffect(() => {
    if (!autoRoll || state.turn !== HUMAN || state.phase !== 'rolling') return;
    const t = setTimeout(
      () => setState((s) => (s.turn === HUMAN && s.phase === 'rolling' ? roll(s) : s)),
      AUTO_ROLL_DELAY_MS,
    );
    return () => clearTimeout(t);
  }, [autoRoll, state]);

  // Drive the AI: roll, play its whole turn, or take a human double offer.
  useEffect(() => {
    if (state.phase === 'gameOver') return;

    if (state.turn === AI && state.phase === 'rolling') {
      const t = setTimeout(() => setState((s) => (s.turn === AI && s.phase === 'rolling' ? roll(s) : s)), AI_DELAY_MS);
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
        () => setState((s) => (s.phase === 'doubleOffered' ? respondDouble(s, true) : s)),
        AI_DELAY_MS,
      );
      return () => clearTimeout(t);
    }
  }, [state]);

  return {
    state,
    human: HUMAN,
    legalMoves,
    selectableFroms,
    selectedFrom,
    targets,
    isHumanTurn,
    canHumanDouble: canDouble(state, HUMAN),
    autoRoll,
    setAutoRoll,
    newGame,
    rollDice,
    clickPoint,
    clearSelection,
    double,
  };
};

export { OFF };
