import React from "react";
import { Icon } from "../core/Icon.jsx";

/** Native select styled to match Input, with a Lucide chevron. */
export function Select({ options = [], invalid, disabled, style, ...rest }) {
  const [foc, setFoc] = React.useState(false);
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%" }}>
      <select
        disabled={disabled}
        onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
        style={{
          width: "100%", height: "var(--control-h)", padding: "0 36px 0 12px", appearance: "none",
          borderRadius: "var(--radius-control)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)",
          color: "var(--text-heading)", background: disabled ? "var(--neutral-50)" : "var(--neutral-0)",
          border: `1px solid ${invalid ? "var(--danger-500)" : foc ? "var(--cyan-500)" : "var(--border-default)"}`,
          boxShadow: foc ? "var(--ring-focus)" : "none", outline: "none", cursor: "pointer",
          transition: "var(--transition-control)", ...style,
        }}
        {...rest}
      >
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? o : o.label;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
      <span style={{ position: "absolute", right: 12, pointerEvents: "none", color: "var(--text-muted)", display: "flex" }}><Icon name="chevron-down" size={16} /></span>
    </div>
  );
}
