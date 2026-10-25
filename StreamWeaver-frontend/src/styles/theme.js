// Theme (light / dark) helpers.
//
// The colour tokens themselves (--bg, --surface, --accent, ...) are CSS
// custom properties in src/index.css — the dark set on :root and the light
// set on :root[data-theme='light'] — so every component picks them up with
// no JavaScript. This file decides WHICH set is active, remembers the choice,
// and lets JS code (e.g. a canvas) read the live token values.

export const THEME_STORAGE_KEY = 'sw-theme';
export const THEMES = ['dark', 'light'];

const isTheme = (value) => THEMES.includes(value);

// Saved choice wins; otherwise follow the OS; otherwise dark.
// `storage` / `matchMedia` are injectable so this can be unit-tested.
export function resolveTheme({ storage, matchMedia } = {}) {
  try {
    const saved = storage?.getItem(THEME_STORAGE_KEY);
    if (isTheme(saved)) return saved;
  } catch {
    /* storage blocked (private mode) — fall through */
  }
  try {
    if (matchMedia?.('(prefers-color-scheme: light)')?.matches) return 'light';
  } catch {
    /* ignore */
  }
  return 'dark';
}

export const getInitialTheme = () =>
  typeof window === 'undefined'
    ? 'dark'
    : resolveTheme({ storage: window.localStorage, matchMedia: window.matchMedia?.bind(window) });

export const nextTheme = (theme) => (theme === 'dark' ? 'light' : 'dark');

export function applyTheme(theme, { persist = true } = {}) {
  const value = isTheme(theme) ? theme : 'dark';
  document.documentElement.setAttribute('data-theme', value);
  if (persist) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {
      /* not fatal: the theme just won't be remembered */
    }
  }
  return value;
}

// Live value of a token for the active theme, e.g. readToken('--accent').
export function readToken(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
