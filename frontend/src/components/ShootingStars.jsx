import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';

// Ambient dust field for the app shell. When `scanning` is true the dust gathers
// into a slowly-rotating five-ring loader; when it flips back to false, the
// particles ease out to their wandering positions and resume drifting.
//
// A separate `gatherProgress` value smoothly ramps 0→1 (or 1→0) over ~1.2s when
// the scanning state changes. We use it as a mix factor between the particle's
// wander target and its ring target, which gives a visibly animated swoop in
// both directions rather than two equal lerps that look like the same thing.

const DUST_COUNT  = 360;          // denser field so the homepage feels populated
const RING_COUNT  = 5;            // 5 concentric rings (was 3)
const GATHER_RATE = 0.012;        // smaller = slower gather/disperse animation
const GATHER_LERP = 0.10;         // particle → mixed-target catch-up speed
const RELEASE_BOOST = 1.6;        // multiplier on outward kick when scan ends

// Cursor-magnet behaviour. Particles inside MAGNET_RADIUS get pulled toward
// the pointer with a smooth falloff — strongest at the edge of the range and
// tapering off near the cursor so they cluster around it rather than smashing
// into the same pixel.
const MAGNET_RADIUS    = 150;
const MAGNET_STRENGTH  = 0.18;    // fraction of the (dx,dy) applied per frame
const MAGNET_MIN_DIST  = 28;      // below this distance the pull stops

// Easing — smooth-step style, applied to gatherProgress before it's used as a
// mix factor. Makes the transition start gently, accelerate, and settle.
function easeInOut(t) {
  return t * t * (3 - 2 * t);
}

