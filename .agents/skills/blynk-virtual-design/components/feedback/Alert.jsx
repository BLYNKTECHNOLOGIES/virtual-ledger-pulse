import React from "react";
import { Icon } from "../core/Icon.jsx";

const TONES = {
  info: { bg: "var(--cyan-50)", bd: "var(--cyan-200)", fg: "var(--cyan-700)", icon: "info" },
  success: { bg: "var(--success-100)", bd: "#A9E3C6", fg: "var(--success-700)", icon: "check-circle" },
  warning: { bg: "var(--warning-100)", bd: "#F2D79A", fg: "var(--warning-700)", icon: "alert-triangle" },
  danger: { bg: "var(--danger-100)", bd: "#F3B6B0", fg: "var(--danger-700)", icon: "octagon-alert" },
};

/** Inline banner for page- or section-level messages. */
export function Alert({ tone = "info", title, children, onDismiss, style, ...rest }) {
  const t = TONES[tone];
  return (
    <div style={{
      display: "flex", gap: 12, padding: "12px 14px", borderRadius: "var(--radius-md)",
      background: t.bg, border: `1px solid ${t.bd}`, ...style,
    }} {...rest}>
      <span style={{ color: t.fg, display: "flex", marginTop: 1 }}><Icon name={t.icon} size={18} /></span>
      <div style={{ flex: 1, display: "grid", gap: 2 }}>
        {title ? <div style={{ font: "var(--type-label)", color: t.fg }}>{title}</div> : null}
        {children ? <div style={{ font: "var(--type-body-sm)", color: "var(--text-body)" }}>{children}</div> : null}
      </div>
      {onDismiss ? <button onClick={onDismiss} aria-label="Dismiss" style={{ border: 0, background: "none", cursor: "pointer", color: t.fg, opacity: .7, display: "flex" }}><Icon name="x" size={16} /></button> : null}
    </div>
  );
}
