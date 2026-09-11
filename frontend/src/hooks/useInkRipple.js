import { useEffect } from 'react';

// Spawns a soft ink-bleed circle at the cursor position whenever the user clicks
// an interactive element. Pure DOM, no React renders.
export function useInkRipple() {
  useEffect(() => {
    const handler = (e) => {
      const target = e.target.closest('button, a, [role="button"]');
      if (!target || target.disabled) return;

      const ripple = document.createElement('span');
      ripple.className = 'pulse-ripple-fx';
      ripple.style.left = `${e.clientX}px`;
      ripple.style.top = `${e.clientY}px`;
      document.body.appendChild(ripple);
      // Auto-remove after the animation finishes
      setTimeout(() => ripple.remove(), 900);
    };

    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, []);
}
