import React from "react";

/** Single radio control; render several with a shared name. */
export function Radio({ checked, onChange, label, value, disabled, style, ...rest }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .5 : 1, ...style }} {...rest}>
      <span
        onClick={() => !disabled && onChange && onChange(value)}
        style={{
          width: 18, height: 18, borderRadius: "50%", flex: "0 0 auto", display: "inline-flex",
          alignItems: "center", justifyContent: "center", background: "var(--neutral-0)",
          border: `1px solid ${checked ? "var(--cyan-500)" : "var(--border-strong)"}`,
          transition: "var(--transition-control)",
        }}
      >
        {checked ? <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--cyan-500)" }} /> : null}
      </span>
      {label ? <span style={{ font: "var(--type-body-sm)", color: "var(--text-body)" }}>{label}</span> : null}
    </label>
  );
}
