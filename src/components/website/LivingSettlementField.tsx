import { useEffect, useRef } from 'react';

/**
 * LivingSettlementField — presentational only.
 *
 * A full-bleed Canvas 2D "field" for the auth stage: slow-rising columns of
 * small monospace market figures in three parallax depth layers, with periodic
 * luminous pulses that streak along faint horizontal settlement lines from a ₹
 * zone (left) to a ₮ zone (right). Pointer movement shifts the layers; focusing
 * a form input (via the `field-focus-ripple` window event) emits an expanding
 * ripple ring. All motion is disabled under prefers-reduced-motion (a single
 * static frame is drawn). rAF is paused while the tab is hidden.
 */

const BG = '#08080C';
// cyan → indigo family
const COLORS = [
  { r: 96, g: 200, b: 230 }, // cyan
  { r: 120, g: 150, b: 255 }, // indigo
  { r: 150, g: 130, b: 245 }, // violet-indigo
];

const FIGURES = [
  '108.02', '107.94', '108.11', '106.80', '109.20', '107.55',
  '₹2.4L', '₹50L', '₹1.2Cr', '₹88K', '₹3.1L', '₹640',
  '+0.4%', '-0.2%', '+1.1%', '-0.6%', '+0.9%', '+0.3%',
  'USDT', '₮', '₹', 'FILLED', 'SETTLED', 'x1.00',
];

// depth layers: [opacity, fontPx, speed, parallax]
const LAYERS = [
  { opacity: 0.12, font: 11, speed: 0.10, parallax: 0.35 },
  { opacity: 0.25, font: 13, speed: 0.18, parallax: 0.7 },
  { opacity: 0.45, font: 15, speed: 0.30, parallax: 1.15 },
];

const LINE_FRACTIONS = [0.28, 0.52, 0.74];

interface Glyph { x: number; y: number; layer: number; text: string; }
interface Pulse { line: number; t: number; }        // t: 0→1 progress
interface Ripple { x: number; y: number; t: number; } // t in seconds

