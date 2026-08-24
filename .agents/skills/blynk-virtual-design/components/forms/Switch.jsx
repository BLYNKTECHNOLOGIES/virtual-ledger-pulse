import React from "react";

/** Pill toggle for instant-effect settings. */
export function Switch({ checked, onChange, label, disabled, style, ...rest }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .5 : 1, ...style }} {...rest}>
      <span
        onClick={() => !disabled && onChange && onChange(!checked)}
        style={{
          width: 40, height: 22, borderRadius: "var(--radius-pill)", padding: 2, flex: "0 0 auto",
          background: checked ? "var(--cyan-500)" : "var(--neutral-200)",
          transition: "background-color var(--dur-base) var(--ease-standard)", display: "flex",
        }}
      >
        <span style={{
          width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "var(--shadow-xs)",
          transform: checked ? "translateX(18px)" : "translateX(0)",
          transition: "transform var(--dur-base) var(--ease-out)",
        }} />
      </span>
      {label ? <span style={{ font: "var(--type-body-sm)", color: "var(--text-body)" }}>{label}</span> : null}
    </label>
  );
}
