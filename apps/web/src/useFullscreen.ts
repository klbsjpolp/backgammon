import { useCallback, useEffect, useState } from 'react';

/** Set on `<body>` while the Fullscreen API is active, so index.css can grow the board — see `.board-fit`. */
export const FULLSCREEN_ATTRIBUTE = 'data-fullscreen';

/**
 * Wraps the Fullscreen API on `document.documentElement`. `isSupported` is
 * false on browsers that never fire `fullscreenchange` at all (iOS Safari),
 * so the caller can drop the button rather than offer one that silently does
 * nothing.
 *
 * The DOM attribute is the state every consumer actually wants: the board's
 * `--pt` cap, the footer and the hint line are CSS selectors already (see
 * `fullscreen:` in index.css), not components that would otherwise need the
 * flag threaded down through props.
 */
export const useFullscreen = () => {
  const [isFullscreen, setIsFullscreen] = useState(() => document.fullscreenElement != null);
  const isSupported = document.fullscreenEnabled === true;

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement != null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    document.body.setAttribute(FULLSCREEN_ATTRIBUTE, 'true');
    return () => document.body.removeAttribute(FULLSCREEN_ATTRIBUTE);
  }, [isFullscreen]);

  const toggle = useCallback(() => {
    const request = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    // Denied without a user gesture, or the element left the tree mid-request —
    // either way there is nothing to recover, just something worth a trace.
    void request.catch((error: unknown) => console.warn('Fullscreen toggle failed', error));
  }, []);

  return { isFullscreen, isSupported, toggle };
};
