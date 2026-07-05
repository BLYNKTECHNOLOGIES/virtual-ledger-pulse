/**
 * AuroraBackdrop — presentational only.
 *
 * A calm, slow-drifting aurora gradient for the auth stage. Three large blurred
 * color fields (indigo / violet / cyan) breathe and drift at different speeds
 * over the near-black stage, layered under a soft grain-free vignette. No text,
 * no glyphs, never busy. Motion is CSS-only and fully disabled under
 * prefers-reduced-motion (the fields render as a static composition).
 */
export function AuroraBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden bg-[#08080C]">
      {/* drifting aurora fields */}
      <div className="aurora-field aurora-a" />
      <div className="aurora-field aurora-b" />
      <div className="aurora-field aurora-c" />
      {/* grounding vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,#08080C_100%)]" />
    </div>
  );
}
