import { useEffect, useState, useCallback } from 'react';
import { storage } from '../lib/storage';

function osPrefersReduced() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useReducedMotion() {
  const [reduced, setReducedState] = useState(() => {
    const stored = storage.loadReducedMotion();
    if (stored !== null) return stored;
    return osPrefersReduced();
  });

  useEffect(() => {
    document.body.classList.toggle('reduced-motion', reduced);
  }, [reduced]);

  // Follow OS preference until the user explicitly toggles (saved preference).
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event) => {
      if (storage.loadReducedMotion() === null) {
        setReducedState(event.matches);
      }
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setReduced = useCallback((value) => {
    setReducedState((current) => {
      const next = typeof value === 'function' ? value(current) : value;
      storage.saveReducedMotion(Boolean(next));
      return Boolean(next);
    });
  }, []);

  return [reduced, setReduced];
}
