import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * What every control in a row shares: min-h-11 keeps them all at the ~44px
 * touch target phones need, and the rest is what makes them line up. Anything
 * that sits beside a button — see {@link Checkbox} — builds on this, so the
 * touch-target rule has one place to change.
 */
export const CONTROL_BASE =
  'inline-flex min-h-11 touch-manipulation items-center justify-center text-sm font-semibold transition select-none';

export const Button = ({ className, ...props }: ButtonProps) => (
  <button
    type="button"
    className={cn(
      CONTROL_BASE,
      'rounded-md bg-accent px-4 py-2 text-accent-fg',
      'hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40',
      className,
    )}
    {...props}
  />
);

/** How long an armed confirmation stays armed before it forgets the first tap. */
const CONFIRM_TIMEOUT_MS = 4000;

export interface ConfirmButtonProps extends Omit<ButtonProps, 'children' | 'onClick'> {
  /** What the action is called: the button's text, and the root of its name. */
  label: string;
  /** Text shown after the first tap, while waiting for the confirming one. */
  confirmLabel?: string;
  /**
   * Whether the second tap is required at all. False fires on the first one, and
   * exists so a caller with nothing left to protect — new game once the game is
   * over — can drop the guard without swapping the element for a plain
   * {@link Button}, which would resize the button at exactly that moment.
   */
  confirm?: boolean;
  onConfirm: () => void;
}

/**
 * A button that needs two taps. Used for the actions that throw away a game in
 * progress (new game, leaving a room): on a phone they sit a thumb-width from
 * the board, and a stray tap used to be unrecoverable.
 */
export const ConfirmButton = ({
  label,
  confirmLabel = 'Sure?',
  confirm = true,
  onConfirm,
  className,
  ...props
}: ConfirmButtonProps) => {
  const [armed, setArmed] = useState(false);

  /*
   * A guard that drops while it is armed has to disarm with it, and everything
   * below reads this rather than `armed` for it.
   *
   * Keeping one element across that flip is what holds the button's width, and
   * it took away a reset the old remount gave for free: arm "New game"
   * mid-game, let the AI win inside the four seconds, and the button sat there
   * red, reading "Start over?" and announcing that a second tap was needed —
   * over an action that now took one, at the moment the player's hand is
   * already moving towards it. Derived rather than cleared in an effect so
   * there is no frame in which the two disagree; the timer below still runs it
   * out, and `confirm` can only come back on the tap that clears it anyway.
   */
  const isArmed = armed && confirm;

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <>
      <Button
        /*
         * The name tracks the word on the button rather than staying pinned to
         * `label`, because a speech-input user says what they can see (WCAG
         * 2.5.3). Pinning it stranded the interaction halfway: the first tap
         * works, and it is that tap which relabels the button to "Start over?"
         * — so the second one, the one under a four-second timer, could not be
         * spoken at all. The elaboration after the comma keeps the action
         * findable by its own name for the reader who navigates by it, and a
         * comma rather than a dash because that is what a reader speaks as a
         * pause. Derived from `isArmed`, or the name goes stale in exactly the
         * window that guard closes.
         */
        aria-label={isArmed ? `${confirmLabel}, confirm ${label}` : label}
        onClick={() => {
          if (confirm && !armed) {
            setArmed(true);
            return;
          }
          setArmed(false);
          onConfirm();
        }}
        // Reaching for another control is as good an answer as waiting it out.
        onBlur={() => setArmed(false)}
        // After `className`, so an armed button keeps its warning colour.
        className={cn(className, isArmed && 'bg-danger text-danger-fg hover:bg-danger-hover')}
        {...props}
      >
        {/*
         * Both labels, stacked in one grid cell, so the button is always as wide
         * as the longer of them. Swapping the text outright resized it between
         * the two taps it asks for — "New game" is 115px and "Start over?" 120px
         * — which moves the target a few pixels under the thumb already on its
         * way down, on the one control whose whole job is to be hard to hit by
         * accident.
         */}
        <span className="grid">
          <span aria-hidden={isArmed} className={cn('col-start-1 row-start-1', isArmed && 'invisible')}>
            {label}
          </span>
          <span aria-hidden={!isArmed} className={cn('col-start-1 row-start-1', !isArmed && 'invisible')}>
            {confirmLabel}
          </span>
        </span>
      </Button>
      {/*
       * The name above changes for speech input, which is a different consumer:
       * an `aria-label` changing under a focused element is not reliably
       * announced across NVDA, JAWS and VoiceOver, so this stays the thing that
       * actually speaks. Without it the swap to `confirmLabel` and the colour
       * change are both sighted-only signals and the first tap reads as a no-op
       * — the guard degrades into "press twice for no stated reason".
       *
       * `sr-only` is absolutely positioned, so it takes no room in the flex row
       * or the grid the buttons sit in.
       */}
      <span role="status" className="sr-only">
        {isArmed ? `${label}: tap again to confirm.` : ''}
      </span>
    </>
  );
};
