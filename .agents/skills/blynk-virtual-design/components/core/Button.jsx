import React from "react";
import { Icon } from "./Icon.jsx";

const SIZES = {
  sm: { h: "var(--control-h-sm)", px: 12, fs: "var(--text-sm)", gap: 6, icon: 16 },
  md: { h: "var(--control-h)", px: 18, fs: "var(--text-sm)", gap: 8, icon: 18 },
  lg: { h: "var(--control-h-lg)", px: 24, fs: "var(--text-base)", gap: 10, icon: 20 },
};

const VARIANTS = {
  primary: { background: "var(--cyan-500)", color: "#fff", border: "1px solid var(--cyan-500)", boxShadow: "var(--shadow-xs)" },
  secondary: { background: "var(--neutral-0)", color: "var(--text-heading)", border: "1px solid var(--border-default)", boxShadow: "var(--shadow-xs)" },
  ink: { background: "var(--neutral-1000)", color: "#fff", border: "1px solid var(--neutral-1000)", boxShadow: "var(--shadow-xs)" },
  ghost: { background: "transparent", color: "var(--text-brand)", border: "1px solid transparent", boxShadow: "none" },
  danger: { background: "var(--danger-500)", color: "#fff", border: "1px solid var(--danger-500)", boxShadow: "var(--shadow-xs)" },
};

const HOVER = {
  primary: { background: "var(--cyan-600)", borderColor: "var(--cyan-600)", boxShadow: "var(--shadow-brand)" },
  secondary: { background: "var(--neutral-50)", borderColor: "var(--border-strong)" },
  ink: { background: "var(--neutral-800)", borderColor: "var(--neutral-800)" },
  ghost: { background: "var(--hover-tint)" },
  danger: { background: "var(--danger-700)", borderColor: "var(--danger-700)" },
};

/** Primary action control. Rounded 10px, geometric label, brand-glow on hover. */
export function Button({ variant = "primary", size = "md", iconLeft, iconRight, block, disabled, children, style, ...rest }) {
  const [hov, setHov] = React.useState(false);
  const [act, setAct] = React.useState(false);
  const s = SIZES[size] || SIZES.md;
  return (
    <button
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setAct(false); }}
      onMouseDown={() => setAct(true)}
      onMouseUp={() => setAct(false)}
      style={{
        display: block ? "flex" : "inline-flex", width: block ? "100%" : undefined,
        alignItems: "center", justifyContent: "center", gap: s.gap,
        height: s.h, padding: `0 ${s.px}px`, borderRadius: "var(--radius-control)",
        fontFamily: "var(--font-sans)", fontWeight: "var(--weight-semibold)",
        fontSize: s.fs, letterSpacing: "0.01em", cursor: disabled ? "not-allowed" : "pointer",
        transition: "var(--transition-control)", whiteSpace: "nowrap",
        ...VARIANTS[variant],
        ...(hov && !disabled ? HOVER[variant] : null),
        transform: act && !disabled ? "var(--press-scale)" : "none",
        opacity: disabled ? 0.42 : 1,
        ...style,
      }}
      {...rest}
    >
      {iconLeft ? <Icon name={iconLeft} size={s.icon} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={s.icon} /> : null}
    </button>
  );
}
