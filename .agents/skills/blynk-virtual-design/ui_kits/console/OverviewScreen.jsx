const DS = window.BlynkVirtualDesignSystem_efba8f || {};
const { Logo, Button, IconButton, Badge, Tag, Card, Icon, SideNav, TopBar, Tabs, Alert, Toast, Tooltip, Dialog, Spinner, Field, Input, Select, Checkbox, Switch, Radio, Textarea } = DS;

const KPIS = [
  { label: "Devices reporting", value: "412", of: "/ 418", tone: "success", delta: "+6 today" },
  { label: "Ingest rate", value: "24.8k", of: "msg/min", tone: "brand", delta: "steady" },
  { label: "Open alerts", value: "3", of: "", tone: "warning", delta: "1 critical" },
  { label: "Firmware current", value: "98.6", of: "%", tone: "brand", delta: "6 behind" },
];

const ACTIVITY = [
  ["check-circle", "Firmware 4.2.1 rolled out to 412 devices", "12 min ago"],
  ["cpu", "Gateway-HAM-07 provisioned by m.keller", "48 min ago"],
  ["bell-ring", "Alert: HAM-04 unreachable", "1 h ago"],
  ["workflow", "Automation “night throttle” enabled", "3 h ago"],
];

function OverviewScreen() {
  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 1180 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
        {KPIS.map((k) => (
          <Card key={k.label} padding={20}>
            <div style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>{k.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 10 }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-2xl)", color: "var(--text-heading)", letterSpacing: "-.02em" }}>{k.value}</span>
              <span style={{ font: "var(--type-body-sm)", color: "var(--text-faint)" }}>{k.of}</span>
            </div>
            <div style={{ marginTop: 12 }}><Badge tone={k.tone} dot>{k.delta}</Badge></div>
          </Card>
        ))}
      </div>
      <Alert tone="warning" title="6 gateways are behind on firmware" onDismiss={() => {}}>
        They are still on 4.1.2. Schedule a rollout window from the Devices view.
      </Alert>
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}>
        <Card padding={24}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h3 style={{ fontSize: "var(--text-lg)", flex: 1 }}>Ingest — last 24 h</h3>
            <Tag selected>24 h</Tag><Tag>7 d</Tag>
          </div>
          <div style={{ marginTop: 20, display: "flex", alignItems: "flex-end", gap: 5, height: 150 }}>
            {[38,44,41,52,60,57,49,63,71,66,58,62,74,81,76,69,72,84,79,73,68,77,86,82].map((v, i) => (
              <div key={i} style={{ flex: 1, height: v + "%", borderRadius: "3px 3px 0 0", background: i > 20 ? "var(--cyan-500)" : "var(--cyan-200)" }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, font: "var(--type-mono)", fontSize: 10, color: "var(--text-faint)" }}>
            <span>00:00</span><span>08:00</span><span>16:00</span><span>now</span>
          </div>
        </Card>
        <Card padding={24}>
          <h3 style={{ fontSize: "var(--text-lg)" }}>Activity</h3>
          <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
            {ACTIVITY.map(([icon, text, when]) => (
              <div key={text} style={{ display: "flex", gap: 11 }}>
                <span style={{ color: "var(--cyan-600)", display: "flex", marginTop: 1 }}><Icon name={icon} size={16} /></span>
                <div style={{ flex: 1 }}>
                  <div style={{ font: "var(--type-body-sm)", color: "var(--text-body)" }}>{text}</div>
                  <div style={{ font: "var(--type-mono)", fontSize: 10, color: "var(--text-faint)", marginTop: 3 }}>{when}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
window.OverviewScreen = OverviewScreen;
