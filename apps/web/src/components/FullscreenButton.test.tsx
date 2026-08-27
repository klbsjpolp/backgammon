import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FullscreenContext } from '@/fullscreen';
import { useFullscreen } from '@/useFullscreen';
import { FullscreenButton } from './FullscreenButton';

/**
 * The button reads the state rather than owning it — `App` holds the one copy,
 * because fullscreen also decides where the version line and the controls are
 * drawn. This harness is that wiring, so these stay tests of the hook and the
 * button together rather than of the button's props.
 */
const Fullscreenable = () => {
  const fullscreen = useFullscreen();
  return (
    <FullscreenContext.Provider value={fullscreen}>
      <FullscreenButton />
    </FullscreenContext.Provider>
  );
};

describe('FullscreenButton', () => {
  it('toggles from the one button, flipping aria-pressed and the label', async () => {
    render(<Fullscreenable />);

    const button = screen.getByRole('button', { name: 'Plein écran' });
    expect(button.getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      fireEvent.click(button);
    });

    const pressed = screen.getByRole('button', { name: 'Quitter le plein écran' });
    expect(pressed.getAttribute('aria-pressed')).toBe('true');

    await act(async () => {
      fireEvent.click(pressed);
    });

    expect(screen.getByRole('button', { name: 'Plein écran' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('sets body[data-fullscreen] only while active, for the CSS that reads it', async () => {
    render(<Fullscreenable />);

    expect(document.body.hasAttribute('data-fullscreen')).toBe(false);

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(document.body.hasAttribute('data-fullscreen')).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(document.body.hasAttribute('data-fullscreen')).toBe(false);
  });
});

describe('FullscreenButton cleanup', () => {
  it('drops body[data-fullscreen] on unmount rather than leaving the board stuck grown', async () => {
    const { unmount } = render(<Fullscreenable />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(document.body.hasAttribute('data-fullscreen')).toBe(true);

    unmount();
    expect(document.body.hasAttribute('data-fullscreen')).toBe(false);
  });
});
