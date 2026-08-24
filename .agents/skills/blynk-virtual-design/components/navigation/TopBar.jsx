import React from "react";
import { Icon } from "../core/Icon.jsx";

/** Sticky page header: title, optional breadcrumb, search slot and actions. */
export function TopBar({ title, breadcrumb = [], actions, onSearch, style, ...rest }) {
  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 16, height: 64, padding: "0 24px",
      background: "var(--glass-fill)", backdropFilter: "var(--blur-glass)",
      borderBottom: "1px solid var(--border-subtle)", position: "sticky", top: 0, zIndex: 10, ...style,
    }} {...rest}>
      <div style={{ display: "grid", gap: 2 }}>
        {breadcrumb.length ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, font: "var(--type-body-sm)", fontSize: "var(--text-xs)", color: "var(--text-faint)" }}>
            {breadcrumb.map((b, i) => (
              <React.Fragment key={b}>
                {i ? <Icon name="chevron-right" size={12} /> : null}<span>{b}</span>
              </React.Fragment>
            ))}
          </div>
        ) : null}
        <div style={{ font: "var(--type-h3)", fontSize: "var(--text-md)", color: "var(--text-heading)" }}>{title}</div>
      </div>
      <div style={{ flex: 1 }} />
      {onSearch ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 12px", borderRadius: "var(--radius-pill)", background: "var(--neutral-50)", border: "1px solid var(--border-subtle)", color: "var(--text-faint)" }}>
          <Icon name="search" size={15} />
          <input onChange={(e) => onSearch(e.target.value)} placeholder="Search" style={{ border: 0, background: "none", outline: "none", font: "var(--type-body-sm)", width: 150, color: "var(--text-heading)" }} />
        </div>
      ) : null}
      {actions}
    </header>
  );
}
