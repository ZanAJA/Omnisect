// Sumi-e landscape — composed to match the reference: detailed pine on the LEFT,
// reeds on the RIGHT shore, a prominent dark peak right-of-center, layered mist
// receding into the sky, faint flock of birds, water reflection at the bottom.

export default function MountainBackdrop({ className = '' }) {
  return (
    <div className={`absolute inset-x-0 bottom-0 w-full pointer-events-none select-none ${className}`}>
      {/* Slow-drifting cloud band */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: '14%',
          height: '18%',
          background: 'radial-gradient(ellipse 70% 100% at 50% 50%, rgba(252, 249, 240, 0.7), transparent 70%)',
          animation: 'cloudDrift 26s ease-in-out infinite',
          filter: 'blur(10px)',
        }}
      />

      <svg
        viewBox="0 0 1600 800"
        preserveAspectRatio="xMidYEnd slice"
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
      >
        <defs>
          {/* Atmospheric gradients — pure black at varying opacities */}
          <linearGradient id="washVeryFar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.0" />
            <stop offset="60%" stopColor="#ffffff" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.10" />
          </linearGradient>
          <linearGradient id="washFar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.16" />
          </linearGradient>
          <linearGradient id="washMid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.26" />
          </linearGradient>
          <linearGradient id="washNear" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.42" />
          </linearGradient>
          {/* Dramatic peak — even darker, slightly textured */}
          <linearGradient id="washPeak" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.65" />
          </linearGradient>
          <linearGradient id="washReflect" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.00" />
          </linearGradient>

          <filter id="blur-soft">  <feGaussianBlur stdDeviation="2" /> </filter>
          <filter id="blur-medium"><feGaussianBlur stdDeviation="1.2" /></filter>
          <filter id="blur-water"> <feGaussianBlur stdDeviation="3.5" /></filter>
        </defs>

        {/* ─── Distant mountain washes (parallax: far) ─── */}
        <g className="parallax-far">
          <path
            filter="url(#blur-soft)"
            fill="url(#washVeryFar)"
            d="M0,380
               C 120,330 220,360 340,320
               C 460,280 560,350 700,310
               C 820,275 920,340 1060,300
               C 1200,265 1320,330 1460,290
               C 1540,265 1580,300 1600,290
               L1600,800 L0,800 Z"
          />
          <path
            filter="url(#blur-soft)"
            fill="url(#washFar)"
            d="M0,440
               C 100,410 200,425 320,380
               C 440,335 540,410 660,365
               C 780,325 880,395 1020,360
               C 1160,330 1280,395 1440,370
               C 1520,358 1580,378 1600,372
               L1600,800 L0,800 Z"
          />

          {/* Birds — small flocks in two groups, like the reference */}
          <g fill="none" stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round">
            {/* Right cluster — drifting upward */}
            <g opacity="0.6">
              <path d="M 720,140 q 5,-4 10,0 q 5,-4 10,0" />
              <path d="M 760,115 q 6,-5 12,0 q 6,-5 12,0" />
              <path d="M 795,135 q 5,-4 10,0 q 5,-4 10,0" />
              <path d="M 830,100 q 4,-3 8,0 q 4,-3 8,0" />
              <path d="M 855,128 q 4,-3 8,0 q 4,-3 8,0" />
              <path d="M 880,108 q 5,-4 10,0 q 5,-4 10,0" />
              <path d="M 910,140 q 4,-3 8,0 q 4,-3 8,0" />
            </g>
            {/* Smaller scattered pair */}
            <g opacity="0.45">
              <path d="M 640,180 q 4,-3 8,0 q 4,-3 8,0" />
              <path d="M 950,175 q 4,-3 8,0 q 4,-3 8,0" />
            </g>
          </g>
        </g>

        {/* ─── Mid mountain layer ─── */}
        <g className="parallax-mid">
          <path
            filter="url(#blur-medium)"
            fill="url(#washMid)"
            d="M0,500
               C 80,475 180,490 280,460
               C 380,430 480,490 600,460
               C 700,432 800,475 920,455
               C 1040,432 1160,478 1280,455
               C 1400,432 1500,475 1600,455
               L1600,800 L0,800 Z"
          />
        </g>

        {/* ─── Near mountains + dramatic peak ─── */}
        <g className="parallax-near">
          {/* Standard near ridge */}
          <path
            fill="url(#washNear)"
            d="M0,560
               C 80,540 180,548 280,520
               C 380,495 480,535 600,518
               C 700,505 800,530 880,515
               L880,800 L0,800 Z"
          />
          {/* Dramatic peak — the focal mountain on the right */}
          <path
            fill="url(#washPeak)"
            d="M 760,540
               C 820,500 880,440 980,360
               C 1040,310 1080,330 1120,400
               C 1160,470 1200,500 1260,520
               C 1320,540 1380,535 1450,525
               C 1520,518 1580,530 1600,528
               L1600,800 L760,800 Z"
          />
          {/* Subtle texture lines on the dramatic peak (rocky face) */}
          <g stroke="#ffffff" strokeLinecap="round" opacity="0.18" fill="none">
            <path d="M 990,395 q 8,18 4,40" strokeWidth="1.2" />
            <path d="M 1010,420 q 6,15 0,32" strokeWidth="1.0" />
            <path d="M 1030,440 q 4,12 -2,26" strokeWidth="0.9" />
          </g>

          {/* Water reflection — band beneath the shore */}
          <g filter="url(#blur-water)" opacity="0.75">
            <rect x="0" y="640" width="1600" height="80" fill="url(#washReflect)" />
            {/* Stillness lines */}
            <line x1="80"   y1="668" x2="640"  y2="668" stroke="#ffffff" strokeWidth="0.5" opacity="0.18" />
            <line x1="780"  y1="685" x2="1280" y2="685" stroke="#ffffff" strokeWidth="0.5" opacity="0.15" />
            <line x1="200"  y1="708" x2="1100" y2="708" stroke="#ffffff" strokeWidth="0.5" opacity="0.12" />
            <line x1="500"  y1="725" x2="1400" y2="725" stroke="#ffffff" strokeWidth="0.5" opacity="0.09" />
          </g>

          {/* ─── Foreground pine on the LEFT (like reference) ─── */}
          <g transform="translate(110, 380)">
            {/* Main trunk — gestural, slightly curved */}
            <path
              d="M 0,260 Q -4,200 6,140 Q 12,90 4,40 Q 0,18 -6,0"
              stroke="#ffffff"
              strokeWidth="2.4"
              fill="none"
              strokeLinecap="round"
              opacity="0.92"
            />
            {/* Branch ramifications */}
            <path d="M 4,140 Q 30,130 60,128" stroke="#ffffff" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.85" />
            <path d="M -2,90 Q -32,82 -58,90" stroke="#ffffff" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.85" />
            <path d="M 6,200 Q 28,196 48,200" stroke="#ffffff" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.78" />
            <path d="M -2,40 Q 22,32 44,38" stroke="#ffffff" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.78" />

            {/* Pine canopies — flat ellipse "platforms" of needles, sumi-e style */}
            <g fill="#ffffff">
              <ellipse cx="-50" cy="86"  rx="38" ry="9"  opacity="0.86" />
              <ellipse cx="-30" cy="76"  rx="26" ry="6"  opacity="0.78" />
              <ellipse cx="68"  cy="124" rx="42" ry="10" opacity="0.88" />
              <ellipse cx="48"  cy="114" rx="28" ry="7"  opacity="0.78" />
              <ellipse cx="-12" cy="32"  rx="32" ry="8"  opacity="0.82" />
              <ellipse cx="6"   cy="22"  rx="22" ry="6"  opacity="0.72" />
              <ellipse cx="54"  cy="198" rx="34" ry="8"  opacity="0.78" />
              <ellipse cx="-44" cy="232" rx="26" ry="7"  opacity="0.72" />
            </g>

            {/* Needle texture — fine radial strokes from each canopy */}
            <g stroke="#ffffff" strokeWidth="0.5" strokeLinecap="round" opacity="0.55" fill="none">
              <path d="M -82,86 l -8,-3 M -82,88 l -8,2 M -80,82 l -6,-5" />
              <path d="M 108,124 l 8,-3 M 108,126 l 9,3 M 106,118 l 7,-6" />
              <path d="M 18,30 l -4,-8 M 24,28 l 2,-9 M 30,30 l 6,-8" />
            </g>

            {/* Bonsai-style ground tuft */}
            <path
              d="M -30,262 q 10,-6 22,-4 q 14,-3 28,2 q 14,-2 26,0"
              stroke="#ffffff" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.75"
            />
          </g>

          {/* ─── Reeds on the RIGHT shore ─── */}
          <g transform="translate(1380, 600)" opacity="0.65">
            <g stroke="#ffffff" strokeLinecap="round" fill="none">
              <path d="M 0,40   Q  -4,10  -8,-40"  strokeWidth="1.1" />
              <path d="M 14,42  Q  10,14   8,-30"  strokeWidth="1.0" />
              <path d="M 28,40  Q  26,18  24,-20"  strokeWidth="1.0" />
              <path d="M 44,42  Q  44,20  46,-26"  strokeWidth="1.1" />
              <path d="M 62,40  Q  64,18  68,-32"  strokeWidth="1.1" />
              <path d="M 80,42  Q  80,16  78,-18"  strokeWidth="0.9" />
              <path d="M 96,40  Q  98,18 102,-24"  strokeWidth="1.0" />
              <path d="M 116,42 Q 118,18 122,-28"  strokeWidth="1.0" />
              <path d="M 132,40 Q 134,12 136,-36"  strokeWidth="1.1" />
              <path d="M 150,42 Q 152,16 156,-22"  strokeWidth="1.0" />
            </g>
            {/* Reed tips */}
            <g stroke="#ffffff" strokeWidth="0.7" strokeLinecap="round" opacity="0.7">
              <path d="M -8,-40  l -3,3   M -8,-40  l 3,-3" />
              <path d="M 46,-26  l -3,3   M 46,-26  l 3,-3" />
              <path d="M 68,-32  l -3,3   M 68,-32  l 3,-3" />
              <path d="M 122,-28 l -3,3   M 122,-28 l 3,-3" />
              <path d="M 136,-36 l -3,3   M 136,-36 l 3,-3" />
            </g>
          </g>

          {/* Subtle floating bird in the lower portion (reflection-side detail) */}
          <g opacity="0.4" fill="none" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round">
            <path d="M 1200,720 q 5,-4 10,0 q 5,-4 10,0" />
          </g>
        </g>
      </svg>
    </div>
  );
}
