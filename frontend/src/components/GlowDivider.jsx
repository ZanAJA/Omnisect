// Thin luminous divider used between dense panels.

export default function GlowDivider({ variant = 'full', delay = 0, className = '' }) {
  const isSoft = variant === 'soft';
  const opacity = isSoft ? 0.32 : 0.72;

  return (
    <svg
      className={`block w-full ${className}`}
      viewBox="0 0 1000 8"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`divider-${variant}-${delay}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"  stopColor="#ffffff" stopOpacity="0" />
          <stop offset="18%" stopColor="#8ea0ff" stopOpacity={opacity * 0.42} />
          <stop offset="50%" stopColor="#ffffff" stopOpacity={opacity} />
          <stop offset="82%" stopColor="#32d583" stopOpacity={opacity * 0.30} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <filter id={`divider-glow-${variant}-${delay}`}>
          <feGaussianBlur stdDeviation={isSoft ? '1.2' : '2.2'} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path
        d="M 4,4 H 996"
        stroke={`url(#divider-${variant}-${delay})`}
        strokeWidth={isSoft ? 1 : 1.8}
        fill="none"
        strokeLinecap="round"
        filter={`url(#divider-glow-${variant}-${delay})`}
        style={{
          strokeDasharray: 1100,
          strokeDashoffset: 1100,
          animation: `drawDivider 900ms ${delay}ms cubic-bezier(0.16, 1, 0.3, 1) forwards`,
        }}
      />
    </svg>
  );
}
