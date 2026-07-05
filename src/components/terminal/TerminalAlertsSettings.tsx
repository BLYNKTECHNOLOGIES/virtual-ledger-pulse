import { useEffect, useState } from 'react';
import { Bell, BellOff, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  getAlertPrefs, setAlertPrefs, subscribeAlertPrefs, requestNotificationPermission,
  type AlertPrefs,
} from '@/lib/terminal-alerts';

export function TerminalAlertsSettings() {
  const [prefs, setPrefs] = useState<AlertPrefs>(() => getAlertPrefs());
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );

  useEffect(() => subscribeAlertPrefs(() => setPrefs(getAlertPrefs())), []);

  const update = (patch: Partial<AlertPrefs>) => {
    const next = { ...getAlertPrefs(), ...patch };
    setAlertPrefs(next);
    setPrefs(next);
  };

  const Row = ({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) => (
    <div className="flex items-center justify-between py-1.5">
      <span className={`text-[11px] ${disabled ? 'text-muted-foreground/50' : 'text-foreground'}`}>{label}</span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} className="scale-90" />
    </div>
  );

  const muted = !prefs.master;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent"
          aria-label="Alert settings"
          title="Alert sounds & notifications"
        >
          {muted ? <BellOff className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0 t-scale-in">
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border">
          <Bell className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold">Alerts</span>
        </div>
        <div className="px-3 py-2">
          <Row label="All alerts" checked={prefs.master} onChange={(v) => update({ master: v })} />
          <div className="h-px bg-border my-1" />
          <Row label="New orders" checked={prefs.orders} disabled={muted} onChange={(v) => update({ orders: v })} />
          <Row label="New messages" checked={prefs.messages} disabled={muted} onChange={(v) => update({ messages: v })} />
          <Row label="New appeals" checked={prefs.appeals} disabled={muted} onChange={(v) => update({ appeals: v })} />
        </div>
        <div className="px-3 py-2 border-t border-border">
          {permission === 'granted' ? (
            <p className="text-[10px] text-success">Desktop notifications enabled</p>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-full text-[11px]"
              onClick={async () => setPermission(await requestNotificationPermission())}
            >
              Enable notifications
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
