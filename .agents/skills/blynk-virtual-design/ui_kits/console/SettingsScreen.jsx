const DS = window.BlynkVirtualDesignSystem_efba8f || {};
const { Logo, Button, IconButton, Badge, Tag, Card, Icon, SideNav, TopBar, Tabs, Alert, Toast, Tooltip, Dialog, Spinner, Field, Input, Select, Checkbox, Switch, Radio, Textarea } = DS;

function SettingsScreen({ onToast }) {
  const [tab, setTab] = React.useState("General");
  const [auto, setAuto] = React.useState(true);
  const [digest, setDigest] = React.useState(false);
  const [poll, setPoll] = React.useState("hourly");
  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 760 }}>
      <Tabs items={["General", "Notifications", "API keys", "Members"]} value={tab} onChange={setTab} />
      <Card padding={28}>
        <h3 style={{ fontSize: "var(--text-lg)" }}>Workspace</h3>
        <div style={{ display: "grid", gap: 18, marginTop: 20 }}>
          <Field label="Workspace name" hint="Shown in the console header and on exports."><Input defaultValue="Northern Terminals" /></Field>
          <Field label="Default site"><Select options={["Hamburg", "Rotterdam", "Genoa"]} defaultValue="Hamburg" /></Field>
          <Field label="Polling interval">
            <div style={{ display: "flex", gap: 20, paddingTop: 4 }}>
              <Radio value="hourly" checked={poll === "hourly"} onChange={setPoll} label="Hourly" />
              <Radio value="daily" checked={poll === "daily"} onChange={setPoll} label="Daily" />
            </div>
          </Field>
          <Field label="Provisioning notes"><Textarea rows={3} placeholder="Anything an engineer on site should know." /></Field>
        </div>
      </Card>
      <Card padding={28}>
        <h3 style={{ fontSize: "var(--text-lg)" }}>Automation</h3>
        <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
          <Switch checked={auto} onChange={setAuto} label="Auto-provision new gateways" />
          <Checkbox checked={digest} onChange={setDigest} label="Send me a weekly fleet digest" />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <Button onClick={() => onToast && onToast("Settings saved")}>Save changes</Button>
          <Button variant="ghost">Discard</Button>
        </div>
      </Card>
    </div>
  );
}
window.SettingsScreen = SettingsScreen;
