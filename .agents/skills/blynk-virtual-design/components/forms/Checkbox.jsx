import React from "react";
import { Icon } from "../core/Icon.jsx";

/** Checkbox with a 6px-radius box and cyan checked fill. */
export function Checkbox({ checked, onChange, label, disabled, style, ...rest }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .5 : 1, ...style }} {...rest}>
      <span
        onClick={() => !disabled && onChange && onChange(!checked)}
        style={{
          width: 18, height: 18, borderRadius: "var(--radius-sm)", display: "inline-flex",
          alignItems: "center", justifyContent: "center", flex: "0 0 auto",
          background: checked ? "var(--cyan-500)" : "var(--neutral-0)",
          border: `1px solid ${checked ? "var(--cyan-500)" : "var(--border-strong)"}`,
          color: "#fff", transition: "var(--transition-control)",
        }}
      >
        {checked ? <Icon name="check" size={13} strokeWidth={3} /> : null}
      </span>
      {label ? <span style={{ font: "var(--type-body-sm)", color: "var(--text-body)" }}>{label}</span> : null}
    </label>
  );
}
