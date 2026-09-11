import { useEffect, useRef, useState } from 'react';

// Smoothly counts from the previous value to the new value. Throttled to ~30fps
// to keep cost low when many numbers update simultaneously, and respects the
// global reduced-motion preference (just snaps to the target value).
//
// When `proportional` is true (default), the animation duration scales with the
// size of the jump — so a 1-point bump tweens quickly and a 14-point jump takes
// long enough to read as it ticks up, instead of slamming home in 700ms.
const MIN_FRAME_MS = 33;
const MS_PER_UNIT = 90;   // ~90ms per unit of difference when proportional
const MIN_DURATION = 320; // floor so 1-unit jumps still feel intentional
const MAX_DURATION = 2600; // cap so huge jumps don't crawl forever

export default function AnimatedNumber({
  value,
  duration = 700,
  proportional = true,
  className = '',
}) {
  const [display, setDisplay] = useState(value);
  const prevValueRef = useRef(value);
  const rafRef = useRef(0);
  const lastTickRef = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    const start = prevValueRef.current;
    const end = value;
    const diff = end - start;
    if (diff === 0) { setDisplay(end); return; }

    // Reduced motion: jump straight to value
    if (document.body.classList.contains('reduced-motion')) {
      setDisplay(end);
      prevValueRef.current = end;
      return;
    }

    const effectiveDuration = proportional
      ? Math.max(MIN_DURATION, Math.min(MAX_DURATION, Math.abs(diff) * MS_PER_UNIT))
      : duration;

    const startTime = performance.now();

    const tick = (now) => {
      if (now - lastTickRef.current < MIN_FRAME_MS) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      lastTickRef.current = now;
      const t = Math.min((now - startTime) / effectiveDuration, 1);
      // Ease-out-quart: starts fast, decelerates near the end.
      const eased = 1 - Math.pow(1 - t, 4);
      const current = Math.round(start + diff * eased);
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevValueRef.current = end;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration, proportional]);

  return <span className={className}>{display}</span>;
}
