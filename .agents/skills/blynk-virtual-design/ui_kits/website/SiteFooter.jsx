const { Logo, Button, Badge, Card, Icon } = window.BlynkVirtualDesignSystem_efba8f || {};

const COLS = {
  Platform: ["Provisioning", "Telemetry", "Automations", "API"],
  Company: ["About", "Careers", "Press", "Contact"],
  Resources: ["Docs", "Status", "Changelog", "Security"],
};

function SiteFooter() {
  return (
    <footer style={{ background: "var(--surface-inverse)", color: "var(--text-on-inverse-muted)", padding: "56px 40px 34px" }}>
      <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", display: "grid", gridTemplateColumns: "1.4fr repeat(3,1fr)", gap: 40 }}>
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <Logo tone="light" height={26} assetBase="../.." />
          <p style={{ font: "var(--type-body-sm)", color: "var(--neutral-400)", maxWidth: 280 }}>The connective layer for industrial hardware.</p>
        </div>
        {Object.entries(COLS).map(([head, items]) => (
          <div key={head} style={{ display: "grid", gap: 10, alignContent: "start" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xs)", fontWeight: "var(--weight-bold)", letterSpacing: "var(--tracking-eyebrow)", textTransform: "uppercase", color: "#fff" }}>{head}</div>
            {items.map((i) => <a key={i} href="#" style={{ font: "var(--type-body-sm)", color: "var(--neutral-400)", textDecoration: "none" }}>{i}</a>)}
          </div>
        ))}
      </div>
      <div style={{ maxWidth: "var(--container-max)", margin: "40px auto 0", paddingTop: 20, borderTop: "1px solid var(--border-inverse)", display: "flex", gap: 20, font: "var(--type-body-sm)", color: "var(--neutral-500)" }}>
        <span>© 2026 Blynk Virtual Technologies</span><span style={{ flex: 1 }} /><span>Privacy</span><span>Terms</span>
      </div>
    </footer>
  );
}

window.SiteFooter = SiteFooter;
