import React from "react";

/** Indeterminate cyan ring. */
export function Spinner({ size = 20, tone = "brand", style, ...rest }) {
  const color = tone === "inverse" ? "rgba(255,255,255,.9)" : "var(--cyan-500)";
  return (
    <span style={{ display: "inline-flex", width: size, height: size, ...style }} {...rest}>
      <style>{"@keyframes bvSpin{to{transform:rotate(360deg)}}"}</style>
      <span style={{
        width: size, height: size, borderRadius: "50%",
        border: `${Math.max(2, Math.round(size / 10))}px solid ${tone === "inverse" ? "rgba(255,255,255,.2)" : "var(--cyan-100)"}`,
        borderTopColor: color, animation: "bvSpin var(--dur-slower) linear infinite",
      }} />
    </span>
  );
}
