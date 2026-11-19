import { useEffect, useState } from 'react';

const STORAGE_KEY = 'mb_neon';

export function getInitialNeon(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch (e) {
    return true;
  }
}

export function applyNeon(enabled: boolean): void {
  if (typeof document === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch (e) {
    // ignore
  }
  window.dispatchEvent(new CustomEvent('mb_neon_change', { detail: { enabled } }));
}

/** Ambiance néon / glassmorphism : fond animé + cartes translucides. */
export function useNeonFx(): [boolean, () => void] {
  const [enabled, setEnabled] = useState<boolean>(getInitialNeon);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ enabled: boolean }>).detail;
      if (detail) setEnabled(detail.enabled);
    };
    window.addEventListener('mb_neon_change', handler);
    return () => window.removeEventListener('mb_neon_change', handler);
  }, []);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    applyNeon(next);
  };

  return [enabled, toggle];
}
