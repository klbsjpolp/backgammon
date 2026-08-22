import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '@/App';
import { THEME_STORAGE_KEY } from '@/theme/themes';

const swatch = (label: string) => screen.getByRole('button', { name: `thème ${label}` });
const applied = () => document.documentElement.dataset.theme;

describe('theme switcher', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts on the default theme when nothing has been chosen', () => {
    render(<App />);
    expect(applied()).toBe('classic');
    expect(swatch('Classique').getAttribute('aria-pressed')).toBe('true');
  });

  it('applies a picked theme and remembers it', () => {
    render(<App />);

    fireEvent.click(swatch('Parchemin'));

    expect(applied()).toBe('parchment');
    expect(swatch('Parchemin').getAttribute('aria-pressed')).toBe('true');
    expect(swatch('Classique').getAttribute('aria-pressed')).toBe('false');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('parchment');
  });

  it('restores the remembered theme on the next visit', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'midnight');
    render(<App />);

    expect(applied()).toBe('midnight');
    expect(swatch('Minuit').getAttribute('aria-pressed')).toBe('true');
  });

  it('falls back to the default when the stored theme no longer exists', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'chartreuse');
    render(<App />);

    expect(applied()).toBe('classic');
  });

  it('draws each swatch in the theme it selects, not the active one', () => {
    render(<App />);

    // The swatch opens its own palette scope, which is what makes the preview
    // work — without it every swatch would render in the current theme.
    const previews = screen.getAllByRole('button', { name: /^thème / }).map((button) => button.firstElementChild);
    expect(previews.map((preview) => preview?.getAttribute('data-theme'))).toEqual([
      'classic',
      'midnight',
      'parchment',
    ]);
  });

  it('keeps the mobile chrome colour in step with the theme', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);

    render(<App />);
    expect(meta.getAttribute('content')).toBe('#03130d');

    fireEvent.click(swatch('Minuit'));
    expect(meta.getAttribute('content')).toBe('#080b16');

    meta.remove();
  });
});
