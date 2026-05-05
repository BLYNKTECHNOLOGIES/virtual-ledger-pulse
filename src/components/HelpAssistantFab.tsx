import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * Floating "Eve-style" robot mascot button — opens the AI Help Assistant.
 * Pure SVG/CSS so it stays crisp at any size and feels alive (idle bob,
 * blinking eyes, hover wave).
 */
export function HelpAssistantFab() {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasPermission } = usePermissions();
  const [hover, setHover] = useState(false);

  if (location.pathname.startsWith("/help-assistant")) return null;
  if (!hasPermission("help_assistant_view") && !hasPermission("help_assistant_manage")) return null;

  return (
    <div className="fixed z-50 bottom-20 right-4 md:bottom-6 md:right-6 flex flex-col items-end gap-2 select-none">
      {/* Speech bubble tooltip on hover */}
      <div
        className={cn(
          "transition-all duration-300 origin-bottom-right",
          hover ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-95 pointer-events-none"
        )}
      >
        <div className="relative bg-white text-slate-800 text-xs font-medium px-3 py-2 rounded-2xl shadow-lg border border-slate-200">
          Hi! Need help? Ask me anything ✨
          <div className="absolute -bottom-1.5 right-6 w-3 h-3 bg-white border-r border-b border-slate-200 rotate-45" />
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate("/help-assistant")}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label="Open AI Help Assistant"
        className="group relative outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/50 rounded-full"
      >
        {/* Soft glow halo */}
        <span className="pointer-events-none absolute inset-0 rounded-full bg-cyan-300/40 blur-xl scale-110 animate-pulse" />

        {/* Pedestal / shadow */}
        <span className="pointer-events-none absolute left-1/2 -bottom-1 -translate-x-1/2 w-14 h-2 rounded-full bg-slate-900/25 blur-md" />

        {/* Robot body — bobs gently, tilts on hover */}
        <span
          className={cn(
            "relative block transition-transform duration-500 ease-out",
            "animate-[float_3s_ease-in-out_infinite]",
            hover && "scale-110 -rotate-3"
          )}
        >
          <RobotMascot waving={hover} />
        </span>
      </button>

      {/* Local keyframes */}
      <style>{`
        @keyframes float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
        @keyframes blink { 0%, 92%, 100% { transform: scaleY(1) } 95% { transform: scaleY(0.1) } }
        @keyframes wave  { 0%,100% { transform: rotate(-10deg) } 50% { transform: rotate(25deg) } }
      `}</style>
    </div>
  );
}

function RobotMascot({ waving }: { waving: boolean }) {
  return (
    <svg
      width="72"
      height="72"
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="drop-shadow-xl"
    >
      <defs>
        <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e6eef5" />
        </linearGradient>
        <linearGradient id="headGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#dde6ee" />
        </linearGradient>
        <linearGradient id="visorGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#1e3a5f" />
        </linearGradient>
        <radialGradient id="eyeGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7dffff" />
          <stop offset="100%" stopColor="#22d3ee" />
        </radialGradient>
      </defs>

      {/* Pedestal */}
      <ellipse cx="50" cy="92" rx="22" ry="4" fill="#cfd8e3" />
      <ellipse cx="50" cy="90" rx="22" ry="4" fill="#e8eef4" />

      {/* Body (rounded base) */}
      <path
        d="M30 70 Q30 55 50 55 Q70 55 70 70 L70 84 Q70 90 60 90 L40 90 Q30 90 30 84 Z"
        fill="url(#bodyGrad)"
        stroke="#cfd8e3"
        strokeWidth="0.6"
      />
      {/* Teal chest accent */}
      <path d="M44 72 Q50 68 56 72 L54 80 Q50 82 46 80 Z" fill="#5eead4" opacity="0.85" />
      <text x="50" y="78" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="#0f766e" fontFamily="system-ui">
        AI
      </text>

      {/* Left arm (static) */}
      <path d="M30 66 Q24 70 26 78" stroke="#cfd8e3" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <circle cx="26" cy="79" r="2.6" fill="#ffffff" stroke="#cfd8e3" strokeWidth="0.6" />

      {/* Right arm (waves on hover) */}
      <g
        style={{
          transformOrigin: "70px 64px",
          animation: waving ? "wave 0.6s ease-in-out infinite" : "none",
        }}
      >
        <path d="M70 64 Q80 58 82 50" stroke="#cfd8e3" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        <circle cx="82" cy="48" r="3" fill="#ffffff" stroke="#cfd8e3" strokeWidth="0.6" />
      </g>

      {/* Head */}
      <ellipse cx="50" cy="38" rx="22" ry="22" fill="url(#headGrad)" stroke="#cfd8e3" strokeWidth="0.6" />
      {/* Antenna */}
      <line x1="50" y1="16" x2="50" y2="11" stroke="#94a3b8" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="50" cy="9.5" r="2" fill="#22d3ee">
        <animate attributeName="r" values="2;2.6;2" dur="1.6s" repeatCount="indefinite" />
      </circle>

      {/* Visor */}
      <rect x="30" y="32" width="40" height="14" rx="7" fill="url(#visorGrad)" />
      {/* Eyes (blinking) */}
      <g style={{ transformOrigin: "40px 39px", animation: "blink 4s infinite" }}>
        <ellipse cx="40" cy="39" rx="3.2" ry="3.2" fill="url(#eyeGrad)" />
        <circle cx="41" cy="38" r="0.9" fill="#ffffff" />
      </g>
      <g style={{ transformOrigin: "60px 39px", animation: "blink 4s infinite" }}>
        <ellipse cx="60" cy="39" rx="3.2" ry="3.2" fill="url(#eyeGrad)" />
        <circle cx="61" cy="38" r="0.9" fill="#ffffff" />
      </g>

      {/* Cheek blush */}
      <circle cx="32" cy="46" r="2" fill="#fca5a5" opacity="0.55" />
      <circle cx="68" cy="46" r="2" fill="#fca5a5" opacity="0.55" />
    </svg>
  );
}
