import React from "react";
import { Icon } from "../core/Icon.jsx";

/** Centred modal over a dimmed scrim. */
export function Dialog({ open, title, description, footer, onClose, width = 460, children, style, ...rest }) {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 60, display: "grid", placeItems: "center",
      background: "var(--surface-overlay)", backdropFilter: "blur(3px)",
      animation: "bvFade var(--dur-fast) var(--ease-standard)",
    }} onClick={onClose}>
      <style>{"@keyframes bvFade{from{opacity:0}to{opacity:1}}@keyframes bvPop{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}"}</style>
      <div onClick={(e) => e.stopPropagation()} style={{
        width, maxWidth: "92vw", background: "var(--surface-card)", borderRadius: "var(--radius-block)",
        boxShadow: "var(--shadow-xl)", padding: 28, display: "grid", gap: 18,
        animation: "bvPop var(--dur-base) var(--ease-out)", ...style,
      }} {...rest}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, display: "grid", gap: 6 }}>
            <div style={{ font: "var(--type-h3)", color: "var(--text-heading)" }}>{title}</div>
            {description ? <div style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>{description}</div> : null}
          </div>
          {onClose ? <button onClick={onClose} aria-label="Close" style={{ border: 0, background: "none", cursor: "pointer", color: "var(--text-faint)", display: "flex" }}><Icon name="x" size={18} /></button> : null}
        </div>
        {children}
        {footer ? <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>{footer}</div> : null}
      </div>
    </div>
  );
}
