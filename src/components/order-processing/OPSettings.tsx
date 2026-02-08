
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, IndianRupee, Users, ArrowUp, ArrowDown, Save, RefreshCw, Trash2 } from 'lucide-react';
import { defaultSettings, mockStaff } from './mockData';
import { useToast } from '@/hooks/use-toast';

export function OPSettings() {
  const [settings, setSettings] = useState(defaultSettings);
  const { toast } = useToast();

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...settings.rotationOrder];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setSettings({ ...settings, rotationOrder: newOrder });
  };

  const moveDown = (index: number) => {
    if (index === settings.rotationOrder.length - 1) return;
    const newOrder = [...settings.rotationOrder];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    setSettings({ ...settings, rotationOrder: newOrder });
  };

  const removeFromRotation = (name: string) => {
    setSettings({ ...settings, rotationOrder: settings.rotationOrder.filter(n => n !== name) });
  };

  const hasGap = settings.smallOrderMax < settings.largeOrderMin;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-amber-500/10 rounded-xl">
          <Settings className="h-6 w-6 text-amber-500" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground">System Settings</h2>
          <p className="text-sm text-muted-foreground">Configure order thresholds and staff rotation</p>
        </div>
      </div>

      {/* Thresholds */}
      <Card className="bg-card border-border shadow-none">
        <CardContent className="pt-6 space-y-6">
          <div className="flex items-center gap-2">
            <IndianRupee className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold text-foreground">Order Thresholds</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label className="text-foreground text-sm font-medium">Small Order Maximum (₹)</Label>
              <p className="text-xs text-muted-foreground mb-2">Orders below this amount are classified as "Small"</p>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground">₹</span>
                <Input
                  type="number"
                  value={settings.smallOrderMax}
                  onChange={(e) => setSettings({ ...settings, smallOrderMax: Number(e.target.value) })}
                  className="pl-7 bg-muted border-border text-foreground h-11"
                />
              </div>
            </div>
            <div>
              <Label className="text-foreground text-sm font-medium">Large Order Minimum (₹)</Label>
              <p className="text-xs text-muted-foreground mb-2">Orders above this amount are classified as "Large"</p>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground">₹</span>
                <Input
                  type="number"
                  value={settings.largeOrderMin}
                  onChange={(e) => setSettings({ ...settings, largeOrderMin: Number(e.target.value) })}
                  className="pl-7 bg-muted border-border text-foreground h-11"
                />
              </div>
            </div>
          </div>
          {hasGap && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                <strong>Note:</strong> There's a gap between ₹{settings.smallOrderMax.toLocaleString('en-IN')} and ₹{settings.largeOrderMin.toLocaleString('en-IN')}. Orders in this range won't be classified.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rotation */}
      <Card className="bg-card border-border shadow-none">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold text-foreground">Large Order Staff Rotation</h3>
          </div>
          <p className="text-sm text-muted-foreground">Configure the round-robin order for assigning large orders to staff members. Drag to reorder or toggle to include/exclude staff from rotation.</p>

          <div className="space-y-3">
            {settings.rotationOrder.map((name, index) => (
              <div key={name} className="flex items-center gap-3 bg-muted rounded-xl p-4 border border-border">
                <div className="w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-500 dark:text-amber-400 font-bold text-sm border border-amber-500/20">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">{name} (Large Sales)</p>
                  <p className="text-xs text-muted-foreground">{name.toLowerCase().replace(' ', '')}@binance.com</p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="outline" className="h-8 w-8 border-border text-muted-foreground hover:bg-accent" onClick={() => moveUp(index)}>
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="outline" className="h-8 w-8 border-border text-muted-foreground hover:bg-accent" onClick={() => moveDown(index)}>
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="outline" className="h-8 w-8 border-red-700/60 text-red-500 dark:text-red-400 hover:bg-red-500/10" onClick={() => removeFromRotation(name)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" className="border-border text-muted-foreground hover:bg-accent gap-2" onClick={() => setSettings(defaultSettings)}>
          <RefreshCw className="h-4 w-4" /> Reset
        </Button>
        <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-2" onClick={() => toast({ title: 'Settings saved successfully' })}>
          <Save className="h-4 w-4" /> Save Settings
        </Button>
      </div>
    </div>
  );
}
