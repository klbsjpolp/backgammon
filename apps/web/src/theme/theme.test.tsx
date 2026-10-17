import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '@/App';
import { THEME_STORAGE_KEY } from '@/theme/themes';

const trigger = () => screen.getByRole('button', { name: /^Thème : / });
const openPicker = () => fireEvent.click(trigger());
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
    expect(trigger().getAttribute('aria-label')).toBe('Thème : Classique');
    openPicker();
    expect(swatch('Classique').getAttribute('aria-pressed')).toBe('true');
  });

  it('applies a picked theme and remembers it', () => {
    render(<App />);

    openPicker();
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
    expect(trigger().getAttribute('aria-label')).toBe('Thème : Minuit');
  });

  it('falls back to the default when the stored theme no longer exists', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'chartreuse');
    render(<App />);

    expect(applied()).toBe('classic');
  });

  it('opens on the chosen theme and stays open while themes are compared', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'parchment');
    render(<App />);

    expect(screen.queryByRole('button', { name: 'thème Classique' })).toBeNull();
    openPicker();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    // A keyboard player lands on where they are, not at the top of the list.
    expect(document.activeElement).toBe(swatch('Parchemin'));

    fireEvent.click(swatch('Minuit'));
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(trigger().getAttribute('aria-label')).toBe('Thème : Minuit');
  });

  it('closes on Escape and hands focus back to the trigger', () => {
    render(<App />);
    openPicker();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on a click outside it', () => {
    render(<App />);
    openPicker();

    fireEvent.mouseDown(document.body);

    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('files the themes under dark and light', () => {
    render(<App />);
    openPicker();

    const names = (group: string) =>
      within(screen.getByRole('group', { name: group }))
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'));
    expect(names('Thèmes sombres')).toEqual(['thème Classique', 'thème Minuit']);
    expect(names('Thèmes clairs')).toEqual(['thème Parchemin']);
  });

  it('draws each swatch in the theme it selects, not the active one', () => {
    render(<App />);
    openPicker();

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

    openPicker();
    fireEvent.click(swatch('Minuit'));
    expect(meta.getAttribute('content')).toBe('#080b16');

    meta.remove();
  });
});
