const DS = window.BlynkVirtualDesignSystem_efba8f || {};
const { Logo, Button, IconButton, Badge, Tag, Card, Icon, SideNav, TopBar, Tabs, Alert, Toast, Tooltip, Dialog, Spinner, Field, Input, Select, Checkbox, Switch, Radio, Textarea } = DS;

const NAV = [
  { value: "overview", label: "Overview", icon: "layout-dashboard" },
  { value: "devices", label: "Devices", icon: "cpu", badge: 418 },
  { value: "alerts", label: "Alerts", icon: "bell-ring", badge: 3 },
  { value: "automations", label: "Automations", icon: "workflow" },
  { value: "settings", label: "Settings", icon: "settings" },
];

const TITLES = {
  overview: { title: "Overview", crumb: ["Fleet"] },
  devices: { title: "Devices", crumb: ["Fleet", "Hamburg"] },
  alerts: { title: "Alerts", crumb: ["Fleet"] },
  automations: { title: "Automations", crumb: ["Fleet"] },
  settings: { title: "Settings", crumb: ["Account"] },
};

function Shell({ view, onView, actions, children }) {
  const t = TITLES[view] || TITLES.overview;
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--surface-page)" }}>
      <SideNav value={view} onChange={onView} items={NAV} style={{ position: "sticky", top: 0, height: "100vh" }}
        footer={
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderTop: "1px solid var(--border-inverse)" }}>
            <Logo variant="mark" height={20} assetBase="../.." />
            <div style={{ font: "var(--type-mono)", fontSize: 10, color: "var(--neutral-500)" }}>v4.2.1</div>
          </div>
        } />
      <div style={{ flex: 1, minWidth: 0 }}>
        <TopBar title={t.title} breadcrumb={t.crumb} onSearch={() => {}} actions={actions} />
        <main style={{ padding: "28px 32px 48px" }}>{children}</main>
      </div>
    </div>
  );
}
window.Shell = Shell;
