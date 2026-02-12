import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAIReconciliationSetting } from "@/hooks/useAIReconciliationSetting";
import { useReconciliationScan } from "@/hooks/useReconciliationScan";
import { Brain, Shield, Clock, AlertTriangle, CheckCircle2, Settings2, Zap } from "lucide-react";
import { toast } from "sonner";

export function AISettingsTab() {
  const { isEnabled, isLoading, toggle } = useAIReconciliationSetting();
  const { lastScan, scanHistory } = useReconciliationScan();
  const [toggling, setToggling] = useState(false);

  const handleToggle = async (checked: boolean) => {
    setToggling(true);
    const success = await toggle(checked);
    setToggling(false);
    if (success) {
      toast.success(`AI Reconciliation ${checked ? 'enabled' : 'disabled'} for all users`);
    } else {
      toast.error('Failed to update setting');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Toggle Card */}
      <Card className="border-2 border-slate-200 shadow-lg overflow-hidden">
        <div className={`h-1.5 w-full ${isEnabled ? 'bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500' : 'bg-slate-300'} transition-colors duration-500`} />
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${isEnabled ? 'bg-gradient-to-br from-cyan-50 to-blue-50' : 'bg-slate-100'} transition-colors`}>
                <Brain className={`h-8 w-8 ${isEnabled ? 'text-cyan-600' : 'text-slate-400'} transition-colors`} />
              </div>
              <div>
                <CardTitle className="text-xl">AI Reconciliation Engine</CardTitle>
                <CardDescription className="mt-1">
                  Intelligent cross-referencing between Terminal and ERP data
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={isEnabled ? "default" : "secondary"} className={`${isEnabled ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                {isEnabled ? 'Active' : 'Inactive'}
              </Badge>
              <Switch
                checked={isEnabled}
                onCheckedChange={handleToggle}
                disabled={toggling}
                className="scale-125"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">System-wide Control</p>
              <p className="mt-1">When disabled, the AI Reconciliation tab is hidden for <strong>all users</strong> across the organization. No scans can be triggered and no findings are displayed.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Zap className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">14 Check Modules</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Orders, Finances, Balances, Movements, Conversions, Clients, Payments
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <Shield className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Advisory Only</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  All outputs are suggestive. No auto-posting or balance modifications.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <Settings2 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Feedback Loop</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Accept, Reject, or mark False Positive to improve accuracy over time.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Scan History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Recent Scan History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {scanHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No scans have been run yet</p>
          ) : (
            <div className="space-y-3">
              {scanHistory.slice(0, 5).map((scan: any) => (
                <div key={scan.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className={`h-4 w-4 ${scan.status === 'completed' ? 'text-emerald-500' : scan.status === 'failed' ? 'text-red-500' : 'text-amber-500'}`} />
                    <div>
                      <p className="text-sm font-medium">
                        {scan.findings_count} findings ({scan.critical_count || 0} critical)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        by {scan.triggered_by} • {new Date(scan.started_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {scan.duration_ms ? `${(scan.duration_ms / 1000).toFixed(1)}s` : '...'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
