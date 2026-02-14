import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Zap, Settings2, Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAutoAssignment } from '@/hooks/useAutoAssignment';

export function AutoAssignmentSettings() {
  const { fetchConfig, updateConfig } = useAutoAssignment();
  const [config, setConfig] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    setIsLoading(true);
    const c = await fetchConfig();
    setConfig(c);
    setIsLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      await updateConfig({
        is_enabled: config.is_enabled,
        assignment_strategy: config.assignment_strategy,
        max_orders_per_operator: config.max_orders_per_operator,
        consider_specialization: config.consider_specialization,
        consider_shift: config.consider_shift,
        consider_size_range: config.consider_size_range,
        consider_exchange_mapping: config.consider_exchange_mapping,
        cooldown_minutes: config.cooldown_minutes,
      });
      toast.success('Auto-assignment settings saved');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !config) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="flex justify-center py-12">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4 text-primary" />
          Auto-Assignment Engine
          <Badge variant={config.is_enabled ? 'default' : 'secondary'} className="text-[10px] ml-auto">
            {config.is_enabled ? 'Active' : 'Inactive'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Master Toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/10 border border-border">
          <div>
            <Label className="text-sm font-medium">Enable Auto-Assignment</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Automatically route new orders to eligible operators</p>
          </div>
          <Switch
            checked={config.is_enabled}
            onCheckedChange={(v) => setConfig({ ...config, is_enabled: v })}
          />
        </div>

        {/* Strategy */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Assignment Strategy</Label>
          <Select value={config.assignment_strategy} onValueChange={(v) => setConfig({ ...config, assignment_strategy: v })}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="least_workload">Least Workload First</SelectItem>
              <SelectItem value="round_robin">Round Robin</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Max Orders */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Max Orders Per Operator</Label>
          <Input
            type="number"
            min={1}
            max={50}
            value={config.max_orders_per_operator}
            onChange={(e) => setConfig({ ...config, max_orders_per_operator: parseInt(e.target.value) || 10 })}
            className="h-9 text-xs"
          />
        </div>

        {/* Cooldown */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Cooldown Between Assignments (minutes)</Label>
          <Input
            type="number"
            min={0}
            max={60}
            value={config.cooldown_minutes}
            onChange={(e) => setConfig({ ...config, cooldown_minutes: parseInt(e.target.value) || 0 })}
            className="h-9 text-xs"
          />
        </div>

        {/* Eligibility Filters */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Eligibility Filters</Label>
          </div>

          {[
            { key: 'consider_specialization', label: 'Match Specialization', desc: 'Buy orders → Purchase specialists, Sell → Sales' },
            { key: 'consider_shift', label: 'Check Shift Availability', desc: 'Only assign to operators on active shift' },
            { key: 'consider_size_range', label: 'Match Size Range', desc: 'Order amount must fall in operator\'s mapped range' },
            { key: 'consider_exchange_mapping', label: 'Match Exchange Account', desc: 'Operator must be mapped to the order\'s exchange' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg border border-border">
              <div>
                <Label className="text-xs">{label}</Label>
                <p className="text-[10px] text-muted-foreground">{desc}</p>
              </div>
              <Switch
                checked={config[key]}
                onCheckedChange={(v) => setConfig({ ...config, [key]: v })}
              />
            </div>
          ))}
        </div>

        <Button onClick={handleSave} disabled={isSaving} className="w-full h-9 text-xs">
          <Save className="h-3.5 w-3.5 mr-1.5" />
          {isSaving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </CardContent>
    </Card>
  );
}
