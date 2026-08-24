const { Logo, Button, Badge, Card, Icon } = window.BlynkVirtualDesignSystem_efba8f || {};

function LogoStrip() {
  return (
    <section style={{ borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-sunken)", padding: "34px 40px" }}>
      <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", display: "flex", alignItems: "center", gap: 40 }}>
        <div style={{ font: "var(--type-body-sm)", color: "var(--text-faint)", whiteSpace: "nowrap" }}>Trusted on the floor at</div>
        <div style={{ display: "flex", gap: 16, flex: 1 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ flex: 1, height: 34, borderRadius: "var(--radius-sm)", background: "var(--neutral-100)", display: "grid", placeItems: "center", font: "var(--type-mono)", fontSize: 9, color: "var(--text-faint)" }}>customer mark</div>
          ))}
        </div>
      </div>
    </section>
  );
}

window.LogoStrip = LogoStrip;
