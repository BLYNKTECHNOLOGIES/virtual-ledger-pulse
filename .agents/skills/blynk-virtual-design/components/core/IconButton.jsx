import React from "react";
import { Icon } from "./Icon.jsx";

const SIZES = { sm: 32, md: 40, lg: 48 };

/** Square icon-only control for toolbars and card affordances. */
export function IconButton({ icon, size = "md", variant = "secondary", label, disabled, style, ...rest }) {
  const [hov, setHov] = React.useState(false);
  const d = SIZES[size] || 40;
  const base = {
    secondary: { background: "var(--neutral-0)", border: "1px solid var(--border-default)", color: "var(--text-body)" },
    ghost: { background: "transparent", border: "1px solid transparent", color: "var(--text-muted)" },
    primary: { background: "var(--cyan-500)", border: "1px solid var(--cyan-500)", color: "#fff" },
    inverse: { background: "rgba(255,255,255,.08)", border: "1px solid var(--border-inverse)", color: "#fff" },
  }[variant];
  const hover = {
    secondary: { background: "var(--neutral-50)", borderColor: "var(--border-strong)", color: "var(--text-heading)" },
    ghost: { background: "var(--hover-tint)", color: "var(--text-brand)" },
    primary: { background: "var(--cyan-600)", borderColor: "var(--cyan-600)" },
    inverse: { background: "rgba(255,255,255,.16)" },
  }[variant];
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: d, height: d, display: "inline-flex", alignItems: "center", justifyContent: "center",
        borderRadius: "var(--radius-control)", cursor: disabled ? "not-allowed" : "pointer",
        transition: "var(--transition-control)", opacity: disabled ? 0.42 : 1,
        ...base, ...(hov && !disabled ? hover : null), ...style,
      }}
      {...rest}
    >
      <Icon name={icon} size={size === "sm" ? 16 : size === "lg" ? 22 : 18} />
    </button>
  );
}
