import React from "react";

/** Multi-line text control, same border and focus language as Input. */
export function Textarea({ invalid, rows = 4, disabled, style, ...rest }) {
  const [foc, setFoc] = React.useState(false);
  return (
    <textarea
      rows={rows} disabled={disabled}
      onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
      style={{
        width: "100%", padding: "10px 12px", borderRadius: "var(--radius-control)",
        fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", lineHeight: "var(--leading-normal)",
        color: "var(--text-heading)", background: disabled ? "var(--neutral-50)" : "var(--neutral-0)",
        border: `1px solid ${invalid ? "var(--danger-500)" : foc ? "var(--cyan-500)" : "var(--border-default)"}`,
        boxShadow: foc ? "var(--ring-focus)" : "none", outline: "none", resize: "vertical",
        transition: "var(--transition-control)", ...style,
      }}
      {...rest}
    />
  );
}
