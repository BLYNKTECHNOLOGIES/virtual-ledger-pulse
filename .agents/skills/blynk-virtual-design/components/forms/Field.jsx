import React from "react";

/** Label + help/error wrapper for any control. */
export function Field({ label, hint, error, required, htmlFor, children, style, ...rest }) {
  return (
    <div style={{ display: "grid", gap: 6, ...style }} {...rest}>
      {label ? (
        <label htmlFor={htmlFor} style={{ font: "var(--type-label)", color: "var(--text-heading)" }}>
          {label}{required ? <span style={{ color: "var(--danger-500)", marginLeft: 3 }}>*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <div style={{ font: "var(--type-body-sm)", color: "var(--danger-700)" }}>{error}</div>
        : hint ? <div style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>{hint}</div> : null}
    </div>
  );
}
