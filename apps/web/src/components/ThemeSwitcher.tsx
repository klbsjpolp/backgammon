import { cn } from '@/lib/cn';
import { useTheme } from '@/theme/context';
import { THEMES } from '@/theme/themes';

/**
 * One swatch per theme, each drawn *in* the theme it selects: the swatch sets
 * its own `data-theme`, so the palette variables resolve inside it and it shows
 * the felt and accent you would get rather than a legend you have to decode.
 *
 * It sits in the header beside the mode switch, where a phone has very little
 * width left, hence the 24px swatches and the invisible padding that brings the
 * touch target back up to the ~44px a thumb needs.
 */
export const ThemeSwitcher = ({ className }: { className?: string }) => {
  const { theme, setTheme } = useTheme();

  return (
    <div role="group" aria-label="Theme" className={cn('flex items-center gap-1', className)}>
      {THEMES.map((option) => {
        const active = option.id === theme;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => setTheme(option.id)}
            aria-label={`${option.label} theme`}
            aria-pressed={active}
            title={option.blurb}
            className={cn(
              'relative touch-manipulation rounded-full transition select-none',
              // Stretches the hit area past the swatch without taking up the
              // height a wrapped header row would cost the board.
              'before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[""]',
              active
                ? 'ring-2 ring-accent ring-offset-2 ring-offset-canvas'
                : 'opacity-60 hover:opacity-100 focus-visible:opacity-100',
            )}
          >
            <span
              data-theme={option.id}
              className="flex size-6 items-center justify-center gap-px rounded-full bg-felt ring-1 ring-board-frame"
            >
              <span className="size-1.5 rounded-full bg-checker-light" />
              <span className="size-1.5 rounded-full bg-accent" />
            </span>
          </button>
        );
      })}
    </div>
  );
};
