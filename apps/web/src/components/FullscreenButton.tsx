import { useFullscreenState } from '@/fullscreen';
import { cn } from '@/lib/cn';

/**
 * Corner brackets, drawn rather than borrowed from a font — see `Dice` for why
 * a glyph is the wrong tool at icon size. Pointing outward to offer entering
 * fullscreen, inward once inside to offer leaving it.
 */
const FullscreenIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-5"
  >
    {active ? (
      <path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4" />
    ) : (
      <path d="M3 9V5a2 2 0 0 1 2-2h4M21 9V5a2 2 0 0 0-2-2h-4M3 15v4a2 2 0 0 0 2 2h4M21 15v4a2 2 0 0 1-2 2h-4" />
    )}
  </svg>
);

/**
 * Grows the board past the cap a windowed desktop leaves headroom for — see
 * the `body[data-fullscreen]` rule in index.css. Restricted to screens roomy
 * enough for it to be worth the real Fullscreen API round trip: a phone
 * either has no support for it (iOS Safari, caught below by `isSupported`)
 * or is already using its whole screen via the portrait/compact layouts.
 */
export const FullscreenButton = ({ className }: { className?: string }) => {
  const { isFullscreen, isSupported, toggle } = useFullscreenState();

  if (!isSupported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isFullscreen}
      aria-label={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
      title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
      className={cn(
        'touch-manipulation rounded-full p-2 text-muted transition select-none hover:text-fg',
        'max-sm:hidden compact:hidden',
        className,
      )}
    >
      <FullscreenIcon active={isFullscreen} />
    </button>
  );
};
