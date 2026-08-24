import React from "react";
import { Icon } from "../core/Icon.jsx";

/** Transient confirmation on the ink surface. Slides up, auto-dismisses. */
export function Toast({ tone = "default", icon, children, onDismiss, style, ...rest }) {
  const accent = { default: "var(--cyan-300)", success: "#5BD79B", danger: "#F58A7C" }[tone];
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 10, padding: "12px 14px",
      borderRadius: "var(--radius-md)", background: "var(--surface-inverse)",
      border: "1px solid var(--border-inverse)", boxShadow: "var(--shadow-xl)",
      color: "var(--text-on-inverse)", font: "var(--type-body-sm)",
      animation: "bvToastIn var(--dur-base) var(--ease-out)", ...style,
    }} {...rest}>
      <style>{"@keyframes bvToastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}"}</style>
      {icon ? <span style={{ color: accent, display: "flex" }}><Icon name={icon} size={17} /></span> : null}
      <span style={{ flex: 1 }}>{children}</span>
      {onDismiss ? <button onClick={onDismiss} aria-label="Dismiss" style={{ border: 0, background: "none", cursor: "pointer", color: "var(--neutral-400)", display: "flex" }}><Icon name="x" size={15} /></button> : null}
    </div>
  );
}
