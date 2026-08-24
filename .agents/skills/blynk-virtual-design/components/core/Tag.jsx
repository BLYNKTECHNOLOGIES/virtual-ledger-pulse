import React from "react";
import { Icon } from "./Icon.jsx";

/** Removable, selectable filter chip. */
export function Tag({ selected, onRemove, children, style, ...rest }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, height: 28, padding: onRemove ? "0 6px 0 11px" : "0 11px",
      borderRadius: "var(--radius-sm)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)",
      fontWeight: "var(--weight-medium)", transition: "var(--transition-control)",
      background: selected ? "var(--cyan-50)" : "var(--neutral-50)",
      border: `1px solid ${selected ? "var(--cyan-300)" : "var(--border-default)"}`,
      color: selected ? "var(--cyan-700)" : "var(--text-body)", ...style,
    }} {...rest}>
      {children}
      {onRemove ? (
        <button onClick={onRemove} aria-label="Remove" style={{ display: "inline-flex", padding: 2, borderRadius: "var(--radius-xs)", background: "transparent", border: 0, cursor: "pointer", color: "inherit", opacity: .6 }}>
          <Icon name="x" size={13} />
        </button>
      ) : null}
    </span>
  );
}