export default function ShootingStars({
  forceMotion = false,
  scanning = false,
  mode = null,           // 'scope' | 'config' | 'auth' — particle shape mode
  mouseMagnet = false,
}) {
  const canvasRef = useRef(null);

  // The "effective" gather mode: scanning rings win when a scan is live,
  // otherwise we surface whatever explicit shape mode the caller asked for.
  const effectiveMode = scanning ? 'scanning' : (mode || null);

  // All runtime-changing inputs go through refs so the setup useEffect can run
  // ONCE on mount. This keeps the particle field continuous when the user
  // navigates between targets or back to the home screen (prop changes used to
  // trigger init() and reset every particle to a new random position).
  const modeRef = useRef(effectiveMode);
  modeRef.current = effectiveMode;
  // Kept for the existing impulse/release "scan just ended" detection.
  const scanningRef = useRef(scanning);
  scanningRef.current = scanning;

  const magnetEnabledRef = useRef(mouseMagnet);
  magnetEnabledRef.current = mouseMagnet;

  // Live pointer position for the magnet effect — populated by window
  // mousemove. `active` flips off when the pointer leaves the window so
  // particles don't keep tracking a stale coordinate.
  const mouseRef = useRef({ x: -9999, y: -9999, active: false });

  const [reduced] = useReducedMotion();
  const shouldReduce = reduced && !forceMotion;
  const shouldReduceRef = useRef(shouldReduce);
  shouldReduceRef.current = shouldReduce;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let particles = [];
    let gatherProgress = 0;       // 0 = wander, 1 = gathered
    let prevGatherProgress = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const init = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      particles = Array.from({ length: DUST_COUNT }, (_, i) => {
        const x = Math.random() * w;
        const y = Math.random() * h;
        return {
          // Live position
          x, y,
          // "Home" position — wandering anchor when idle
          homeX: x,
          homeY: y,
          // Per-particle visual identity
          size: Math.random() * 1.6 + 0.5,
          vx: (Math.random() - 0.5) * 0.18,
          vy: (Math.random() - 0.5) * 0.14,
          orbit: Math.random() * Math.PI * 2,
          orbitSpeed: 0.00045 + Math.random() * 0.0011,
          opacity: 0.24 + Math.random() * 0.62,
          // Ring slot — golden-angle distribution gives an even spiral that
          // doesn't form obvious spokes when rendered.
          ring:      i % RING_COUNT,
          ringAngle: ((i * 137.508) * Math.PI) / 180,
          // Staggered delay so outer particles arrive first — produces a
          // satisfying "click in from outside" gather instead of one block.
          gatherDelay: (i % RING_COUNT) * 0.06,
          // Release impulse (set when scan ends — adds outward velocity briefly)
          impulseX: 0,
          impulseY: 0,
        };
      });
    };

    // ---- Per-mode shape target ----
    // Returns { x, y, lead } where `lead` is a 0..1 brightness modifier used
    // by the render step to fake a comet-tail on rotating shapes. Shapes that
    // don't rotate (or don't want a moving highlight) return lead = 1.
    function shapeTarget(modeName, i, p, total, cx, cy, R, t) {
      // --- scanning: existing 5-ring loader ---
      if (modeName === 'scanning') {
        const breath = Math.sin(t * 0.0014) * 7;
        const radii  = [R, R * 0.82, R * 0.64, R * 0.46, R * 0.28];
        const rots   = [t * 0.00075, t * -0.00060, t * 0.00115, t * -0.00090, t * 0.00150];
        const r      = radii[p.ring] + breath * (1 - p.ring * 0.15);
        const ang    = p.ringAngle + rots[p.ring];
        const rel    = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang), lead: 0.5 + 0.5 * Math.cos(rel) };
      }

      // --- scope: crosshair (outer ring + inner ring + cardinal cross arms) ---
      if (modeName === 'scope') {
        const rot = t * 0.00028;
        const cycle = i % 4;
        if (cycle === 0) {
          const a = (i / total) * Math.PI * 2 + rot;
          const rel = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), lead: 0.5 + 0.5 * Math.cos(rel) };
        }
        if (cycle === 1) {
          const a = (i / total) * Math.PI * 2 - rot;
          const r = R * 0.42;
          const rel = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), lead: 0.5 + 0.5 * Math.cos(rel) };
        }
        const horizontal = cycle === 2;
        const armT = ((i % 31) / 30 - 0.5) * 2;
        const armR = R * 1.18 * armT;
        return horizontal
          ? { x: cx + armR, y: cy, lead: 1 }
          : { x: cx, y: cy + armR, lead: 1 };
      }

      // --- config: cog/gear (inner hub + outer toothed perimeter) ---
      if (modeName === 'config') {
        const rot = t * 0.00045;
        const ratio = i / total;
        if (ratio < 0.28) {
          const a = (i / (total * 0.28)) * Math.PI * 2 - rot;
          const r = R * 0.30;
          return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), lead: 0.9 };
        }
        const teeth = 8;
        const a = ratio * Math.PI * 2 + rot;
        const bump = 0.22 * (Math.sin(a * teeth) * 0.5 + 0.5);
        const r = R * (0.82 + bump);
        // Brighter on the tooth tips (when bump is large).
        const lead = 0.55 + 0.45 * (bump / 0.22);
        return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), lead };
      }

      // --- auth: keyhole (round head + vertical slot) ---
      if (modeName === 'auth') {
        const ratio = i / total;
        const headSize = R * 0.42;
        const headCy   = cy - R * 0.10;
        const rot      = t * 0.00022;
        if (ratio < 0.55) {
          const a = (i / (total * 0.55)) * Math.PI * 2 + rot;
          const rel = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          return {
            x: cx + headSize * Math.cos(a),
            y: headCy + headSize * Math.sin(a),
            lead: 0.5 + 0.5 * Math.cos(rel),
          };
        }
        const j = i - Math.floor(total * 0.55);
        const slotTotal = total - Math.floor(total * 0.55);
        const side = (j % 2 === 0) ? -1 : 1;
        const along = (Math.floor(j / 2) / Math.max(1, Math.floor(slotTotal / 2)));
        const slotWidth  = R * 0.16;
        const slotHeight = R * 0.55;
        return {
          x: cx + side * slotWidth,
          y: headCy + headSize * 0.72 + along * slotHeight,
          lead: 1,
        };
      }

      // Unknown mode — tight ring fallback so the picture is never empty.
      const a = (i / total) * Math.PI * 2 + t * 0.0004;
      const rel = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), lead: 0.5 + 0.5 * Math.cos(rel) };
    }

    const drawFrame = (t) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cx = w / 2;
      const cy = h / 2;

      // Reduced-motion: render a single static snapshot of the current particle
      // positions and skip all updates. We still call RAF so when motion gets
      // re-enabled the loop picks up seamlessly from where it left off.
      if (shouldReduceRef.current) {
        ctx.clearRect(0, 0, w, h);
        for (const p of particles) {
          ctx.fillStyle = `rgba(255,255,255,${(p.opacity * 0.6).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        raf = requestAnimationFrame(drawFrame);
        return;
      }

      // ---- Smoothly track gatherProgress toward the desired state -------
      const activeMode  = modeRef.current; // null | 'scanning' | 'scope' | 'config' | 'auth'
      const targetGather = activeMode ? 1 : 0;
      prevGatherProgress = gatherProgress;
      gatherProgress += (targetGather - gatherProgress) * GATHER_RATE;
      if (Math.abs(gatherProgress - targetGather) < 0.0008) gatherProgress = targetGather;

      // Detect "scan just ended" so we can kick particles outward once.
      // (Only fires for the scanning ring loader, not the navigation shapes.)
      const justReleased = prevGatherProgress > 0.5 && targetGather === 0
        && gatherProgress < prevGatherProgress && scanningRef.current === false;
      if (justReleased) {
        for (const p of particles) {
          const dx = p.x - cx;
          const dy = p.y - cy;
          const d = Math.hypot(dx, dy) || 1;
          p.impulseX = (dx / d) * RELEASE_BOOST * (0.6 + Math.random() * 0.8);
          p.impulseY = (dy / d) * RELEASE_BOOST * (0.6 + Math.random() * 0.8);
        }
      }

      const baseRadius = Math.min(w, h) * 0.18;

      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // ---- Wander target (always computed; used at low gather) --------
        const wave = Math.sin(t * p.orbitSpeed + p.orbit);
        const driftX = Math.cos(t * p.orbitSpeed * 0.8 + p.orbit) * 0.045;
        const driftY = wave * 0.04;
        const wanderTargetX = p.homeX + Math.cos(t * p.orbitSpeed * 0.8 + p.orbit) * 14;
        const wanderTargetY = p.homeY + Math.sin(t * p.orbitSpeed + p.orbit) * 10;

        // ---- Shape target (used at high gather) — mode-aware ------------
        // When no mode is active (we're just dispersing), keep using the
        // particle's last-known scanning slot so the disperse animation has
        // a starting point. We freeze the mode used at "ramp" time so a
        // shape doesn't morph mid-disperse.
        const renderMode = activeMode || p.lastMode || 'scanning';
        if (activeMode) p.lastMode = activeMode;
        const shape = shapeTarget(renderMode, i, p, particles.length, cx, cy, baseRadius, t);
        const ringTargetX = shape.x;
        const ringTargetY = shape.y;

        // ---- Mix the two targets via eased gather progress, with a small
        //      per-particle delay so the gather/disperse wave is visible. --
        const eased = easeInOut(Math.max(0, Math.min(1, gatherProgress - p.gatherDelay)));
        const tx = wanderTargetX + (ringTargetX - wanderTargetX) * eased;
        const ty = wanderTargetY + (ringTargetY - wanderTargetY) * eased;

        // Apply lerp + release impulse + wander drift (drift weighted by 1-eased
        // so it tapers off as the particle is captured by the ring).
        p.x += (tx - p.x) * GATHER_LERP;
        p.y += (ty - p.y) * GATHER_LERP;
        const driftMix = 1 - eased;
        p.x += (p.vx + driftX) * driftMix;
        p.y += (p.vy + driftY) * driftMix;
        p.x += p.impulseX;
        p.y += p.impulseY;
        p.impulseX *= 0.88;   // decay outward kick
        p.impulseY *= 0.88;

        // ---- Cursor magnet — wander mode only (so it can't fight the loader) --
        // Smooth attractive force toward the pointer with quadratic falloff and
        // a dead zone near the cursor so particles cluster around rather than
        // pile on top of it. Position only — no visual brightness boost.
        if (magnetEnabledRef.current && mouseRef.current.active && eased < 0.05) {
          const mdx = mouseRef.current.x - p.x;
          const mdy = mouseRef.current.y - p.y;
          const md  = Math.hypot(mdx, mdy);
          if (md > MAGNET_MIN_DIST && md < MAGNET_RADIUS) {
            const falloff = 1 - md / MAGNET_RADIUS;       // 0 at edge, 1 at min
            const force   = MAGNET_STRENGTH * falloff * falloff;
            p.x += mdx * force;
            p.y += mdy * force;
          }
        }

        // Wrap edges in wander mode only (don't wrap mid-gather)
        if (eased < 0.05) {
          if (p.x < -8)   { p.x = w + 8; p.homeX = p.x; }
          if (p.x > w + 8) { p.x = -8;   p.homeX = p.x; }
          if (p.y < -8)   { p.y = h + 8; p.homeY = p.y; }
          if (p.y > h + 8) { p.y = -8;   p.homeY = p.y; }
        }

        // ---- Render -----------------------------------------------------
        let alpha, size;
        if (eased > 0.05) {
          // Comet-tail brightness — `lead` comes from the shape function so
          // each mode controls its own highlight (rotating ring vs uniform).
          const lead = shape.lead != null ? shape.lead : 1;
          alpha = (0.20 + 0.80 * lead) * (0.85 + 0.15 * wave);
          // Blend the wander opacity into the ring opacity so the transition
          // doesn't pop.
          const wanderAlpha = p.opacity * (0.62 + 0.38 * (0.5 + 0.5 * wave));
          alpha = wanderAlpha + (alpha - wanderAlpha) * eased;
          size  = p.size * (1 + (0.25 + lead * 0.6) * eased);

          ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
          ctx.fill();
          if (lead > 0.65 && eased > 0.55) {
            ctx.fillStyle = `rgba(255,255,255,${(alpha * 0.20 * eased).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, size * 2.4, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          alpha = p.opacity * (0.62 + 0.38 * (0.5 + 0.5 * wave));
          size  = p.size;
          ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
          ctx.fill();
          if (size > 1) {
            ctx.fillStyle = `rgba(255,255,255,${(alpha * 0.14).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, size * 2.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      raf = requestAnimationFrame(drawFrame);
    };

    resize();
    init();
    raf = requestAnimationFrame(drawFrame);

    // Resize keeps the canvas crisp but does NOT reinitialize particles —
    // they keep their relative positions and just get wrapped at the new
    // viewport edges by the wander code.
    const onResize = () => resize();
    window.addEventListener('resize', onResize);

    // Mouse-magnet listeners — always attached, but the magnet code in the
    // draw loop only consumes them when `magnetEnabledRef.current` is true.
    const onMouseMove = (e) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      mouseRef.current.active = true;
    };
    const onMouseLeave = () => { mouseRef.current.active = false; };
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('mouseout',  onMouseLeave, { passive: true });
    window.addEventListener('blur',      onMouseLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseout',  onMouseLeave);
      window.removeEventListener('blur',      onMouseLeave);
    };
    // Intentionally empty: setup happens once on mount, and all runtime-changing
    // values (scanning, shouldReduce, mouseMagnet) are read through refs inside
    // drawFrame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      aria-hidden="true"
    />
  );
}
