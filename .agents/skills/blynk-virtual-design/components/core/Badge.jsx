import React from "react";
import { Icon } from "./Icon.jsx";

const TONES = {
  neutral: { background: "var(--neutral-100)", color: "var(--neutral-700)" },
  brand: { background: "var(--cyan-50)", color: "var(--cyan-700)" },
  success: { background: "var(--success-100)", color: "var(--success-700)" },
  warning: { background: "var(--warning-100)", color: "var(--warning-700)" },
  danger: { background: "var(--danger-100)", color: "var(--danger-700)" },
  ink: { background: "var(--neutral-1000)", color: "#fff" },
};

/** Small status pill. Optional leading dot for live/state readouts. */
export function Badge({ tone = "neutral", dot, icon, children, style, ...rest }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, height: 22, padding: "0 9px",
      borderRadius: "var(--radius-pill)", fontFamily: "var(--font-sans)", fontSize: "var(--text-xs)",
      fontWeight: "var(--weight-semibold)", letterSpacing: ".01em", ...TONES[tone], ...style,
    }} {...rest}>
      {dot ? <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} /> : null}
      {icon ? <Icon name={icon} size={13} /> : null}
      {children}
    </span>
  );
}