export function LivingSettlementField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = 0, h = 0, dpr = 1;
    let glyphs: Glyph[] = [];
    let pulses: Pulse[] = [];
    let ripples: Ripple[] = [];
    let raf = 0;
    let last = performance.now();
    let nextPulseIn = 3000; // ms
    // pointer parallax (target + lerped current)
    let pxTarget = 0, pyTarget = 0, pxCur = 0, pyCur = 0;

    const isMobile = () => window.innerWidth < 1024;

    const build = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const target = isMobile() ? 45 : 110;
      const colCount = Math.max(6, Math.round(w / (isMobile() ? 64 : 92)));
      glyphs = [];
      for (let i = 0; i < target; i++) {
        const col = i % colCount;
        const jitter = (Math.random() - 0.5) * 30;
        const layer = i % 3; // even spread across depth layers
        glyphs.push({
          x: (col + 0.5) * (w / colCount) + jitter,
          y: Math.random() * h,
          layer,
          text: FIGURES[Math.floor(Math.random() * FIGURES.length)],
        });
      }
    };

    const drawStatic = () => {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const g of glyphs) {
        const L = LAYERS[g.layer];
        const c = COLORS[g.layer];
        ctx.font = `${L.font}px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${L.opacity})`;
        ctx.fillText(g.text, g.x, g.y);
      }
      // faint settlement lines + zone glyphs (static)
      for (const f of LINE_FRACTIONS) {
        const y = h * f;
        ctx.strokeStyle = 'rgba(150,170,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w * 0.06, y);
        ctx.lineTo(w * 0.94, y);
        ctx.stroke();
      }
      drawZones();
    };

    const drawZones = () => {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '600 22px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(150,170,255,0.16)';
      ctx.fillText('₹', w * 0.06, h * 0.5);
      ctx.fillStyle = 'rgba(150,130,245,0.16)';
      ctx.fillText('₮', w * 0.94, h * 0.5);
    };

    const frame = (now: number) => {
      const dt = Math.min(now - last, 48);
      last = now;

      // lerp parallax
      pxCur += (pxTarget - pxCur) * 0.06;
      pyCur += (pyTarget - pyCur) * 0.06;

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // rising glyph columns
      for (const g of glyphs) {
        const L = LAYERS[g.layer];
        g.y -= L.speed * dt * 0.12;
        if (g.y < -20) {
          g.y = h + 20;
          g.text = FIGURES[Math.floor(Math.random() * FIGURES.length)];
        }
        const c = COLORS[g.layer];
        const ox = pxCur * L.parallax;
        const oy = pyCur * L.parallax;
        ctx.font = `${L.font}px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${L.opacity})`;
        ctx.fillText(g.text, g.x + ox, g.y + oy);
      }

      // settlement lines
      for (const f of LINE_FRACTIONS) {
        const y = h * f + pyCur * 0.5;
        ctx.strokeStyle = 'rgba(150,170,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w * 0.06, y);
        ctx.lineTo(w * 0.94, y);
        ctx.stroke();
      }
      drawZones();

      // schedule pulses
      nextPulseIn -= dt;
      if (nextPulseIn <= 0) {
        pulses.push({ line: Math.floor(Math.random() * LINE_FRACTIONS.length), t: 0 });
        nextPulseIn = 3000 + Math.random() * 2000;
      }

      // draw + advance pulses (signature moment)
      const x0 = w * 0.06, x1 = w * 0.94;
      pulses = pulses.filter((p) => {
        p.t += dt / 1100; // ~1.1s traverse
        if (p.t >= 1.25) return false;
        const y = h * LINE_FRACTIONS[p.line] + pyCur * 0.5;
        const headX = x0 + (x1 - x0) * Math.min(p.t, 1);
        // fading trail
        const trailLen = 140;
        const grad = ctx.createLinearGradient(headX - trailLen, 0, headX, 0);
        grad.addColorStop(0, 'rgba(120,180,255,0)');
        grad.addColorStop(1, 'rgba(150,190,255,0.55)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(Math.max(x0, headX - trailLen), y);
        ctx.lineTo(Math.min(headX, x1), y);
        ctx.stroke();
        // luminous head
        if (p.t <= 1) {
          const glow = ctx.createRadialGradient(headX, y, 0, headX, y, 10);
          glow.addColorStop(0, 'rgba(220,235,255,0.9)');
          glow.addColorStop(1, 'rgba(150,190,255,0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(headX, y, 10, 0, Math.PI * 2);
          ctx.fill();
        }
        return true;
      });

      // focus ripples
      ripples = ripples.filter((rp) => {
        rp.t += dt / 1000;
        if (rp.t >= 1.1) return false;
        const radius = 40 + rp.t * 260;
        const alpha = 0.35 * (1 - rp.t / 1.1);
        ctx.strokeStyle = `rgba(150,180,255,${alpha})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        return true;
      });

      raf = requestAnimationFrame(frame);
    };

    const onPointer = (e: PointerEvent) => {
      pxTarget = ((e.clientX / window.innerWidth) - 0.5) * 12; // ±6px
      pyTarget = ((e.clientY / window.innerHeight) - 0.5) * 12;
    };

    const onRipple = () => {
      ripples.push({ x: w / 2, y: h / 2, t: 0 });
      if (ripples.length > 4) ripples.shift();
    };

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!reduced && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    const onResize = () => {
      build();
      if (reduced) drawStatic();
    };

    build();
    if (reduced) {
      drawStatic();
    } else {
      window.addEventListener('pointermove', onPointer, { passive: true });
      window.addEventListener('field-focus-ripple', onRipple as EventListener);
      raf = requestAnimationFrame(frame);
    }
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('field-focus-ripple', onRipple as EventListener);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
