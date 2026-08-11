/**
 * The catalogue the switcher renders and the storage plumbing behind it. The
 * colours themselves live in `themes.css`, keyed by the same ids.
 */
export type ThemeId = 'classic' | 'midnight' | 'parchment';

export interface ThemeDefinition {
  id: ThemeId;
  /** Name shown in the switcher. */
  label: string;
  /** One-line description, used as the swatch's tooltip. */
  blurb: string;
  /**
   * Browser/OS chrome colour on mobile. Mirrors the theme's `--canvas`; it has
   * to be a literal because the `<meta>` tag cannot read a CSS variable.
   */
  themeColor: string;
}

export const THEMES: readonly ThemeDefinition[] = [
  {
    id: 'classic',
    label: 'Classic',
    blurb: 'Green felt and brass, the tournament look',
    themeColor: '#03130d',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    blurb: 'Cool indigo, for playing with the lights off',
    themeColor: '#080b16',
  },
  {
    id: 'parchment',
    label: 'Parchment',
    blurb: 'Cream paper and a wooden board',
    themeColor: '#f5ecd9',
  },
];

export const DEFAULT_THEME_ID: ThemeId = 'classic';

/**
 * Namespaced so it cannot collide with anything else this origin stores — on
 * GitHub Pages every app of the account shares one origin.
 *
 * Duplicated by the pre-paint script in `index.html`; change both together.
 */
export const THEME_STORAGE_KEY = 'backgammon:theme';

export const isThemeId = (value: unknown): value is ThemeId => THEMES.some((theme) => theme.id === value);

/**
 * The stored choice, or null when there is none — including when the value is
 * a theme that no longer exists, so removing a theme degrades to the default
 * instead of leaving the app unstyled.
 */
export const readStoredTheme = (): ThemeId | null => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(stored) ? stored : null;
  } catch {
    // Storage disabled (Safari private browsing, hardened settings): the theme
    // still switches for this session, it just does not survive a reload.
    return null;
  }
};

export const storeTheme = (id: ThemeId): void => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // See readStoredTheme: not being able to remember is not worth failing over.
  }
};

/** Points the whole document at one palette. */
export const applyTheme = (id: ThemeId): void => {
  document.documentElement.dataset.theme = id;

  const theme = THEMES.find((candidate) => candidate.id === id);
  if (theme) {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.themeColor);
  }
};
