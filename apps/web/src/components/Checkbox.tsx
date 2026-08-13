import { CONTROL_BASE } from '@/components/Button';
import { cn } from '@/lib/cn';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}

/**
 * A labelled checkbox built on {@link CONTROL_BASE}: it sits in the same control
 * rows as the buttons, so it takes their sizing — the box alone is nowhere near
 * a touch target, and the label is half of what there is to hit.
 */
export const Checkbox = ({ checked, onChange, children }: CheckboxProps) => (
  <label className={cn(CONTROL_BASE, 'cursor-pointer gap-2 px-2 text-muted hover:text-fg')}>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="size-4 accent-accent"
    />
    {children}
  </label>
);
