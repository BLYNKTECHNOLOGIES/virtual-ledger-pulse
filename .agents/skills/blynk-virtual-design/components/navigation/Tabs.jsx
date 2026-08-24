import React from "react";

/** Underline tab bar. Active tab carries a 2px cyan rule. */
export function Tabs({ items = [], value, onChange, style, ...rest }) {
  return (
    <div style={{ display: "flex", gap: 24, borderBottom: "1px solid var(--border-default)", ...style }} {...rest}>
      {items.map((it) => {
        const id = typeof it === "string" ? it : it.value;
        const label = typeof it === "string" ? it : it.label;
        const active = id === value;
        return (
          <button key={id} onClick={() => onChange && onChange(id)}
            style={{
              background: "none", border: 0, padding: "0 0 12px", cursor: "pointer",
              fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)",
              fontWeight: active ? "var(--weight-semibold)" : "var(--weight-medium)",
              color: active ? "var(--text-heading)" : "var(--text-muted)",
              boxShadow: active ? "inset 0 -2px 0 var(--cyan-500)" : "none",
              transition: "var(--transition-control)",
            }}>{label}</button>
        );
      })}
    </div>
  );
}
