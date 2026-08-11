import { useEffect, useMemo, useState } from 'react';
import { ThemeContext, type ThemeContextValue } from '@/theme/context';
import { DEFAULT_THEME_ID, applyTheme, readStoredTheme, storeTheme, type ThemeId } from '@/theme/themes';

/**
 * Owns the active theme and keeps it in three places at once: React state, the
 * `data-theme` attribute the CSS keys off, and local storage.
 *
 * The initial read is the stored value, which the pre-paint script in
 * `index.html` has usually applied already — this agrees with it rather than
 * fighting it, and covers the case where that script did not run (tests, or a
 * browser that refuses storage on the first look but not the second).
 */
export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = useState<ThemeId>(() => readStoredTheme() ?? DEFAULT_THEME_ID);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: (id) => {
        storeTheme(id);
        setThemeState(id);
      },
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
