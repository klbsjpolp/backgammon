import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = ({ className, ...props }: ButtonProps) => (
  <button
    type="button"
    className={cn(
      // min-h-11 keeps every control at the ~44px touch target phones need.
      'inline-flex min-h-11 touch-manipulation items-center justify-center rounded-md bg-amber-500 px-4 py-2',
      'text-sm font-semibold text-stone-900 transition select-none',
      'hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40',
      className,
    )}
    {...props}
  />
);

/** How long an armed confirmation stays armed before it forgets the first tap. */
const CONFIRM_TIMEOUT_MS = 4000;

export interface ConfirmButtonProps extends Omit<ButtonProps, 'children' | 'onClick'> {
  /** Stable accessible name — the visible text changes once armed, this does not. */
  label: string;
  /** Text shown after the first tap, while waiting for the confirming one. */
  confirmLabel?: string;
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
  onConfirm,
  className,
  ...props
}: ConfirmButtonProps) => {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <>
      <Button
        aria-label={label}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            return;
          }
          setArmed(false);
          onConfirm();
        }}
        // Reaching for another control is as good an answer as waiting it out.
        onBlur={() => setArmed(false)}
        // After `className`, so an armed button keeps its warning colour.
        className={cn(className, armed && 'bg-red-600 text-red-50 hover:bg-red-500')}
        {...props}
      >
        {armed ? confirmLabel : label}
      </Button>
      {/*
       * The accessible name is pinned to `label` so the action stays findable,
       * which means arming is invisible to a screen reader: the swap to
       * `confirmLabel` and the colour change are both sighted-only signals, and
       * the first tap would read as a no-op. This announces it instead — without
       * it the guard degrades into "press twice for no stated reason".
       *
       * `sr-only` is absolutely positioned, so it takes no room in the flex row
       * or the grid the buttons sit in.
       */}
      <span role="status" className="sr-only">
        {armed ? `${label}: tap again to confirm.` : ''}
      </span>
    </>
  );
};
