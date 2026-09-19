'use client';

import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';
const STORAGE_KEY = 'fluid-theme-v2';
const EVENT = 'fluid-theme-change';

const currentTheme = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

/** Dark by default. Every toggle on the page stays in sync, and the switch cross-fades smoothly. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    setTheme(currentTheme());
    const sync = () => setTheme(currentTheme());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const toggle = () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    const apply = () => {
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
      window.dispatchEvent(new Event(EVENT));
    };
    const doc = document as Document & { startViewTransition?: (callback: () => void) => unknown };
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (doc.startViewTransition && !reduceMotion) doc.startViewTransition(apply);
    else apply();
  };

  const dark = theme === 'dark';
  return (
    <button type="button" className="theme-toggle" onClick={toggle} role="switch" aria-checked={dark} aria-label="Dark mode" title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <span className="theme-toggle-track">
        <span className="theme-toggle-thumb" aria-hidden="true">{dark ? '\u263E' : '\u2600'}</span>
      </span>
    </button>
  );
}
