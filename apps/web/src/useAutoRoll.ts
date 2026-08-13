import { useEffect, useRef } from 'react';

/** Long enough that an auto-roll still reads as a roll and not as a jump cut. */
const AUTO_ROLL_DELAY_MS = 300;

/**
 * Rolls for the player who asked not to be asked, in whichever mode they are
 * playing. The delay is presentation only; what makes it safe is the guard
 * inside `roll` itself, which both modes already carry — whatever lands while
 * the timer runs, it only ever rolls a turn that is still yours and still
 * waiting on a roll.
 *
 * `roll` is held in a ref rather than depended on: online it is rebuilt on every
 * frame the host broadcasts, and a dependency would restart the timer with each
 * one — a resync loop faster than the delay would starve the roll it is meant
 * to make.
 */
export const useAutoRoll = (enabled: boolean, canRoll: boolean, roll: () => void) => {
  // Kept current from an effect rather than during render: the timer reads it
  // 300ms later, long after the commit that last refreshed it.
  const rollRef = useRef(roll);
  useEffect(() => {
    rollRef.current = roll;
  }, [roll]);

  useEffect(() => {
    if (!enabled || !canRoll) return;
    const timer = setTimeout(() => rollRef.current(), AUTO_ROLL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [enabled, canRoll]);
};
