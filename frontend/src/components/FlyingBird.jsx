import { useEffect, useState } from 'react';

// A small SVG bird that periodically flies across the top of the viewport.
// Triggers on an internal timer + whenever `triggerKey` changes (e.g. scan complete).
export default function FlyingBird({ triggerKey = 0 }) {
  const [flight, setFlight] = useState(null);

  const launch = () => {
    const seed = Date.now();
    const yStart = 8 + Math.random() * 18;        // top viewport position (%)
    const yDrift = -6 + Math.random() * 12;       // vertical drift over flight
    const duration = 11 + Math.random() * 4;      // seconds
    const direction = Math.random() > 0.5 ? 1 : -1;
    setFlight({ seed, yStart, yDrift, duration, direction });
    setTimeout(() => setFlight(null), duration * 1000 + 200);
  };

  // Initial launch + periodic
  useEffect(() => {
    const initial = setTimeout(launch, 3500);
    const interval = setInterval(launch, 32000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, []);

  // External trigger (e.g. scan completion)
  useEffect(() => {
    if (triggerKey > 0) launch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerKey]);

  if (!flight) return null;

  const { seed, yStart, yDrift, duration, direction } = flight;

  return (
    <div
      key={seed}
      className="bird-flight"
      style={{
        '--y-start': `${yStart}vh`,
        '--y-drift': `${yDrift}px`,
        '--duration': `${duration}s`,
        '--direction': direction,
      }}
    >
      <svg width="26" height="14" viewBox="0 0 26 14" className="bird-wings">
        <path
          d="M2,8 Q7,2 13,8 Q19,2 24,8"
          stroke="#ffffff"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>
    </div>
  );
}
