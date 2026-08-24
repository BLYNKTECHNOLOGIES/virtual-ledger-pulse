const { Logo, Button, Badge, Card, Icon } = window.BlynkVirtualDesignSystem_efba8f || {};

function Hero() {
  return (
    <section style={{ background: "var(--surface-inverse)", color: "var(--text-on-inverse)", padding: "104px 40px 96px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(1100px 520px at 78% -8%, rgba(0,180,232,.22), transparent 62%)" }} />
      <div style={{ position: "relative", maxWidth: "var(--container-max)", margin: "0 auto", display: "grid", gridTemplateColumns: "1.05fr .95fr", gap: 64, alignItems: "center" }}>
        <div style={{ display: "grid", gap: 22, justifyItems: "start" }}>
          <Badge tone="brand" dot>Platform 4.2 is live</Badge>
          <h1 style={{ font: "var(--type-display)", color: "#fff", maxWidth: 620 }}>The connective layer for industrial hardware</h1>
          <p style={{ font: "var(--type-body)", fontSize: "var(--text-md)", color: "var(--text-on-inverse-muted)", maxWidth: 520 }}>
            Provision, monitor and update fleets of connected devices from one console — with the
            telemetry, access control and audit trail your operations team already expects.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
            <Button size="lg" iconRight="arrow-right">Request a demo</Button>
            <Button size="lg" variant="secondary" iconLeft="play" style={{ background: "rgba(255,255,255,.06)", borderColor: "var(--border-inverse)", color: "#fff" }}>Watch the tour</Button>
          </div>
        </div>
        <div style={{ borderRadius: "var(--radius-block)", overflow: "hidden", border: "1px solid var(--border-inverse)", background: "var(--surface-inverse-soft)", boxShadow: "var(--shadow-xl)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 14px", borderBottom: "1px solid var(--border-inverse)" }}>
            {["#F58A7C", "#E5C05B", "#5BD79B"].map((c) => <span key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />)}
            <span style={{ font: "var(--type-mono)", fontSize: 11, color: "var(--neutral-500)", marginLeft: 10 }}>console.blynkvirtual — fleet/hamburg</span>
          </div>
          <div style={{ padding: 20, display: "grid", gap: 12 }}>
            {[["Gateway-HAM-04", "27.4 °C", "online"], ["Gateway-HAM-05", "26.1 °C", "online"], ["Gateway-HAM-06", "—", "offline"]].map(([n, t, s]) => (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "rgba(255,255,255,.04)", border: "1px solid var(--border-inverse)" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: s === "online" ? "#5BD79B" : "#F58A7C" }} />
                <span style={{ font: "var(--type-mono)", fontSize: 12, color: "#fff", flex: 1 }}>{n}</span>
                <span style={{ font: "var(--type-mono)", fontSize: 12, color: "var(--cyan-300)" }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

window.Hero = Hero;
