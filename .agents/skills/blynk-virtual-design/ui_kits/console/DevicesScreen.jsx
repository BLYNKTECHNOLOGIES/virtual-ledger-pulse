const DS = window.BlynkVirtualDesignSystem_efba8f || {};
const { Logo, Button, IconButton, Badge, Tag, Card, Icon, SideNav, TopBar, Tabs, Alert, Toast, Tooltip, Dialog, Spinner, Field, Input, Select, Checkbox, Switch, Radio, Textarea } = DS;

const ROWS = [
  ["Gateway-HAM-04", "Hamburg", "4.1.2", "27.4 °C", "offline"],
  ["Gateway-HAM-05", "Hamburg", "4.2.1", "26.1 °C", "online"],
  ["Gateway-HAM-06", "Hamburg", "4.2.1", "25.8 °C", "online"],
  ["Sensor-ROT-118", "Rotterdam", "4.2.1", "19.2 °C", "online"],
  ["Sensor-ROT-119", "Rotterdam", "4.1.2", "19.6 °C", "degraded"],
  ["Edge-GEN-002", "Genoa", "4.2.1", "31.0 °C", "online"],
];
const TONE = { online: "success", offline: "danger", degraded: "warning" };

function DevicesScreen({ onToast }) {
  const [q, setQ] = React.useState("");
  const [site, setSite] = React.useState("All sites");
  const [sel, setSel] = React.useState([]);
  const [confirm, setConfirm] = React.useState(false);
  const rows = ROWS.filter((r) => (site === "All sites" || r[1] === site) && r[0].toLowerCase().includes(q.toLowerCase()));
  const toggle = (n) => setSel((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 1180 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ width: 260 }}><Input iconLeft="search" placeholder="Filter by name" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div style={{ width: 180 }}><Select options={["All sites", "Hamburg", "Rotterdam", "Genoa"]} value={site} onChange={(e) => setSite(e.target.value)} /></div>
        <div style={{ flex: 1 }} />
        {sel.length ? <Button variant="secondary" size="md" iconLeft="power" onClick={() => setConfirm(true)}>Reboot {sel.length}</Button> : null}
        <Button size="md" iconLeft="download" variant="ghost">Export</Button>
      </div>
      <Card padding={0} style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--surface-sunken)" }}>
              {["", "Device", "Site", "Firmware", "Reading", "Status", ""].map((h, i) => (
                <th key={i} style={{ textAlign: "left", padding: "11px 14px", fontFamily: "var(--font-display)", fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", borderBottom: "1px solid var(--border-default)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]}>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-subtle)" }}><Checkbox checked={sel.includes(r[0])} onChange={() => toggle(r[0])} /></td>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-subtle)", font: "var(--type-mono)", fontSize: 12, color: "var(--text-heading)" }}>{r[0]}</td>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-subtle)", font: "var(--type-body-sm)" }}>{r[1]}</td>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-subtle)", font: "var(--type-mono)", fontSize: 12, color: r[2] === "4.2.1" ? "var(--text-muted)" : "var(--warning-700)" }}>{r[2]}</td>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-subtle)", font: "var(--type-mono)", fontSize: 12, color: "var(--text-body)" }}>{r[3]}</td>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-subtle)" }}><Badge tone={TONE[r[4]]} dot>{r[4]}</Badge></td>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-subtle)", textAlign: "right" }}>
                  <Tooltip label="Reboot device"><IconButton icon="power" variant="ghost" size="sm" label="Reboot" onClick={() => { setSel([r[0]]); setConfirm(true); }} /></Tooltip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Dialog open={confirm} onClose={() => setConfirm(false)}
        title={`Reboot ${sel.length} device${sel.length === 1 ? "" : "s"}?`}
        description="Devices go offline for about 40 seconds. Queued telemetry is retained."
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
          <Button variant="danger" iconLeft="power" onClick={() => { setConfirm(false); onToast && onToast(`Reboot queued for ${sel.length} device${sel.length === 1 ? "" : "s"}`); setSel([]); }}>Reboot</Button></>} />
    </div>
  );
}
window.DevicesScreen = DevicesScreen;
