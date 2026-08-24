import React from "react";

const LUCIDE_SRC = "https://unpkg.com/lucide@0.451.0/dist/umd/lucide.js";
let loader = null;
function loadLucide() {
  if (window.lucide) return Promise.resolve(window.lucide);
  if (!loader) {
    loader = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = LUCIDE_SRC; s.onload = () => res(window.lucide); s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  return loader;
}

/** Lucide glyph wrapper. Blynk uses Lucide at 1.75px stroke on a 20px box. */
export function Icon({ name, size = 20, strokeWidth = 1.75, color = "currentColor", style, ...rest }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    let dead = false;
    loadLucide().then((l) => {
      if (dead || !ref.current || !l) return;
      const pascal = name.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("");
      const node = l.icons?.[pascal] || l.icons?.[name];
      if (!node) return;
      ref.current.innerHTML = "";
      ref.current.appendChild(l.createElement(node));
      const svg = ref.current.firstChild;
      if (svg) {
        svg.setAttribute("width", size); svg.setAttribute("height", size);
        svg.setAttribute("stroke-width", strokeWidth); svg.setAttribute("stroke", "currentColor");
        svg.style.display = "block";
      }
    });
    return () => { dead = true; };
  }, [name, size, strokeWidth]);
  return <span ref={ref} aria-hidden="true" style={{ display: "inline-flex", width: size, height: size, color, flex: "0 0 auto", ...style }} {...rest} />;
}
