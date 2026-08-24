import React from "react";
import { Icon } from "../core/Icon.jsx";

/** Ink app rail: brand mark at the top, icon+label items, cyan active state. */
export function SideNav({ items = [], value, onChange, footer, width = 232, style, ...rest }) {
  return (
    <nav style={{
      width, background: "var(--surface-inverse)", color: "var(--text-on-inverse)",
      display: "flex", flexDirection: "column", padding: "20px 12px", gap: 4, ...style,
    }} {...rest}>
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button key={it.value} onClick={() => onChange && onChange(it.value)}
            style={{
              display: "flex", alignItems: "center", gap: 12, height: 40, padding: "0 12px",
              borderRadius: "var(--radius-control)", border: 0, cursor: "pointer", textAlign: "left",
              background: active ? "rgba(0,180,232,.16)" : "transparent",
              color: active ? "var(--cyan-300)" : "var(--neutral-300)",
              fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)",
              fontWeight: active ? "var(--weight-semibold)" : "var(--weight-medium)",
              transition: "var(--transition-control)",
            }}>
            <Icon name={it.icon} size={18} />
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.badge ? <span style={{ font: "var(--type-mono)", fontSize: 11, color: "var(--neutral-400)" }}>{it.badge}</span> : null}
          </button>
        );
      })}
      <div style={{ flex: 1 }} />
      {footer}
    </nav>
  );
}
