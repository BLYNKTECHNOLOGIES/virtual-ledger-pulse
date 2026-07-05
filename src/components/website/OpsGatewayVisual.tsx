/**
 * OpsGatewayVisual — presentational only.
 * A crafted, brand-meaningful ambient scene for the auth "meaning side":
 * an ultra-subtle dot grid with thin luminous streams flowing left→right
 * between an INR (₹) node cluster and a USDT (₮) node cluster — abstracting
 * Blynk's settlement flow. All motion is gated behind
 * `prefers-reduced-motion: no-preference` (see index.css).
 */

const INDIGO = 'hsl(231 81% 62%)';
const PURPLE = 'hsl(265 80% 64%)';

// Bezier streams connecting the ₹ side (left) to the ₮ side (right).
const STREAMS = [
  'M 120 180 C 240 150, 360 260, 480 210',
  'M 120 300 C 250 300, 350 300, 480 300',
  'M 120 420 C 240 460, 360 350, 480 400',
  'M 120 250 C 260 210, 340 400, 480 250',
  'M 120 360 C 250 400, 360 250, 480 350',
];

const STAT_CHIPS = [
  { top: '16%', label: '₹50L+ processed today', dot: INDIGO, delay: '0s' },
  { top: '46%', label: '24/7 settlement desk', dot: 'hsl(152 60% 50%)', delay: '-3s' },
  { top: '74%', label: '₮ liquidity synced', dot: PURPLE, delay: '-6s' },
];

export function OpsGatewayVisual() {
  return (
    <div
      aria-hidden="true"
      className="relative hidden w-full self-stretch overflow-hidden bg-[hsl(231_45%_5%)] lg:block"
    >
      {/* Ultra-subtle dot grid */}
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage: 'radial-gradient(hsl(231 60% 78% / 0.10) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
        }}
      />
      {/* Quiet brand wash */}
      <div className="absolute -top-32 left-1/3 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-[hsl(231_81%_55%)]/12 blur-[150px]" />
      <div className="absolute bottom-[-8rem] right-0 h-[30rem] w-[30rem] rounded-full bg-[hsl(265_80%_58%)]/10 blur-[150px]" />

      {/* Settlement streams */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 600 600"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <defs>
          <linearGradient id="ops-stream-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={INDIGO} stopOpacity="0.05" />
            <stop offset="50%" stopColor={INDIGO} stopOpacity="0.55" />
            <stop offset="100%" stopColor={PURPLE} stopOpacity="0.05" />
          </linearGradient>
          <radialGradient id="ops-node-glow">
            <stop offset="0%" stopColor={INDIGO} stopOpacity="0.9" />
            <stop offset="100%" stopColor={INDIGO} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* base faint stream lines */}
        {STREAMS.map((d, i) => (
          <path key={`base-${i}`} d={d} stroke="hsl(231 60% 78% / 0.08)" strokeWidth="1" />
        ))}
        {/* animated flowing dashes */}
        {STREAMS.map((d, i) => (
          <path
            key={`flow-${i}`}
            d={d}
            className="ops-stream"
            stroke="url(#ops-stream-grad)"
            strokeWidth="1.5"
            strokeDasharray="4 24"
            style={{ animationDelay: `${-i * 0.6}s` }}
          />
        ))}
        {/* travelling pulses */}
        {STREAMS.slice(0, 3).map((d, i) => (
          <circle
            key={`pulse-${i}`}
            className="ops-pulse"
            r="3"
            fill="hsl(0 0% 100%)"
            style={{ offsetPath: `path('${d}')`, animationDelay: `${-i * 1.5}s` }}
          />
        ))}

        {/* ₹ cluster (left) */}
        <g className="ops-node" style={{ transformOrigin: '120px 300px' }}>
          <circle cx="120" cy="300" r="34" fill="url(#ops-node-glow)" />
          <circle cx="120" cy="300" r="20" fill="hsl(231 45% 8%)" stroke={INDIGO} strokeWidth="1.2" />
          <text x="120" y="308" textAnchor="middle" fontSize="20" fill="hsl(0 0% 100% / 0.9)" fontWeight="600">₹</text>
        </g>
        {/* ₮ cluster (right) */}
        <g className="ops-node" style={{ transformOrigin: '480px 300px', animationDelay: '-2s' }}>
          <circle cx="480" cy="300" r="34" fill="url(#ops-node-glow)" />
          <circle cx="480" cy="300" r="20" fill="hsl(231 45% 8%)" stroke={PURPLE} strokeWidth="1.2" />
          <text x="480" y="308" textAnchor="middle" fontSize="18" fill="hsl(0 0% 100% / 0.9)" fontWeight="600">₮</text>
        </g>
      </svg>

      {/* Floating stat chips */}
      <div className="absolute inset-0">
        {STAT_CHIPS.map((chip) => (
          <div
            key={chip.label}
            className="ops-chip absolute right-[8%] flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 backdrop-blur-md"
            style={{ top: chip.top, animationDelay: chip.delay }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: chip.dot }} />
            <span className="font-mono text-[11px] tracking-tight text-white/80">{chip.label}</span>
          </div>
        ))}
      </div>

      {/* Bottom fade for grounding */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[hsl(231_45%_4%)] to-transparent" />
    </div>
  );
}
