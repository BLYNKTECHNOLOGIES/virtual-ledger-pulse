import React from "react";
import { Icon } from "../core/Icon.jsx";

/** Text input — 40px tall, 10px radius, cyan focus ring. */
export function Input({ iconLeft, invalid, disabled, size = "md", style, ...rest }) {
  const [foc, setFoc] = React.useState(false);
  const h = size === "sm" ? "var(--control-h-sm)" : size === "lg" ? "var(--control-h-lg)" : "var(--control-h)";
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%" }}>
      {iconLeft ? <span style={{ position: "absolute", left: 12, color: "var(--text-faint)", display: "flex" }}><Icon name={iconLeft} size={16} /></span> : null}
      <input
        disabled={disabled}
        onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
        style={{
          width: "100%", height: h, padding: iconLeft ? "0 12px 0 36px" : "0 12px",
          borderRadius: "var(--radius-control)", fontFamily: "var(--font-sans)",
          fontSize: "var(--text-sm)", color: "var(--text-heading)",
          background: disabled ? "var(--neutral-50)" : "var(--neutral-0)",
          border: `1px solid ${invalid ? "var(--danger-500)" : foc ? "var(--cyan-500)" : "var(--border-default)"}`,
          boxShadow: foc ? "var(--ring-focus)" : "none", outline: "none",
          transition: "var(--transition-control)", opacity: disabled ? .6 : 1, ...style,
        }}
        {...rest}
      />
    </div>
  );
}
