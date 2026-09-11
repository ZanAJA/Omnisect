/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Base: layered black surfaces (50 = panel, 100 = canvas).
        paper: {
          50:  'rgb(var(--paper-50) / <alpha-value>)',
          100: 'rgb(var(--paper-100) / <alpha-value>)',
          150: 'rgb(var(--paper-150) / <alpha-value>)',
          200: 'rgb(var(--paper-200) / <alpha-value>)',
          300: 'rgb(var(--paper-300) / <alpha-value>)',
          400: 'rgb(var(--paper-400) / <alpha-value>)',
        },
        // Foreground: white linework and text. Higher = brighter / more emphasis.
        ink: {
          50:  'rgb(var(--ink-50) / <alpha-value>)',
          100: 'rgb(var(--ink-100) / <alpha-value>)',
          200: 'rgb(var(--ink-200) / <alpha-value>)',
          300: 'rgb(var(--ink-300) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
        },
        // Edge: atmospheric borders and dividers.
        mist: {
          100: 'rgb(var(--mist-100) / <alpha-value>)',
          200: 'rgb(var(--mist-200) / <alpha-value>)',
          300: 'rgb(var(--mist-300) / <alpha-value>)',
        },
        // Severity/result accents.
        risk: {
          critical: 'rgb(var(--risk-critical) / <alpha-value>)',
          high:     'rgb(var(--risk-high) / <alpha-value>)',
          medium:   'rgb(var(--risk-medium) / <alpha-value>)',
          low:      'rgb(var(--risk-low) / <alpha-value>)',
          info:     'rgb(var(--risk-info) / <alpha-value>)',
        },
        signal: {
          good: 'rgb(var(--signal-good) / <alpha-value>)',
          warn: 'rgb(var(--signal-warn) / <alpha-value>)',
          bad:  'rgb(var(--signal-bad) / <alpha-value>)',
        },
      },
    fontFamily: {
        display: ['Space Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Space Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans:  ['Space Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono:  ['JetBrains Mono', 'Consolas', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'ink-soft':  '0 1px 2px rgba(255,255,255,0.04), 0 0 24px rgba(142,160,255,0.08)',
        'ink-card':  '0 1px 0 rgba(255,255,255,0.10) inset, 0 0 42px rgba(142,160,255,0.10), 0 20px 42px -28px rgba(0,0,0,0.92)',
        'ink-lift':  '0 0 44px rgba(142,160,255,0.14), 0 18px 42px -24px rgba(255,255,255,0.18)',
      },
      animation: {
        'mist-drift': 'mistDrift 24s ease-in-out infinite',
        'fade-in':    'fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
        'lift-in':    'liftIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-in-left': 'slideInLeft 0.45s cubic-bezier(0.16, 1, 0.3, 1) both',
        'breathe':    'breathe 4s ease-in-out infinite',
      },
      keyframes: {
        mistDrift: {
          '0%, 100%': { transform: 'translateX(0) translateY(0)' },
          '50%':      { transform: 'translateX(24px) translateY(-12px)' },
        },
        fadeIn: {
          '0%':   { opacity: '0', transform: 'scale(0.97)', filter: 'blur(4px)' },
          '100%': { opacity: '1', transform: 'scale(1)',    filter: 'blur(0)' },
        },
        liftIn: {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%':   { opacity: '0', transform: 'translateX(-16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        breathe: {
          '0%, 100%': { opacity: '0.7' },
          '50%':      { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
