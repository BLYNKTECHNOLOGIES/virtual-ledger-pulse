import React from "react";

/** Hover label on the ink surface. */
export function Tooltip({ label, placement = "top", children, style, ...rest }) {
  const [show, setShow] = React.useState(false);
  const pos = {
    top: { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
    bottom: { top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
    right: { left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" },
  }[placement];
  return (
    <span style={{ position: "relative", display: "inline-flex", ...style }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} {...rest}>
      {children}
      {show ? (
        <span style={{
          position: "absolute", ...pos, whiteSpace: "nowrap", zIndex: 40,
          background: "var(--surface-inverse)", color: "#fff", padding: "5px 9px",
          borderRadius: "var(--radius-sm)", fontFamily: "var(--font-sans)",
          fontSize: "var(--text-xs)", fontWeight: "var(--weight-medium)",
          boxShadow: "var(--shadow-md)", pointerEvents: "none",
        }}>{label}</span>
      ) : null}
    </span>
  );
}
