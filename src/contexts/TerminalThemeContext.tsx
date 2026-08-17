import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type TerminalTheme = 'dark' | 'light';

const STORAGE_KEY = 'blynk-terminal-theme';

interface TerminalThemeContextValue {
  theme: TerminalTheme;
  setTheme: (theme: TerminalTheme) => void;
  toggleTheme: () => void;
}

const TerminalThemeContext = createContext<TerminalThemeContextValue | undefined>(undefined);

function readStoredTheme(): TerminalTheme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function TerminalThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<TerminalTheme>(readStoredTheme);

  const setTheme = useCallback((next: TerminalTheme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — theme stays session-only */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  // Portalled surfaces (dialogs, dropdowns, tooltips) render outside the
  // .terminal wrapper — mirror the state on <html> so scoped CSS can reach them.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('terminal-light', theme === 'light');
    return () => {
      root.classList.remove('terminal-light');
    };
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  return <TerminalThemeContext.Provider value={value}>{children}</TerminalThemeContext.Provider>;
}

export function useTerminalTheme(): TerminalThemeContextValue {
  const ctx = useContext(TerminalThemeContext);
  if (!ctx) {
    return { theme: 'dark', setTheme: () => {}, toggleTheme: () => {} };
  }
  return ctx;
}
