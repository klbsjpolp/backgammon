import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FullscreenButton } from './FullscreenButton';

/**
 * jsdom has no Fullscreen API of its own, so each test wires up just enough of
 * it to drive the component: a `requestFullscreen`/`exitFullscreen` pair that
 * flips `document.fullscreenElement` and fires the `fullscreenchange` event a
 * real browser would, which is the only channel the hook listens on.
 */
const installFullscreenApi = () => {
  let element: Element | null = null;

  Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
  Object.defineProperty(document, 'fullscreenElement', {
    get: () => element,
    configurable: true,
  });

  document.documentElement.requestFullscreen = vi.fn(() => {
    element = document.documentElement;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });

  document.exitFullscreen = vi.fn(() => {
    element = null;
    document.dispatchEvent(new Event('fullscreenchange'));
    return Promise.resolve();
  });
};

describe('FullscreenButton', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, 'fullscreenEnabled');
    Reflect.deleteProperty(document, 'fullscreenElement');
  });

  it('renders nothing where the Fullscreen API does not exist', () => {
    Object.defineProperty(document, 'fullscreenEnabled', { value: false, configurable: true });
    render(<FullscreenButton />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('enters and leaves fullscreen from the one button, tracking the real state', async () => {
    installFullscreenApi();
    render(<FullscreenButton />);

    const button = screen.getByRole('button', { name: 'Plein écran' });
    expect(button.getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      fireEvent.click(button);
    });

    expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
    const pressed = screen.getByRole('button', { name: 'Quitter le plein écran' });
    expect(pressed.getAttribute('aria-pressed')).toBe('true');

    await act(async () => {
      fireEvent.click(pressed);
    });

    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Plein écran' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('sets body[data-fullscreen] only while active, for the CSS that reads it', async () => {
    installFullscreenApi();
    render(<FullscreenButton />);

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
  beforeEach(() => installFullscreenApi());
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, 'fullscreenEnabled');
    Reflect.deleteProperty(document, 'fullscreenElement');
    document.body.removeAttribute('data-fullscreen');
  });

  it('drops body[data-fullscreen] on unmount rather than leaving the board stuck grown', async () => {
    const { unmount } = render(<FullscreenButton />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(document.body.hasAttribute('data-fullscreen')).toBe(true);

    unmount();
    expect(document.body.hasAttribute('data-fullscreen')).toBe(false);
  });
});
