import React from "react";

const ASSETS = {
  full: "/assets/blynk-logo-horizontal.png",
  fullWhite: "/assets/blynk-logo-horizontal-white.png",
  mark: "/assets/blynk-mark.png",
};

/** Official Blynk Virtual Technologies lockup. Raster artwork as supplied by the brand. */
export function Logo({ variant = "full", tone = "dark", height = 32, assetBase = "..", alt = "Blynk Virtual Technologies", style, ...rest }) {
  const key = variant === "mark" ? "mark" : tone === "light" ? "fullWhite" : "full";
  return (
    <img
      src={assetBase + ASSETS[key]}
      alt={alt}
      style={{ height, width: "auto", display: "block", ...style }}
      {...rest}
    />
  );
}
