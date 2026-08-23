import { CONTROL_BASE } from '@/components/Button';
import { cn } from '@/lib/cn';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /**
   * The spoken name, for a label that abbreviates itself on a narrow screen.
   * It must contain the words still visible there — a speech-input user says
   * what they can see (WCAG 2.5.3) — and pinning it here also keeps the name
   * off whichever half of the label CSS happens to be showing, which matters
   * because no CSS runs in the tests.
   */
  label?: string;
  children: React.ReactNode;
}

/**
 * A labelled checkbox built on {@link CONTROL_BASE}: it sits in the same control
 * rows as the buttons, so it takes their sizing — the box alone is nowhere near
 * a touch target, and the label is half of what there is to hit.
 *
 * It is also the item that gives in a row too narrow for all of it: the buttons
 * beside it hold a fixed slot width so they cannot move under a thumb already on
 * its way down, so the text here is what shrinks and, in the last resort,
 * ellipsises. The box itself never does — `shrink-0`, or the target goes with it.
 */
export const Checkbox = ({ checked, onChange, label, children }: CheckboxProps) => (
  <label className={cn(CONTROL_BASE, 'min-w-0 cursor-pointer gap-2 px-2 text-muted hover:text-fg')}>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
      className="size-4 shrink-0 accent-accent"
    />
    <span className="truncate">{children}</span>
  </label>
);
