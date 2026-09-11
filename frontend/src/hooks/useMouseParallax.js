import { useEffect } from 'react';

// Writes smoothed mouse position to CSS custom properties (--mx / --my, range -1..1)
// on the given ref's DOM node. Pauses entirely when the tab is hidden or the user
// has reduced-motion enabled — no wasted CPU.
export function useMouseParallax(targetRef, { lerp = 0.06 } = {}) {
  useEffect(() => {
    if (!targetRef.current) return undefined;
    const node = targetRef.current;

    let raf = 0;
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };

    const handleMove = (e) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 2;
      target.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    const tick = () => {
      const reduced = document.body.classList.contains('reduced-motion');
      if (document.visibilityState === 'visible' && !reduced) {
        current.x += (target.x - current.x) * lerp;
        current.y += (target.y - current.y) * lerp;
        node.style.setProperty('--mx', current.x.toFixed(3));
        node.style.setProperty('--my', current.y.toFixed(3));
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      cancelAnimationFrame(raf);
    };
  }, [targetRef, lerp]);
}
