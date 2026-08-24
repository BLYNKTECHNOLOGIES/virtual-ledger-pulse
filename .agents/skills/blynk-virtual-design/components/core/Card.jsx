import React from "react";

/** The system's surface container: white, 14px radius, hairline border, soft cool shadow. */
export function Card({ tone = "default", padding = 24, interactive, children, style, ...rest }) {
  const [hov, setHov] = React.useState(false);
  const tones = {
    default: { background: "var(--surface-card)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" },
    flat: { background: "var(--surface-card)", border: "1px solid var(--border-default)", boxShadow: "none" },
    sunken: { background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)", boxShadow: "none" },
    inverse: { background: "var(--surface-inverse)", border: "1px solid var(--border-inverse)", boxShadow: "var(--shadow-lg)", color: "var(--text-on-inverse)" },
    brand: { background: "var(--cyan-500)", border: "1px solid var(--cyan-500)", boxShadow: "var(--shadow-brand)", color: "#fff" },
  }[tone];
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        borderRadius: "var(--radius-card)", padding,
        transition: "box-shadow var(--dur-base) var(--ease-standard), transform var(--dur-base) var(--ease-standard)",
        ...tones,
        ...(interactive && hov ? { boxShadow: "var(--shadow-md)", transform: "var(--lift-hover)", cursor: "pointer" } : null),
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
