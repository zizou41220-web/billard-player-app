import { useState, useEffect } from 'react';

export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'mb_theme';

export function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch (e) {
    // ignore
  }
  return 'dark';
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (e) {
    // ignore
  }
  document.documentElement.setAttribute('data-theme', theme);
  if (theme === 'light') {
    document.body.classList.add('theme-light');
    document.body.classList.remove('theme-dark');
  } else {
    document.body.classList.add('theme-dark');
    document.body.classList.remove('theme-light');
  }
  window.dispatchEvent(new CustomEvent('mb_theme_change', { detail: { theme } }));
}

// Initialize theme as soon as script evaluates
if (typeof window !== 'undefined') {
  applyTheme(getInitialTheme());
}

export function useTheme(): [ThemeMode, (mode: ThemeMode) => void, () => void] {
  const [theme, setThemeState] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    // Re-sync with actual DOM attribute
    const current = (document.documentElement.getAttribute('data-theme') as ThemeMode) || getInitialTheme();
    setThemeState(current);

    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ theme: ThemeMode }>;
      if (customEvent.detail?.theme) {
        setThemeState(customEvent.detail.theme);
      }
    };
    window.addEventListener('mb_theme_change', handler);
    return () => window.removeEventListener('mb_theme_change', handler);
  }, []);

  const setTheme = (next: ThemeMode) => {
    setThemeState(next);
    applyTheme(next);
  };

  const toggleTheme = () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  };

  return [theme, setTheme, toggleTheme];
}
