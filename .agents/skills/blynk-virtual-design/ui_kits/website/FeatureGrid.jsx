const { Logo, Button, Badge, Card, Icon } = window.BlynkVirtualDesignSystem_efba8f || {};

const FEATURES = [
  { icon: "cpu", title: "Fleet provisioning", body: "Zero-touch onboarding for gateways, sensors and edge nodes — one manifest, any site." },
  { icon: "activity", title: "Live telemetry", body: "Sub-second streams with retention you control, queryable from the console or the API." },
  { icon: "shield-check", title: "Access & audit", body: "Role-scoped access down to a single device, with an immutable trail of every command." },
];

function FeatureGrid() {
  return (
    <section style={{ padding: "var(--section-y) 40px", maxWidth: "var(--container-max)", margin: "0 auto" }}>
      <div className="bv-eyebrow">PLATFORM</div>
      <h2 style={{ marginTop: 12, maxWidth: 620 }}>Everything between the device and the dashboard</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20, marginTop: 40 }}>
        {FEATURES.map((f) => (
          <Card key={f.title} padding={28} interactive>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 46, height: 46, borderRadius: "var(--radius-md)", background: "var(--cyan-50)", color: "var(--cyan-600)" }}>
              <Icon name={f.icon} size={22} />
            </span>
            <h3 style={{ marginTop: 18, fontSize: "var(--text-lg)" }}>{f.title}</h3>
            <p style={{ font: "var(--type-body-sm)", color: "var(--text-muted)", marginTop: 8 }}>{f.body}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

window.FeatureGrid = FeatureGrid;
