const { Logo, Button, Badge, Card, Icon } = window.BlynkVirtualDesignSystem_efba8f || {};

function SiteHeader({ onNav }) {
  const links = ["Platform", "Solutions", "Developers", "Company"];
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", gap: 32, height: 72, padding: "0 40px", background: "var(--glass-fill)", backdropFilter: "var(--blur-glass)", borderBottom: "1px solid var(--border-subtle)" }}>
      <Logo height={26} assetBase="../.." />
      <nav style={{ display: "flex", gap: 26 }}>
        {links.map((l) => (
          <a key={l} href="#" onClick={(e) => { e.preventDefault(); onNav && onNav(l); }}
            style={{ font: "var(--type-body-sm)", fontWeight: "var(--weight-semibold)", color: "var(--text-body)", textDecoration: "none" }}>{l}</a>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <a href="#" style={{ font: "var(--type-body-sm)", fontWeight: "var(--weight-semibold)", color: "var(--text-body)", textDecoration: "none" }}>Sign in</a>
      <Button size="sm" iconRight="arrow-right">Request a demo</Button>
    </header>
  );
}

window.SiteHeader = SiteHeader;
