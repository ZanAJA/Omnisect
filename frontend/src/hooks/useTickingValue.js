import { useEffect, useState } from 'react';

// Returns a state value that steps one unit at a time toward `target`, with a
// constant interval between steps. Use this when you want the user to perceive
// a counter as enumerating (1, 2, 3, …) rather than tweening with easing.
//
// Respects the global reduced-motion preference (snaps straight to target).
export function useTickingValue(target, stepMs = 70) {
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    if (display === target) return undefined;

    if (typeof document !== 'undefined' && document.body.classList.contains('reduced-motion')) {
      setDisplay(target);
      return undefined;
    }

    const id = setTimeout(() => {
      setDisplay((current) => {
        if (current === target) return current;
        return current + (target > current ? 1 : -1);
      });
    }, stepMs);

    return () => clearTimeout(id);
  }, [display, target, stepMs]);

  return display;
}
