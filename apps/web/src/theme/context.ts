import { createContext, useContext } from 'react';
import type { ThemeId } from '@/theme/themes';

export interface ThemeContextValue {
  theme: ThemeId;
  /** Applies a theme and remembers it for the next visit. */
  setTheme: (id: ThemeId) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export const useTheme = (): ThemeContextValue => {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error('useTheme must be used inside a <ThemeProvider>');
  return value;
};
